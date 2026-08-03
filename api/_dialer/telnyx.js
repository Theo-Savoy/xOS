/**
 * api/_dialer/telnyx.js — Telnyx Call Control REST client (transport).
 *
 * Spec: docs/audits/lot-11.0-telnyx.md §2, docs/specs/lot-11.1-telnyx-infra.md §2.7.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P0-5 (client was absent).
 *
 * Responsibilities:
 *  - POST /v2/calls (dial) with AMD premium, Europe region, timeout 30s
 *  - POST /v2/calls/{call_control_id}/actions/hangup
 *  - DRY-RUN: never hits the network. A dry-run dial returns the fixture
 *    response. This is enforced INSIDE telnyxPost() — the single choke point
 *    that touches globalThis.fetch — so no caller can accidentally bypass it.
 *
 * The config's isDryRun flag is the ONLY thing that gates the network. See
 * api/dialer.js for the OR-merge of cfg.isDryRun and flags.dryRun.
 */

import { loadDialerConfig } from './config.js';
import dialFixture from './_fixtures/dialResponse.json' with { type: 'json' };
import hangupFixture from './_fixtures/hangupResponse.json' with { type: 'json' };

const TELNYX_API = 'https://api.telnyx.com/v2';

export class TelnyxError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Telnyx HTTP ${status}`);
    this.name = 'TelnyxError';
    this.status = status;
    this.code = body?.code ?? body?.error ?? 'telnyx_error';
    this.errors = body?.errors || [];
  }
}

/** Single network choke point. Dry-run short-circuits BEFORE fetch. */
async function telnyxPost(path, body, apiKey, dryRun) {
  if (dryRun) {
    return path.startsWith('/calls/') && path.endsWith('/actions/hangup')
      ? hangupFixture
      : dialFixture;
  }
  const res = await fetch(`${TELNYX_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new TelnyxError(res.status, errBody);
  }
  return res.json();
}

/**
 * Dial one contact. Returns the Telnyx identifiers.
 * client_state = base64(JSON({ sessionId, contactId, userId })) — echoed back
 * in every webhook for this call.
 */
export async function dialContact({
  apiKey,
  connectionId,
  from,
  to,
  webhookUrl,
  clientState,
  amd = 'premium',
  dryRun = false,
  record = false,
}) {
  const { data } = await telnyxPost(
    '/calls',
    {
      connection_id: connectionId,
      from,
      to,
      webhook_url: webhookUrl,
      webhook_url_method: 'POST',
      client_state: Buffer.from(JSON.stringify(clientState)).toString('base64'),
      answering_machine_detection: amd,
      sip_region: 'Europe',
      timeout_secs: 30,
      ...(record ? { record: 'record-from-answer', record_channels: 'single' } : {}),
    },
    apiKey,
    dryRun,
  );
  return {
    callControlId: data.call_control_id,
    callLegId: data.call_leg_id,
    callSessionId: data.call_session_id,
  };
}

/** Dial N contacts in parallel. Returns Map<contactId, result>. */
export async function dialParallel({
  apiKey,
  connectionId,
  from,
  contacts,
  webhookUrl,
  sessionId,
  userId,
  dryRun = false,
}) {
  const results = new Map();
  await Promise.allSettled(
    contacts.map(async (contact) => {
      try {
        const dialed = await dialContact({
          apiKey,
          connectionId,
          from,
          to: contact.phone,
          webhookUrl,
          clientState: { sessionId, contactId: contact.id, userId },
          dryRun,
        });
        results.set(contact.id, { ...dialed, contact, status: 'dialing' });
      } catch (err) {
        results.set(contact.id, {
          contact,
          status: 'dial_failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
  return results;
}

/** Hang up an active call by call_control_id. */
export async function hangupCall({ apiKey, callControlId, dryRun = false }) {
  await telnyxPost(
    `/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
    { cause: 'user_hangup' },
    apiKey,
    dryRun,
  );
  return { ok: true };
}

/** Config-driven wrapper: loads config and enforces the unified dry-run flag. */
export async function telnyxClient({ dryRun, apiKey, connectionId, callerId, webhookUrl } = {}) {
  const cfg = loadDialerConfig();
  return {
    dryRun: dryRun ?? cfg.isDryRun,
    apiKey: apiKey ?? cfg.apiKey,
    connectionId: connectionId ?? null,
    callerId: callerId ?? cfg.callerId,
    webhookUrl: webhookUrl ?? null,
  };
}

export const TELNYX_API_BASE = TELNYX_API;
