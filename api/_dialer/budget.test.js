import { describe, expect, it, vi } from 'vitest';
import { reserveBudget, releaseReservation, loadUserEntitlements, BUDGET_REASONS } from './budget.js';

function mockClient(rpcImpl, fromImpl) {
  return {
    rpc: vi.fn(rpcImpl),
    from: vi.fn(fromImpl ?? (() => ({}) )),
  };
}

describe('reserveBudget — délégué au RPC atomique remote', () => {
  it('propage un allowed=true avec reservation_id', async () => {
    const client = mockClient(async () => ({
      data: { allowed: true, reservation_id: 'res-1', estimated_cost_cents: 1 },
      error: null,
    }));
    const r = await reserveBudget(client, {
      userId: 'u1',
      campaignId: 7,
      estimatedCostCents: 1,
      caps: { sessionCents: 300, userDayCents: 1000, orgMonthCents: 15000, userDayCalls: 50, userMonthCalls: 500 },
    });
    expect(r.allowed).toBe(true);
    expect(r.reservationId).toBe('res-1');
    expect(client.rpc).toHaveBeenCalledWith('dialer_reserve_budget', expect.objectContaining({
      p_user_id: 'u1',
      p_campaign_id: 7,
      p_estimated_cost_cents: 1,
      p_session_cap_cents: 300,
      p_user_day_call_cap: 50,
      p_user_month_call_cap: 500,
    }));
  });

  it('traduit un allowed=false en raison propre', async () => {
    const client = mockClient(async () => ({
      data: { allowed: false, reason: 'budget_exceeded_org_month' },
      error: null,
    }));
    const r = await reserveBudget(client, {
      userId: 'u1',
      estimatedCostCents: 1,
      caps: { sessionCents: 300, userDayCents: 1000, orgMonthCents: 15000, userDayCalls: 50, userMonthCalls: 500 },
    });
    expect(r).toEqual({ allowed: false, reason: 'budget_exceeded_org_month' });
  });

  it('throw si le RPC renvoie une erreur (fail-loud, pas de faux allowed)', async () => {
    const client = mockClient(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(
      reserveBudget(client, {
        userId: 'u1',
        estimatedCostCents: 1,
        caps: { sessionCents: 300, userDayCents: 1000, orgMonthCents: 15000, userDayCalls: 50, userMonthCalls: 500 },
      }),
    ).rejects.toThrow(/dialer_reserve_budget failed/);
  });
});

describe('releaseReservation — cycle de vie', () => {
  it('no-op sans reservationId', async () => {
    const client = mockClient(async () => ({ data: null, error: null }));
    await releaseReservation(client, null);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('appelle le RPC release avec le résultat demandé', async () => {
    const client = mockClient(async () => ({ data: null, error: null }));
    await releaseReservation(client, 'res-1', { result: 'consumed' });
    expect(client.rpc).toHaveBeenCalledWith('dialer_release_reservation', {
      p_reservation_id: 'res-1',
      p_result: 'consumed',
    });
  });

  it('log les erreurs sans throw (best effort)', async () => {
    const client = mockClient(async () => ({ data: null, error: { message: 'nope' } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await releaseReservation(client, 'res-1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('loadUserEntitlements — contrat remote', () => {
  it('retourne les caps de l’entitlement', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: { enabled: true, dry_run: false, budget_day_cents: 2500, calls_day_limit: 40, calls_month_limit: 400 },
        error: null,
      })),
    };
    const client = mockClient(undefined, () => chain);
    const e = await loadUserEntitlements(client, 'u1');
    expect(e).toEqual({
      enabled: true,
      dryRun: false,
      budgetDayCents: 2500,
      callsDayLimit: 40,
      callsMonthLimit: 400,
      telnyxCredentialId: null,
    });
  });

  it('retombe sur des défauts sûrs quand l’entitlement est absent', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } })),
    };
    const client = mockClient(undefined, () => chain);
    const e = await loadUserEntitlements(client, 'u1');
    expect(e).toEqual({
      enabled: false,
      dryRun: true,
      budgetDayCents: 1000,
      callsDayLimit: 50,
      callsMonthLimit: 500,
      telnyxCredentialId: null,
    });
  });
});

describe('BUDGET_REASONS', () => {
  it('expose les raisons du contrat remote', () => {
    expect(BUDGET_REASONS.ORG_EXCEEDED).toBe('budget_exceeded_org_month');
    expect(BUDGET_REASONS.SESSION_EXCEEDED).toBe('budget_exceeded_session');
  });
});
