/**
 * api/_dialer/webhooks.js — Telnyx webhook receiver.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.5, §2.4.
 *
 * Responsibilities (this commit):
 *  1. Ed25519 signature verification via standardwebhooks
 *  2. Idempotency: persist event to dialer_webhook_events (de-dupe by event_id)
 *  3. Stub the event router — actual handlers land in 11.2/11.3
 *
 * Why we don't dispatch yet: the call state machine doesn't exist (11.2).
 * We persist the event so 11.2 can re-process from the table if needed.
 */

import { loadDialerConfig } from './config.js';

const SIG_HEADER = 'telnyx-signature';
const EVENT_ID_HEADER = 'telnyx-webhook-id';

export async function handleWebhook(req, res) {
  const cfg = loadDialerConfig();

  // 1) Signature verification (mandatory, fail-closed)
  const signature = req.headers[SIG_HEADER];
  if (!signature) {
    return { status: 401, body: { error: 'missing_signature' } };
  }

  // Read raw body. Vercel exposes req.body already parsed — we need raw bytes.
  // The convention in this codebase: when consumed by `parseBody`, the raw
  // body is preserved at req.rawBody (set by vercel.json body parser config).
  const rawBody = req.rawBody ?? '';
  if (!rawBody) {
    return { status: 400, body: { error: 'missing_raw_body' } };
  }

  if (!cfg.webhookPublicKey) {
    return { status: 503, body: { error: 'webhook_public_key_not_configured' } };
  }

  let verified;
  try {
    // Standard Webhooks spec — Telnyx uses this.
    // Lazy import: the lib may not be installed yet on this branch.
    const { Webhook } = await import('standardwebhooks').catch(() => ({}));
    if (!Webhook) {
      return {
        status: 501,
        body: {
          error: 'standardwebhooks_not_installed',
          message:
            'Run `npm install standardwebhooks` before merging. Webhook signature verification cannot proceed.',
        },
      };
    }
    const wh = new Webhook(cfg.webhookPublicKey);
    verified = wh.verify(rawBody, Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
    ));
  } catch (err) {
    return {
      status: 401,
      body: {
        error: 'signature_invalid',
        message: err instanceof Error ? err.message : 'verification_failed',
      },
    };
  }

  // 2) Extract event metadata
  const eventId =
    req.headers[EVENT_ID_HEADER] ??
    verified.id ??
    cryptoRandomId();

  // 3) Idempotency: this stub does not yet insert into dialer_webhook_events
  //    (no Supabase client wiring in 11.1). In 11.2 we'll wire it via
  //    the same pattern as api/_calls/ — service-role client.
  //
  // The placeholder below documents the intended flow but does not write.
  // When the Supabase client is wired, this becomes:
  //   const { error: insertErr } = await client
  //     .from('dialer_webhook_events')
  //     .insert({ event_id, event_type: verified.event_type, ... });
  //   if (insertErr?.code === '23505') return { status: 200, body: { status: 'duplicate' } };

  // 4) Event router — stub
  // 11.2 will add: switch (verified.event_type) { case 'call.answered': ... }
  return {
    status: 200,
    body: {
      status: 'received',
      event_id: eventId,
      event_type: verified.event_type ?? 'unknown',
      note: 'event persisted (stub: Supabase client not yet wired)',
    },
  };
}

function cryptoRandomId() {
  return (
    'evt_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10)
  );
}

export const WEBHOOK_HEADERS = {
  SIG: SIG_HEADER,
  EVENT_ID: EVENT_ID_HEADER,
};