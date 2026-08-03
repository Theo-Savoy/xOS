// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, handler } from './dialer.js';

const { mockVerifyJWT } = vi.hoisted(() => ({ mockVerifyJWT: vi.fn() }));

vi.mock('./_auth.js', () => ({
  verifyJWT: mockVerifyJWT,
}));

// Mock supabase client factory so getServiceClient() resolves a fake client.
const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

/**
 * Fake query chain that mirrors supabase-js's builder for the settings reads
 * used by loadDialerFlags: .from('settings').select().in(). A thenable that
 * resolves { data, error } so `await chain` works.
 */
function makeChain(rows) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: null, error: null })),
    then(onFulfilled) {
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

const req = (qs, init = {}) => new Request(`http://localhost/api/dialer?${qs}`, init);

/** Default settings rows: dialer ENABLED so guarded resources reach their switch. */
function enabledSettings() {
  return [
    { key: 'dialer_enabled', value: 'true' },
    { key: 'dialer_dry_run', value: 'true' },
    { key: 'dialer_budget_session_cents', value: '300' },
    { key: 'dialer_budget_user_day_cents', value: '1000' },
    { key: 'dialer_budget_org_month_cents', value: '15000' },
    { key: 'dialer_rate_rps', value: '5' },
    { key: 'dialer_rate_burst', value: '20' },
    { key: 'dialer_alert_threshold_pct', value: '80' },
  ];
}

describe('routeur /api/dialer', () => {
  let fetchSpy;

  beforeEach(() => {
    // Toute sortie réseau pendant ces tests est une régression (dry-run).
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      throw new Error(`network call forbidden in dry-run: ${url}`);
    });

    vi.stubEnv('SUPABASE_URL', 'https://test-supabase-url.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    // Dry-run env: no API keys needed, no network calls ever.
    vi.stubEnv('TELNYX_ENV', 'dryrun');

    mockFrom.mockReset();
    mockRpc.mockReset();
    mockVerifyJWT.mockReset();
    mockVerifyJWT.mockResolvedValue({ id: 'user-123', email: 'test@xos-learning.fr' });

    // Settings reads return the enabled rows.
    mockFrom.mockImplementation(() => makeChain(enabledSettings()));
    // Remote budget contract: reserve succeeds; entitlements row for user-123.
    mockRpc.mockImplementation((fn, args) => {
      if (fn === 'dialer_reserve_budget') {
        return Promise.resolve({
          data: { allowed: true, reservation_id: 'res-1', estimated_cost_cents: 1 },
          error: null,
        });
      }
      if (fn === 'dialer_release_reservation') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('renvoie un Response HTTP, pas un objet nu', async () => {
    const res = await handler(req('resource=config'));
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('expose les Web Handlers GET et POST attendus par Vercel', () => {
    expect(GET).toBe(handler);
    expect(POST).toBe(handler);
  });

  it('accepte l’URL relative transmise par le runtime Vercel local', async () => {
    const res = await handler({
      url: '/api/dialer?resource=config',
      method: 'GET',
      headers: new Headers(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).env).toBe('dryrun');
  });

  it('config exige désormais un JWT (fix visibilité audit §2.3)', async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await handler(req('resource=config'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('config renvoie l’entitlement de l’utilisateur courant', async () => {
    const res = await handler(req('resource=config'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entitlement).toBeDefined();
    expect(typeof body.entitlement.enabled).toBe('boolean');
  });

  it('503 dialer_disabled quand le flag est false (resource gardée)', async () => {
    // Empty settings → loadDialerFlags defaults enabled=false.
    mockFrom.mockImplementation(() => makeChain([]));
    const res = await handler(
      req('resource=campaigns', { method: 'GET', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('dialer_disabled');
  });

  it('400 unknown_resource sur une resource inconnue', async () => {
    const res = await handler(
      req('resource=nope', { headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(400);
  });

  it('401 unauthenticated sur une resource gardée sans JWT', async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await handler(req('resource=dial', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('n’émet aucun appel réseau en dry-run', async () => {
    await handler(req('resource=config'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dial POST passe le budget gate et ne touche pas le réseau (dry-run)', async () => {
    const res = await handler(
      req('resource=dial', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-jwt',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: '+33123456789',
          connection_id: 'conn-1',
          webhook_url: 'https://example.com/api/dialer?resource=webhooks',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);
    expect(body.call_control_id).toBeTruthy();
    expect(body.command_id).toMatch(/^xos-dial-/);
  });
});
