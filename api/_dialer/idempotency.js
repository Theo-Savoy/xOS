/**
 * api/_dialer/idempotency.js — Webhook event de-duplication.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.4.
 *
 * Status: STUB. Wired in 11.2 when the Supabase client helper is added.
 * The interface here is what callers will use; the implementation will
 * delegate to dialer_webhook_events primary key.
 */

/**
 * Returns true if the event should be processed (not seen before),
 * false if it is a duplicate.
 *
 * In 11.2:
 *   const { data, error } = await client
 *     .from('dialer_webhook_events')
 *     .insert({ event_id, event_type, payload, signature_ok, received_at: now() })
 *     .select('id')
 *     .maybeSingle();
 *   if (error?.code === '23505') return { isDuplicate: true };
 *   if (error) throw error;
 *   return { isDuplicate: false, rowId: data.id };
 */
export async function checkAndRecordWebhook(client, { eventId, eventType, payload }) {
  // STUB — replace in 11.2
  void client;
  void payload;
  return {
    isDuplicate: false,
    rowId: null,
    note: 'STUB: idempotency check not yet wired to Supabase',
    eventId,
    eventType,
  };
}