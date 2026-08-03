import { describe, expect, it } from 'vitest';
import {
  checkBudget,
  startSessionBudget,
  addSessionCost,
  endSessionBudget,
  getSessionSpent,
  BUDGET_REASONS,
} from './budget.js';

const FLAGS = {
  enabled: true,
  dryRun: false,
  budgetSessionCents: 300,
  budgetUserDayCents: 1000,
  budgetOrgMonthCents: 15000,
  rateRps: 5,
  rateBurst: 20,
  alertThresholdPct: 80,
};

describe('checkBudget — disabled flag', () => {
  it('rejects when dialer disabled', () => {
    const r = checkBudget({
      flags: { ...FLAGS, enabled: false },
      requestedCostCents: 1,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('dialer_disabled');
  });
});

describe('checkBudget — dry-run', () => {
  it('always allows when dry-run on', () => {
    const r = checkBudget({
      flags: { ...FLAGS, dryRun: true },
      requestedCostCents: 999999,
      userSpentTodayCents: 999999,
      orgSpentMonthCents: 999999,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('dry_run');
  });

  it('explicit dryRun=false behaves like production', () => {
    const r = checkBudget({
      flags: { ...FLAGS, dryRun: false },
      campaignId: 'c1',
      requestedCostCents: 301,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 0,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('budget_exceeded_session');
  });
});

describe('checkBudget — session tier', () => {
  it('rejects when session cap exceeded', () => {
    startSessionBudget('c1', { limitCents: 300 });
    addSessionCost('c1', 250);
    const r = checkBudget({
      flags: FLAGS,
      campaignId: 'c1',
      requestedCostCents: 60,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 0,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('budget_exceeded_session');
    expect(r.budgetSessionCentsRemaining).toBe(50);
    endSessionBudget('c1');
  });

  it('skips session tier when no campaignId', () => {
    const r = checkBudget({
      flags: FLAGS,
      requestedCostCents: 9999,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 0,
    });
    // Falls through to user/org tier. Here it would fail user cap.
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('budget_exceeded_user_day');
  });
});

describe('checkBudget — user-day tier', () => {
  it('rejects when user cap exceeded', () => {
    const r = checkBudget({
      flags: FLAGS,
      requestedCostCents: 50,
      userSpentTodayCents: 980,
      orgSpentMonthCents: 0,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('budget_exceeded_user_day');
    expect(r.budgetUserDayCentsRemaining).toBe(20);
  });
});

describe('checkBudget — org-month tier', () => {
  it('rejects when org cap exceeded', () => {
    const r = checkBudget({
      flags: FLAGS,
      requestedCostCents: 50,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 14990,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('budget_exceeded_org_month');
  });

  it('returns alert=warning at 80% org cap', () => {
    const r = checkBudget({
      flags: FLAGS,
      requestedCostCents: 1,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 12000, // 80% of 15000
    });
    expect(r.allowed).toBe(true);
    expect(r.alertLevel).toBe('warning');
    expect(r.reason).toBe('warning');
  });

  it('returns alert=ok below 80%', () => {
    const r = checkBudget({
      flags: FLAGS,
      requestedCostCents: 1,
      userSpentTodayCents: 0,
      orgSpentMonthCents: 100, // < 1%
    });
    expect(r.allowed).toBe(true);
    expect(r.alertLevel).toBe('ok');
    expect(r.reason).toBe('ok');
  });
});

describe('session counter', () => {
  it('tracks spend in-memory', () => {
    startSessionBudget('c2');
    expect(getSessionSpent('c2')).toBe(0);
    addSessionCost('c2', 5);
    addSessionCost('c2', 3);
    expect(getSessionSpent('c2')).toBe(8);
    endSessionBudget('c2');
    expect(getSessionSpent('c2')).toBe(0);
  });

  it('addSessionCost on unknown campaign is no-op', () => {
    expect(() => addSessionCost('nope', 100)).not.toThrow();
    expect(getSessionSpent('nope')).toBe(0);
  });
});

describe('BUDGET_REASONS export', () => {
  it('exposes the 5 reason codes', () => {
    expect(BUDGET_REASONS.OK).toBe('ok');
    expect(BUDGET_REASONS.SESSION_EXCEEDED).toBe('budget_exceeded_session');
    expect(BUDGET_REASONS.USER_EXCEEDED).toBe('budget_exceeded_user_day');
    expect(BUDGET_REASONS.ORG_EXCEEDED).toBe('budget_exceeded_org_month');
    expect(BUDGET_REASONS.DISABLED).toBe('dialer_disabled');
    expect(BUDGET_REASONS.DRY_RUN).toBe('dry_run');
  });
});