/**
 * api/_dialer/budget.js — 3-tier budget guard.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.2.
 *
 * Tiers:
 *   - per session (in-memory counter, locked to a campaign)
 *   - per user per day (sum of cost_cents in dialer_calls/dialer_audit_log for that user today)
 *   - per organization per month (sum for the whole team this month)
 *
 * Return shape:
 *   { allowed, reason, budgetSessionCentsRemaining, budgetUserDayCentsRemaining,
 *     budgetOrgMonthCentsRemaining, alertLevel }
 *
 * alertLevel: 'ok' | 'warning' (>=80%) | 'exceeded'.
 *
 * This module is the SINGLE source of truth for budget decisions. Every dial,
 * every minute of recording, every AI call goes through here.
 */

const REASON = {
  OK: 'ok',
  WARNING: 'warning',
  SESSION_EXCEEDED: 'budget_exceeded_session',
  USER_EXCEEDED: 'budget_exceeded_user_day',
  ORG_EXCEEDED: 'budget_exceeded_org_month',
  DISABLED: 'dialer_disabled',
  DRY_RUN: 'dry_run',
};

/**
 * In-memory session counter (set by orchestrator when campaign starts).
 * Key: campaignId → { spentCents, startedAtIso }
 */
const sessionCounters = new Map();

export function startSessionBudget(campaignId, { limitCents } = {}) {
  sessionCounters.set(campaignId, {
    spentCents: 0,
    limitCents: limitCents ?? null,
    startedAt: new Date().toISOString(),
  });
}

export function addSessionCost(campaignId, costCents) {
  const counter = sessionCounters.get(campaignId);
  if (!counter) return;
  counter.spentCents += costCents;
}

export function endSessionBudget(campaignId) {
  sessionCounters.delete(campaignId);
}

export function getSessionSpent(campaignId) {
  return sessionCounters.get(campaignId)?.spentCents ?? 0;
}

/**
 * Check budget before a new action.
 * @param {object} params
 * @param {object} params.flags       - result of loadDialerFlags()
 * @param {string|null} params.campaignId - for session-level check
 * @param {number} params.requestedCostCents - what the next action will cost (estimate)
 * @param {number} params.userSpentTodayCents - sum from DB
 * @param {number} params.orgSpentMonthCents  - sum from DB
 * @returns {object} decision
 */
export function checkBudget({
  flags,
  campaignId = null,
  requestedCostCents,
  userSpentTodayCents = 0,
  orgSpentMonthCents = 0,
}) {
  if (!flags.enabled) {
    return {
      allowed: false,
      reason: REASON.DISABLED,
      alertLevel: 'ok',
      budgetSessionCentsRemaining: 0,
      budgetUserDayCentsRemaining: 0,
      budgetOrgMonthCentsRemaining: 0,
    };
  }

  if (flags.dryRun) {
    return {
      allowed: true,
      reason: REASON.DRY_RUN,
      alertLevel: 'ok',
      budgetSessionCentsRemaining: Number.MAX_SAFE_INTEGER,
      budgetUserDayCentsRemaining: Number.MAX_SAFE_INTEGER,
      budgetOrgMonthCentsRemaining: Number.MAX_SAFE_INTEGER,
    };
  }

  // Tier 1: session
  const sessionSpent = campaignId ? getSessionSpent(campaignId) : 0;
  const sessionRemaining = flags.budgetSessionCents - sessionSpent;
  if (campaignId && sessionRemaining < requestedCostCents) {
    return {
      allowed: false,
      reason: REASON.SESSION_EXCEEDED,
      alertLevel: 'exceeded',
      budgetSessionCentsRemaining: sessionRemaining,
      budgetUserDayCentsRemaining: flags.budgetUserDayCents - userSpentTodayCents,
      budgetOrgMonthCentsRemaining: flags.budgetOrgMonthCents - orgSpentMonthCents,
    };
  }

  // Tier 2: user per day
  const userRemaining = flags.budgetUserDayCents - userSpentTodayCents;
  if (userRemaining < requestedCostCents) {
    return {
      allowed: false,
      reason: REASON.USER_EXCEEDED,
      alertLevel: 'exceeded',
      budgetSessionCentsRemaining: sessionRemaining,
      budgetUserDayCentsRemaining: userRemaining,
      budgetOrgMonthCentsRemaining: flags.budgetOrgMonthCents - orgSpentMonthCents,
    };
  }

  // Tier 3: org per month
  const orgRemaining = flags.budgetOrgMonthCents - orgSpentMonthCents;
  if (orgRemaining < requestedCostCents) {
    return {
      allowed: false,
      reason: REASON.ORG_EXCEEDED,
      alertLevel: 'exceeded',
      budgetSessionCentsRemaining: sessionRemaining,
      budgetUserDayCentsRemaining: userRemaining,
      budgetOrgMonthCentsRemaining: orgRemaining,
    };
  }

  // Compute alert level based on org-wide usage
  const orgPct = (orgSpentMonthCents / flags.budgetOrgMonthCents) * 100;
  const alertLevel =
    orgPct >= flags.alertThresholdPct ? 'warning' : 'ok';

  return {
    allowed: true,
    reason: alertLevel === 'warning' ? REASON.WARNING : REASON.OK,
    alertLevel,
    budgetSessionCentsRemaining: sessionRemaining,
    budgetUserDayCentsRemaining: userRemaining,
    budgetOrgMonthCentsRemaining: orgRemaining,
  };
}

/**
 * Query user/organization spend from Supabase.
 * Returns { userSpentTodayCents, orgSpentMonthCents }.
 * Sum from dialer_calls.cost_cents WHERE logged_at >= startOfWindow.
 */
export async function querySpendWindow(client, { userId, windowStartIso }) {
  // User-day: sum dialer_calls.cost_cents where logged_by = userId AND logged_at >= startOfDay
  // Org-month: sum over all users
  // Use parameterized SQL via rpc for performance.
  const { data, error } = await client.rpc('dialer_query_spend', {
    p_user_id: userId,
    p_window_start: windowStartIso,
  });
  if (error) throw new Error(`Failed to query spend window: ${error.message}`);
  return {
    userSpentTodayCents: data?.user_total ?? 0,
    orgSpentMonthCents: data?.org_total ?? 0,
  };
}

export const BUDGET_REASONS = REASON;