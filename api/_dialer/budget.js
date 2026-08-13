/**
 * api/_dialer/budget.js — Budget guard backed by the dialer_reserve_budget RPC.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.2.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P1-3 (circuit breaker),
 * B10 (dialer_query_spend was a phantom — the remote actually has
 * dialer_reserve_budget).
 *
 * The REMOTE schema (xos-portal) is the source of truth. Migrations 041-043
 * were applied to the remote first, then RECONSTITUTED AS COMMITTED FILES
 * (commit a12defa — 041/042/043 do exist in supabase/migrations/, so a
 * from-scratch replay reaches 045 without breaking on the FK).
 *   - RPC dialer_reserve_budget(p_user_id, p_campaign_id, p_estimated_cost_cents,
 *       p_session_cap_cents, p_user_day_cap_cents, p_org_month_cap_cents,
 *       p_user_day_call_cap, p_user_month_call_cap, p_day_start, p_month_start)
 *     → jsonb { allowed, reason } | { allowed, reservation_id, estimated_cost_cents }
 *   - Table dialer_budget_reservations (atomic reservation ledger, advisory lock)
 *   - Table dialer_user_entitlements (per-user caps: enabled, dry_run,
 *     budget_day_cents, calls_day_limit, calls_month_limit)
 *
 * The RPC does spend + reservation atomically: concurrent dials cannot
 * double-spend the same cap. This replaces the old in-memory Map + phantom
 * dialer_query_spend entirely.
 */

import { getParisDateRange } from '../_calls/http.js';

export const BUDGET_REASONS = {
  OK: 'ok',
  INVALID_COST: 'invalid_cost',
  SESSION_EXCEEDED: 'budget_exceeded_session',
  USER_EXCEEDED: 'budget_exceeded_user_day',
  ORG_EXCEEDED: 'budget_exceeded_org_month',
  CALLS_USER_DAY: 'calls_exceeded_user_day',
  CALLS_USER_MONTH: 'calls_exceeded_user_month',
  DISABLED: 'dialer_disabled',
  DRY_RUN: 'dry_run',
};

/**
 * Reserve budget for one dial via the atomic RPC.
 * @param {object} client - supabase service-role client
 * @param {object} params
 * @param {string} params.userId
 * @param {number|null} params.campaignId
 * @param {number} params.estimatedCostCents - estimate for this dial (>=1)
 * @param {object} params.caps - { sessionCents, userDayCents, orgMonthCents, userDayCalls, userMonthCalls }
 * @returns {Promise<{allowed:boolean, reason?:string, reservationId?:string, estimatedCostCents?:number}>}
 */
export async function reserveBudget(client, {
  userId,
  campaignId = null,
  estimatedCostCents,
  caps,
}) {
  const { todayStart, monthStart } = getParisDateRange();
  const { data, error } = await client.rpc('dialer_reserve_budget', {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_estimated_cost_cents: estimatedCostCents,
    p_session_cap_cents: caps.sessionCents,
    p_user_day_cap_cents: caps.userDayCents,
    p_org_month_cap_cents: caps.orgMonthCents,
    p_user_day_call_cap: caps.userDayCalls,
    p_user_month_call_cap: caps.userMonthCalls,
    p_day_start: todayStart.toISOString(),
    p_month_start: monthStart.toISOString(),
  });
  if (error) throw new Error(`dialer_reserve_budget failed: ${error.message}`);
  const result = data && typeof data === 'object' ? data : { allowed: false };
  if (!result.allowed) {
    return {
      allowed: false,
      reason: result.reason || 'budget_blocked',
    };
  }
  return {
    allowed: true,
    reservationId: result.reservation_id,
    estimatedCostCents: result.estimated_cost_cents ?? estimatedCostCents,
  };
}

/**
 * Release a reservation (no-op for dry-run, dial failed before any spend).
 */
export async function releaseReservation(client, reservationId, { result = 'released' } = {}) {
  if (!reservationId) return;
  const { error } = await client.rpc('dialer_release_reservation', {
    p_reservation_id: reservationId,
    p_result: result,
  });
  if (error) {
    console.error('[dialer.budget] release_reservation failed:', error.message);
  }
}

/**
 * Load per-user entitlements (fallback to safe defaults when absent).
 */
export async function loadUserEntitlements(client, userId) {
  const { data, error } = await client
    .from('dialer_user_entitlements')
    .select(
      'enabled, dry_run, budget_day_cents, calls_day_limit, calls_month_limit, telnyx_credential_id',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('[dialer.budget] load entitlements failed:', error.message);
  }
  return {
    enabled: data?.enabled ?? false,
    dryRun: data?.dry_run ?? true,
    budgetDayCents: data?.budget_day_cents ?? 1000,
    callsDayLimit: data?.calls_day_limit ?? 50,
    callsMonthLimit: data?.calls_month_limit ?? 500,
    telnyxCredentialId: data?.telnyx_credential_id ?? null,
  };
}
