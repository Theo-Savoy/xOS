// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sign } from 'node:crypto';
import { handleWebhook, verifyTelnyxSignature, __testKeyPair } from './webhooks.js';

const { publicKeyB64, privateKey } = __testKeyPair();
const BODY = JSON.stringify({ data: { id: 'evt_1', event_type: 'call.answered' } });

const signAt = (ts, body = BODY) =>
  sign(null, Buffer.from(`${ts}|${body}`, 'utf8'), privateKey).toString('base64');

// Supabase client mock for handleWebhook (insert into dialer_webhook_events).
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

function webhookRequest({ sig, ts, body = BODY, headers = {} } = {}) {
  const h = new Headers();
  if (sig !== undefined) h.set('telnyx-signature-ed25519', sig);
  if (ts !== undefined) h.set('telnyx-timestamp', ts);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Request('http://localhost/api/dialer?resource=webhooks', {
    method: 'POST',
    headers: h,
    body,
  });
}

describe('verifyTelnyxSignature', () => {
  const now = 1_800_000_000_000; // fixed epoch for deterministic replay tests
  const ts = String(now / 1000);
  const base = { rawBody: BODY, timestamp: ts, publicKeyB64, toleranceSec: 300, nowMs: now };

  it('accepte une signature Telnyx valide (Ed25519 sur timestamp|body)', () => {
    expect(verifyTelnyxSignature({ ...base, signatureB64: signAt(ts) })).toEqual({ ok: true });
  });

  it('rejette une signature manquante', () => {
    expect(verifyTelnyxSignature({ ...base, signatureB64: null }).reason).toBe('missing_signature');
  });

  it('rejette un timestamp manquant', () => {
    expect(
      verifyTelnyxSignature({ ...base, timestamp: null, signatureB64: signAt(ts) }).reason,
    ).toBe('missing_timestamp');
  });

  it('rejette un corps altéré (signature valide, payload modifié)', () => {
    const sig = signAt(ts);
    expect(
      verifyTelnyxSignature({ ...base, signatureB64: sig, rawBody: BODY + ' ' }).reason,
    ).toBe('signature_invalid');
  });

  it('rejette un rejeu hors tolérance de 300 s', () => {
    const oldTs = String(now / 1000 - 600);
    expect(
      verifyTelnyxSignature({ ...base, timestamp: oldTs, signatureB64: signAt(oldTs) }).reason,
    ).toBe('timestamp_out_of_tolerance');
  });

  it('rejette une signature malformée (base64 invalide → signature invalide)', () => {
    // crypto.verify returns false on a short/invalid base64 payload — it does
    // NOT throw. The reason is signature_invalid, not signature_malformed.
    expect(
      verifyTelnyxSignature({ ...base, signatureB64: 'not-base64!!' }).reason,
    ).toBe('signature_invalid');
  });

  it('rejette une clé publique non décodable (32 octets attendus)', () => {
    expect(
      verifyTelnyxSignature({ ...base, publicKeyB64: 'c2hvcnQ=', signatureB64: signAt(ts) }).reason,
    ).toBe('bad_public_key');
  });
});

describe('handleWebhook (intégration)', () => {
  // Le handler utilise l'horloge réelle (pas de nowMs injecté) — signons au
  // timestamp courant pour rester dans la fenêtre de tolérance de 300s.
  const freshTs = () => String(Math.floor(Date.now() / 1000));

  beforeEach(() => {
    vi.stubEnv('WEBHOOK_TELNYX_PUBLIC_KEY', publicKeyB64);
    vi.stubEnv('TELNYX_ENV', 'dev');
    vi.stubEnv('TELNYX_API_KEY_DEV', 'KEY_DEV_TEST');
    vi.stubEnv('SUPABASE_URL', 'https://test-supabase-url.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    mockFrom.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepte une signature valide et persiste l’event', async () => {
    const insertResult = { data: { event_id: 'evt_1' }, error: null };
    const chain = {
      insert: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => insertResult),
    };
    mockFrom.mockImplementation(() => chain);

    const ts = freshTs();
    const res = await handleWebhook(
      webhookRequest({ sig: signAt(ts), ts }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(true);
    expect(body.event_id).toBe('evt_1');
    expect(mockFrom).toHaveBeenCalledWith('dialer_webhook_events');
  });

  it('renvoie 401 et enregistre la tentative refusée (signature invalide)', async () => {
    const chain = {
      insert: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    mockFrom.mockImplementation(() => chain);

    const ts = freshTs();
    const res = await handleWebhook(
      webhookRequest({ sig: 'YmFk', ts }),
    );
    expect(res.status).toBe(401);
    expect(mockFrom).toHaveBeenCalledWith('dialer_webhook_events');
  });

  it('renvoie 503 sans clé publique configurée (fail-closed)', async () => {
    vi.stubEnv('WEBHOOK_TELNYX_PUBLIC_KEY', '');
    const ts = freshTs();
    const res = await handleWebhook(webhookRequest({ sig: signAt(ts), ts }));
    expect(res.status).toBe(503);
  });
});

describe('extractEventId', () => {
  it('utilise data.id quand présent', async () => {
    const { extractEventId } = await import('./idempotency.js');
    expect(extractEventId(BODY)).toBe('evt_1');
  });

  it('retombe sur un hash déterministe sans data.id', async () => {
    const { extractEventId } = await import('./idempotency.js');
    const noId = JSON.stringify({ data: { event_type: 'call.hangup' } });
    expect(extractEventId(noId)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(extractEventId(noId)).toBe(extractEventId(noId));
  });
});
