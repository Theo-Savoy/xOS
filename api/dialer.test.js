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
function makeChain(rows, maybeSingleData = null) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: maybeSingleData, error: null })),
    single: vi.fn(async () => ({ data: maybeSingleData, error: null })),
    order: vi.fn(() => chain),
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

  it('webrtc_token en dry-run émet aucun token (G2)', async () => {
    // Dry-run est le défaut des settings du beforeEach.
    const res = await handler(
      req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.token).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('webrtc_token refuse 409 sans credential RTC', async () => {
    // Fenêtre réelle (dry_run=false partout) mais entitlement sans
    // telnyx_credential_id → 409 no_rtc_credential.
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    mockFrom.mockImplementation(() =>
      makeChain(
        [
          ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
          { key: 'dialer_dry_run', value: 'false' },
        ],
        // Entitlement réel : enabled, dry_run=false, mais SANS credential RTC.
        { enabled: true, dry_run: false, telnyx_credential_id: null },
      ),
    );
    const res = await handler(
      req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('no_rtc_credential');
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

  // --- Vérification lot 11.13 (audit sécurité Grok) : ces comportements ont
  // été implémentés sans test — on les verrouille ici.

  it('S3 : dial refuse 400 invalid_e164 sur un numéro non E.164', async () => {
    for (const to of ['0123456789', '+0123456789', 'sip:evil@host', '+331']) {
      const res = await handler(
        req('resource=dial', {
          method: 'POST',
          headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }),
      );
      expect(res.status, `attendu 400 pour ${to}`).toBe(400);
      expect((await res.json()).error).toBe('invalid_e164');
    }
  });

  it('S5 : x-idempotency-key du client devient le command_id (dédup Telnyx)', async () => {
    const res = await handler(
      req('resource=dial', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-jwt',
          'content-type': 'application/json',
          'x-idempotency-key': 'intent-42',
        },
        body: JSON.stringify({ to: '+33123456789' }),
      }),
    );
    expect((await res.json()).command_id).toBe('xos-dial-intent-42');
  });

  it('S2 : connection_id / webhook_url / from du body sont IGNORÉS (résolus serveur)', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    vi.stubEnv('TELNYX_CONNECTION_ID_DEV', 'server-connection');
    vi.stubEnv('TELNYX_CALLER_ID_DEV', '+33999999999');
    mockFrom.mockImplementation(() =>
      makeChain(
        [
          ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
          { key: 'dialer_dry_run', value: 'false' },
        ],
        { enabled: true, dry_run: false, telnyx_credential_id: 'cred-1' },
      ),
    );
    // Fenêtre réelle : on capture le POST envoyé à Telnyx.
    fetchSpy.mockImplementation(async () =>
      new Response(JSON.stringify({ data: { call_control_id: 'ccid', call_leg_id: 'leg', call_session_id: 'sess' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await handler(
      req('resource=dial', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({
          to: '+33123456789',
          connection_id: 'ATTACKER-CONNECTION',
          webhook_url: 'https://attacker.example/collect',
          from: '+33111111111',
        }),
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sent.connection_id).toBe('server-connection');
    expect(sent.from).toBe('+33999999999');
    expect(sent.webhook_url).toContain('/api/dialer?resource=webhooks');
    expect(sent.webhook_url).not.toContain('attacker.example');
  });

  it('S1/S6 : webrtc_token refuse 429 si le budget est épuisé, sans exposer la réservation', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    mockFrom.mockImplementation(() =>
      makeChain(
        [
          ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
          { key: 'dialer_dry_run', value: 'false' },
        ],
        { enabled: true, dry_run: false, telnyx_credential_id: 'cred-1' },
      ),
    );
    mockRpc.mockImplementation((fn) =>
      fn === 'dialer_reserve_budget'
        ? Promise.resolve({ data: { allowed: false, reason: 'budget_exceeded_session' }, error: null })
        : Promise.resolve({ data: null, error: null }),
    );

    const res = await handler(
      req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('budget_exceeded_session');
    // S1 : aucun token émis quand le budget refuse.
    expect(body.token).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    // S6 : code stable seul, pas l'objet réservation.
    expect(body.reservation).toBeUndefined();
  });
});
