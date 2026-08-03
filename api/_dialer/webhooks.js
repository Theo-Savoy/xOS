/**
 * api/_dialer/webhooks.js — Telnyx webhook receiver.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.5, §2.4.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P0-4 / P1-1 / P1-7.
 *
 * Responsibilities:
 *  1. Ed25519 signature verification via node:crypto (NO standardwebhooks).
 *     Telnyx signs `${timestamp}|${rawBody}` in pure Ed25519 and sends the
 *     headers `telnyx-signature-ed25519` + `telnyx-timestamp`. The
 *     `standardwebhooks` package would be WRONG here: it signs
 *     `id.timestamp.payload` (Standard Webhooks spec), a different string.
 *  2. Idempotency: persist to dialer_webhook_events (dedupe by event_id),
 *     insert-first so the PK is the lock (no race window).
 *  3. Persist rejected signature attempts (signature_ok=false) BEFORE
 *     returning 401 — the only sensor on this public endpoint.
 *  4. Event router stays a stub — handlers land in 11.2/11.3.
 *
 * The webhook endpoint is OPEN (no JWT): the signature IS the auth.
 */

import { createPublicKey, generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { loadDialerConfig } from './config.js';
import { checkAndRecordWebhook, extractEventId } from './idempotency.js';
import { getServiceClient } from '../_calls/http.js';

export const SIG_HEADER = 'telnyx-signature-ed25519';
export const TS_HEADER = 'telnyx-timestamp';

// SPKI prefix for an Ed25519 public key in DER form.
const SPKI_ED25519_PREFIX = Buffer.from(
  '302a300506032b6570032100',
  'hex',
);

/**
 * Parse the Telnyx webhook public key. Accepts either the raw base64 form
 * (as Telnyx dashboard exposes it) or the `base64:` prefixed form used by
 * the env example. Returns a KeyObject, or null when the key is unusable.
 */
function telnyxPublicKey(base64Key) {
  if (!base64Key) return null;
  const raw = Buffer.from(base64Key.replace(/^base64:/, ''), 'base64');
  if (raw.length !== 32) return null;
  try {
    return createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }
}

/**
 * Verify a Telnyx Ed25519 webhook signature.
 * Telnyx signs `${timestamp}|${rawBody}`; headers are
 * `telnyx-signature-ed25519` (base64 sig) and `telnyx-timestamp` (unix seconds).
 *
 * Fail-closed: never throws, always returns { ok } or { ok:false, reason }.
 * `nowMs` is injectable so tests can exercise the replay window deterministically.
 */
export function verifyTelnyxSignature({
  rawBody,
  signatureB64,
  timestamp,
  publicKeyB64,
  toleranceSec,
  nowMs = Date.now(),
}) {
  if (!signatureB64) return { ok: false, reason: 'missing_signature' };
  if (!timestamp) return { ok: false, reason: 'missing_timestamp' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }
  const key = telnyxPublicKey(publicKeyB64);
  if (!key) return { ok: false, reason: 'bad_public_key' };
  let ok;
  try {
    ok = cryptoVerify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`, 'utf8'),
      key,
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return { ok: false, reason: 'signature_malformed' };
  }
  return ok ? { ok: true } : { ok: false, reason: 'signature_invalid' };
}

/** Deterministic id from the Telnyx event body: data.id, else sha256(body).
 * Implemented in idempotency.js — kept here as a re-export for callers of
 * webhooks.js that need it without importing idempotency directly. */

/**
 * Handle an incoming Telnyx webhook.
 * @param {Request} request - Web standard Request (Vercel convention).
 * @returns {Promise<Response>}
 */
export async function handleWebhook(request) {
  let cfg;
  try {
    cfg = loadDialerConfig();
  } catch (err) {
    // Fail-closed: missing public key or API env → 503, never fail-open.
    console.error('[dialer.webhooks] config error:', err instanceof Error ? err.message : err);
    return json(503, { error: 'dialer_not_configured' });
  }

  // Raw body — read BEFORE any .json() (body is single-consumption).
  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json(400, { error: 'unreadable_body' });
  }
  if (!rawBody || rawBody.trim() === '') {
    return json(400, { error: 'missing_body' });
  }

  if (!cfg.webhookPublicKey) {
    return json(503, { error: 'webhook_public_key_not_configured' });
  }

  const signatureB64 = request.headers.get(SIG_HEADER);
  const timestamp = request.headers.get(TS_HEADER);

  const check = verifyTelnyxSignature({
    rawBody,
    signatureB64,
    timestamp,
    publicKeyB64: cfg.webhookPublicKey,
    toleranceSec: cfg.webhookToleranceSec,
  });

  const eventId = extractEventId(rawBody);
  const eventType = extractEventType(rawBody);

  if (!check.ok) {
    // P1-7: persist the rejected attempt BEFORE returning 401. This is the
    // only sensor on a JWT-less endpoint. Best effort — a failed insert must
    // not mask the 401.
    await recordAttempt({ eventId, eventType, rawBody, ok: false, reason: check.reason });
    return json(401, { error: check.reason });
  }

  const client = getServiceClient();
  if (!client) {
    // Fail-closed: without persistence we cannot guarantee dedup. Do NOT
    // return 200 with a "persisted" lie.
    return json(503, { error: 'service_client_unavailable' });
  }

  const { isDuplicate } = await checkAndRecordWebhook(client, {
    eventId,
    eventType,
    payload: safeParse(rawBody),
    signatureOk: true,
  });

  // 4) Event router — stub. 11.2 will add:
  //   switch (eventType) { case 'call.answered': ... }
  return json(isDuplicate ? 200 : 200, {
    status: isDuplicate ? 'duplicate' : 'received',
    event_id: eventId,
    event_type: eventType,
    persisted: true,
  });
}

/** Best-effort persistence of a rejected signature attempt. */
async function recordAttempt({ eventId, eventType, rawBody, ok, reason }) {
  const client = getServiceClient();
  if (!client) return;
  try {
    const { error } = await client.from('dialer_webhook_events').insert({
      event_id: eventId,
      event_type: eventType || 'unknown',
      payload: safeParse(rawBody),
      signature_ok: ok,
      status: 'failed',
      error_message: reason || 'signature_invalid',
    });
    if (error) console.error('[dialer.webhooks] failed to record rejected attempt:', error.message);
  } catch (err) {
    console.error('[dialer.webhooks] failed to record rejected attempt:', err);
  }
}

function extractEventType(rawBody) {
  try {
    const t = JSON.parse(rawBody)?.data?.event_type;
    return typeof t === 'string' ? t : 'unknown';
  } catch {
    return 'unknown';
  }
}

function safeParse(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { _raw: rawBody.slice(0, 2000) };
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const WEBHOOK_HEADERS = {
  SIG: SIG_HEADER,
  TS: TS_HEADER,
};

/** Test-only hook: generate a fresh Ed25519 pair for signing payloads. */
export function __testKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyB64: publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64'),
    privateKey,
  };
}
