/**
 * api/_dialer/idempotency.js — Webhook event de-duplication.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.4.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P1-1 (cryptoRandomId fallback).
 *
 * Idempotency strategy: INSERT-first. `dialer_webhook_events.event_id` is the
 * PRIMARY KEY (migration 039), so a concurrent duplicate insert fails with
 * 23505 and the PK itself is the lock — no select-then-insert race window.
 *
 * The dedup key MUST be deterministic. We use data.id when present, else a
 * sha256 of the raw body — never a random value (a random key would make
 * every Telnyx retry a brand-new event, inverting the protection).
 */

import { createHash } from 'node:crypto';

/**
 * Deterministic dedup key from a Telnyx event body.
 * - data.id when present (the canonical Telnyx event id)
 * - else sha256 of the raw body (two deliveries of the same event hash alike)
 */
export function extractEventId(rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = null;
  }
  const id = parsed?.data?.id;
  if (typeof id === 'string' && id.length > 0) return id;
  return `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;
}

/**
 * Record an incoming webhook event, atomically.
 *
 * Returns:
 *   { isDuplicate: true }               — event already seen (PK 23505)
 *   { isDuplicate: false, rowId }       — newly recorded
 *
 * Any error OTHER than 23505 is thrown: an unknown failure must fail the
 * webhook, NOT be treated as a "new event" (that would let duplicates
 * through exactly when the table is broken).
 */
export async function checkAndRecordWebhook(
  client,
  { eventId, eventType, payload, signatureOk = true, campaignId = null, callId = null },
) {
  const { data, error } = await client
    .from('dialer_webhook_events')
    .insert({
      event_id: eventId,
      event_type: eventType || 'unknown',
      payload,
      signature_ok: signatureOk,
      campaign_id: campaignId,
      call_id: callId,
    })
    .select('event_id')
    .maybeSingle();

  if (error?.code === '23505') return { isDuplicate: true, rowId: null };
  if (error) throw new Error(`idempotency insert failed: ${error.message}`);
  return { isDuplicate: false, rowId: data?.event_id ?? eventId };
}
