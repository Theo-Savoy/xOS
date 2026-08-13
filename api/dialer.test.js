// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, handler, __testRateLimiter } from './dialer.js';

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
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: maybeSingleData, error: null })),
    single: vi.fn(async () => ({ data: maybeSingleData, error: null })),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
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
    vi.stubEnv('WEBHOOK_TELNYX_PUBLIC_KEY', 'test-webhook-public-key');

    mockFrom.mockReset();
    mockRpc.mockReset();
    mockVerifyJWT.mockReset();
    // Le bucket rate-limit est un singleton module-level partagé par tous les
    // tests du fichier (capacity 20) : le réinitialiser entre chaque cas,
    // sinon le quota s'épuise et les tests suivants reçoivent 429.
    __testRateLimiter.reset();
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

  it('config renvoie l’entitlement et les capacités de l’utilisateur courant', async () => {
    vi.stubEnv('CONNECTION_ID', 'server-connection');
    const res = await handler(req('resource=config'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entitlement).toBeDefined();
    expect(body.has_connection_id).toBe(true);
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

  it('refuse tout token ou dial réel lorsque la clé webhook manque', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    vi.stubEnv('TELNYX_CONNECTION_ID_DEV', 'server-connection');
    vi.stubEnv('TELNYX_CALLER_ID_DEV', ['+33', '900000000'].join(''));
    vi.stubEnv('WEBHOOK_TELNYX_PUBLIC_KEY', '');
    mockFrom.mockImplementation(() => makeChain(
      [
        ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
        { key: 'dialer_dry_run', value: 'false' },
      ],
      { enabled: true, dry_run: false, telnyx_credential_id: 'cred-1' },
    ));

    const tokenResponse = await handler(req('resource=webrtc_token', {
      method: 'POST', headers: { authorization: 'Bearer test-jwt' },
    }));
    const dialResponse = await handler(req('resource=dial', {
      method: 'POST',
      headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
      body: JSON.stringify({ to: ['+33', '100000001'].join('') }),
    }));

    expect(tokenResponse.status).toBe(503);
    expect(dialResponse.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRpc.mock.calls.map(([fn]) => fn)).not.toContain('dialer_reserve_budget');
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

  // --- Lot 11.7 : le budget + le registre ont quitté webrtc_token pour
  // call_started / call_ended (budget PAR COMPOSITION). Ces tests
  // verrouillent le nouveau contrat — et l'absence de l'ancien.

  /** Fenêtre réelle (dry_run paramétrable) + entitlement réelle + registre. */
  const realWindowFrom = (callsChain, { dryRun = false } = {}) => (table) => {
    if (table === 'settings') {
      return makeChain(
        enabledSettings().map((r) =>
          r.key === 'dialer_dry_run' ? { key: 'dialer_dry_run', value: String(dryRun) } : r,
        ),
      );
    }
    if (table === 'dialer_user_entitlements') {
      return makeChain([], { enabled: true, dry_run: false, telnyx_credential_id: 'cred-1' });
    }
    if (table === 'dialer_calls') return callsChain ?? makeChain([], null);
    return makeChain([], null); // dialer_phone_numbers, audit, etc.
  };

  it('11.7 : webrtc_token ne réserve PLUS de budget (contrat déplacé)', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    vi.stubEnv('TELNYX_CALLER_ID_DEV', '+33900009999');
    mockFrom.mockImplementation(realWindowFrom());
    // POST telephony_credentials/.../token renvoie le JWT en texte brut.
    fetchSpy.mockResolvedValue(new Response('rtc-jwt-brut', { status: 200 }));

    const res = await handler(
      req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('rtc-jwt-brut');
    // Caller ID serveur obligatoire quand le client n'en choisit pas : les
    // chemins Runner/pool ne doivent jamais laisser Telnyx résoudre un ANI
    // implicite (présentation « numéro masqué »).
    expect(body.caller_number).toBe('+33900009999');
    // L'ancien contrat est mort : aucun budget réservé sur le token.
    const rpcNames = mockRpc.mock.calls.map(([fn]) => fn);
    expect(rpcNames).not.toContain('dialer_reserve_budget');
  });

  it('11.7 : call_started réserve le budget + écrit la ligne dialer_calls', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    const callsChain = makeChain([], { id: 42 }); // insert → single()
    mockFrom.mockImplementation(realWindowFrom(callsChain));

    const res = await handler(
      req('resource=call_started', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ to: '+33123456789' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.call_record_id).toBe(42);
    expect(body.dry_run).toBe(false);
    const rpcNames = mockRpc.mock.calls.map(([fn]) => fn);
    expect(rpcNames).toContain('dialer_reserve_budget');
    // La ligne porte le statut dialing, l'owner, la cible et la réservation.
    const inserted = callsChain.insert.mock.calls[0][0];
    expect(inserted.status).toBe('dialing');
    expect(inserted.owner_user_id).toBe('user-123');
    expect(inserted.to_number).toBe('+33123456789');
    expect(inserted.reservation_id).toBe('res-1');
  });

  it('11.7 : call_started refuse 429 budget épuisé SANS écrire de ligne', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    const callsChain = makeChain([], { id: 42 });
    mockFrom.mockImplementation(realWindowFrom(callsChain));
    mockRpc.mockImplementation((fn) =>
      fn === 'dialer_reserve_budget'
        ? Promise.resolve({ data: { allowed: false, reason: 'budget_exceeded_session' }, error: null })
        : Promise.resolve({ data: null, error: null }),
    );

    const res = await handler(
      req('resource=call_started', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ to: '+33123456789' }),
      }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('budget_exceeded_session');
    expect(body.call_record_id).toBeUndefined();
    // S6 : code stable seul, pas l'objet réservation.
    expect(body.reservation).toBeUndefined();
    // Fail-loud : pas de ligne sans budget.
    expect(callsChain.insert).not.toHaveBeenCalled();
  });

  it('11.7 : call_started refuse 400 invalid_e164', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    mockFrom.mockImplementation(realWindowFrom());
    for (const to of ['0123456789', '+0123456789', 'sip:evil@host', '+331']) {
      const res = await handler(
        req('resource=call_started', {
          method: 'POST',
          headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }),
      );
      expect(res.status, `attendu 400 pour ${to}`).toBe(400);
      expect((await res.json()).error).toBe('invalid_e164');
    }
  });

  it('11.7 : call_started en dry-run → call_record_id null, ni registre ni budget', async () => {
    // Le client dry-run n'a pas de socket (token null) — s'il appelle quand
    // même, réponse explicite plutôt qu'une ligne fantôme.
    const callsChain = makeChain([], { id: 42 });
    mockFrom.mockImplementation(realWindowFrom(callsChain, { dryRun: true }));

    const res = await handler(
      req('resource=call_started', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ to: '+33123456789' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.call_record_id).toBeNull();
    expect(callsChain.insert).not.toHaveBeenCalled();
    const rpcNames = mockRpc.mock.calls.map(([fn]) => fn);
    expect(rpcNames).not.toContain('dialer_reserve_budget');
  });

  it('11.7 : call_ended answered=true consomme la réservation', async () => {
    // rows = lignes affectées par l'UPDATE (F3 : le release est conditionné
    // aux lignes réellement mises à jour).
    const callsChain = makeChain([{ id: 42 }], { id: 42, reservation_id: 'res-1' });
    mockFrom.mockImplementation(realWindowFrom(callsChain));

    const res = await handler(
      req('resource=call_ended', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ call_record_id: 42, status: 'ended', answered: true, duration_sec: 73 }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).closed).toBe(true);
    const updated = callsChain.update.mock.calls[0][0];
    expect(updated.status).toBe('ended');
    expect(updated.duration_sec).toBe(73);
    expect(updated.ended_at).toBeTruthy();
    const release = mockRpc.mock.calls.find(([fn]) => fn === 'dialer_release_reservation');
    expect(release[1]).toEqual({ p_reservation_id: 'res-1', p_result: 'consumed' });
  });

  it('11.7 : call_ended sans réponse libère la réservation', async () => {
    const callsChain = makeChain([{ id: 42 }], { id: 42, reservation_id: 'res-1' });
    mockFrom.mockImplementation(realWindowFrom(callsChain));

    const res = await handler(
      req('resource=call_ended', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ call_record_id: 42, status: 'no_answer' }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).closed).toBe(true);
    const release = mockRpc.mock.calls.find(([fn]) => fn === 'dialer_release_reservation');
    expect(release[1]).toEqual({ p_reservation_id: 'res-1', p_result: 'released' });
  });

  it('11.7 : call_ended idempotent — ligne close ou non possédée → closed:false', async () => {
    // maybeSingle null : déjà close OU owner_user_id ≠ user courant (le eq
    // filtre). Dans les deux cas : ni update, ni budget retouché.
    const callsChain = makeChain([], null);
    mockFrom.mockImplementation(realWindowFrom(callsChain));

    const res = await handler(
      req('resource=call_ended', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ call_record_id: 999, status: 'ended', answered: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).closed).toBe(false);
    expect(callsChain.update).not.toHaveBeenCalled();
    const rpcNames = mockRpc.mock.calls.map(([fn]) => fn);
    expect(rpcNames).not.toContain('dialer_release_reservation');
  });

  it('F3 : UPDATE affecte 0 ligne (clôture concurrente gagnée ailleurs) → pas de release', async () => {
    // Course à la clôture (client + réconciliation webhooks 11.8) : les deux
    // clôtureurs lisent ended_at IS NULL, un seul gagne l'UPDATE. Le perdant
    // (rows = []) doit répondre closed:false SANS toucher la réservation —
    // le release est conditionné aux lignes réellement mises à jour.
    const callsChain = makeChain([], { id: 42, reservation_id: 'res-1' });
    mockFrom.mockImplementation(realWindowFrom(callsChain));

    const res = await handler(
      req('resource=call_ended', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ call_record_id: 42, status: 'ended', answered: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).closed).toBe(false);
    const rpcNames = mockRpc.mock.calls.map(([fn]) => fn);
    expect(rpcNames).not.toContain('dialer_release_reservation');
  });

  it('11.7 : call_ended refuse 400 sans call_record_id valide', async () => {
    mockFrom.mockImplementation(realWindowFrom());
    for (const call_record_id of [undefined, 0, -3, 'abc']) {
      const res = await handler(
        req('resource=call_ended', {
          method: 'POST',
          headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
          body: JSON.stringify({ call_record_id }),
        }),
      );
      expect(res.status, `attendu 400 pour ${JSON.stringify(call_record_id)}`).toBe(400);
    }
  });

  it('11.7 : GET calls renvoie l’historique masqué de l’utilisateur', async () => {
    const rows = [
      { id: 1, to_number: '+33612345678', status: 'ended', created_at: '2026-08-09T00:00:00Z' },
      // F4 : les entrées trop courtes (< 8) sont masquées INTÉGRALEMENT.
      { id: 2, to_number: '+3312', status: 'ended', created_at: '2026-08-09T00:00:00Z' },
    ];
    mockFrom.mockImplementation(realWindowFrom(makeChain(rows, null)));

    const res = await handler(
      req('resource=calls', { headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.calls).toHaveLength(2);
    // S11 : jamais d'E.164 prospect en clair côté client.
    expect(body.calls[0].to_number).not.toContain('12345678');
    expect(body.calls[0].to_number).toContain('****');
    expect(body.calls[1].to_number).toBe('****');
  });

  it('entitlement refusé → 403 dialer_entitlement_denied (webrtc_token)', async () => {
    // Fenêtre réelle : dry_run=false partout, mais entitlement disabled.
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    mockFrom.mockImplementation(() =>
      makeChain(
        [
          ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
          { key: 'dialer_dry_run', value: 'false' },
        ],
        { enabled: false, dry_run: false, telnyx_credential_id: 'cred-1' },
      ),
    );

    const res = await handler(
      req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('dialer_entitlement_denied');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caller_number non possédé → 403 caller_number_not_owned', async () => {
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'test-api-key');
    mockFrom.mockImplementation((table) =>
      table === 'dialer_phone_numbers'
        ? // Aucun numéro possédé : le caller demandé n'appartient à personne.
          makeChain([], null)
        : makeChain(
            [
              ...enabledSettings().filter((r) => r.key !== 'dialer_dry_run'),
              { key: 'dialer_dry_run', value: 'false' },
            ],
            { enabled: true, dry_run: false, telnyx_credential_id: 'cred-1' },
          ),
    );

    const res = await handler(
      req('resource=webrtc_token', {
        method: 'POST',
        headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
        body: JSON.stringify({ caller_number: '+336****9999' }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('caller_number_not_owned');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rate limit par user → 429 rate_limited avec retry_after_ms', async () => {
    // Fenêtre réelle : dry_run=false, entitlement valide, budget OK.
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

    // Le bucket (capacity 20, refill 5/s) est partagé entre les tests du
    // fichier : on le vide par 25 requêtes rapides pour dépasser le burst.
    // Placé EN DERNIER : les tests suivants tomberaient sur un bucket vide.
    let last = null;
    for (let i = 0; i < 25; i += 1) {
      last = await handler(
        req('resource=webrtc_token', { method: 'POST', headers: { authorization: 'Bearer test-jwt' } }),
      );
      if (last.status === 429) break;
    }
    expect(last.status).toBe(429);
    const body = await last.json();
    expect(body.error).toBe('rate_limited');
    expect(typeof body.retry_after_ms).toBe('number');
  });
});
