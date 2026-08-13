/** Telnyx Call Control transport. */
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

async function telnyxPost(path, body, apiKey, dryRun, { raw = false } = {}) {
  if (dryRun) {
    if (raw) return 'DRYRUN_RTC_JWT';
    return path.startsWith('/calls/') && path.endsWith('/actions/hangup')
      ? hangupFixture
      : dialFixture;
  }
  const response = await fetch(`${TELNYX_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new TelnyxError(response.status, errorBody);
  }
  return raw ? response.text() : response.json();
}

async function telnyxGet(path, apiKey) {
  const response = await fetch(`${TELNYX_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new TelnyxError(response.status, errorBody);
  }
  return response.json();
}

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
  commandId,
  linkTo,
  bridgeOnAnswer = false,
  preventDoubleBridge = false,
}) {
  const { data } = await telnyxPost('/calls', {
    connection_id: connectionId,
    from,
    to,
    privacy: 'none',
    webhook_url: webhookUrl,
    webhook_url_method: 'POST',
    client_state: Buffer.from(JSON.stringify(clientState)).toString('base64'),
    ...(amd ? { answering_machine_detection: amd } : {}),
    sip_region: 'Europe',
    timeout_secs: 30,
    ...(commandId ? { command_id: commandId } : {}),
    ...(linkTo ? { link_to: linkTo } : {}),
    ...(bridgeOnAnswer ? { bridge_on_answer: true } : {}),
    ...(preventDoubleBridge ? { prevent_double_bridge: true } : {}),
    ...(record ? { record: 'record-from-answer', record_channels: 'single' } : {}),
  }, apiKey, dryRun);
  return {
    call_control_id: data.call_control_id,
    call_leg_id: data.call_leg_id,
    call_session_id: data.call_session_id,
    command_id: commandId ?? null,
  };
}

export async function dialParallel({
  apiKey, connectionId, from, contacts, webhookUrl, sessionId, userId, dryRun = false,
}) {
  const results = new Map();
  await Promise.allSettled(contacts.map(async (contact) => {
    try {
      const dialed = await dialContact({
        apiKey, connectionId, from, to: contact.phone, webhookUrl,
        clientState: { sessionId, contactId: contact.id, userId }, dryRun,
      });
      results.set(contact.id, { ...dialed, contact, status: 'dialing' });
    } catch (error) {
      results.set(contact.id, {
        contact, status: 'dial_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }));
  return results;
}

export async function issueRtcToken({ apiKey, credentialId, ttlSec = 600, dryRun = false }) {
  return telnyxPost(
    `/telephony_credentials/${encodeURIComponent(credentialId)}/token`,
    { expires_in: ttlSec }, apiKey, dryRun, { raw: true },
  );
}

export async function getTelephonyCredential({ apiKey, credentialId }) {
  const { data } = await telnyxGet(
    `/telephony_credentials/${encodeURIComponent(credentialId)}`,
    apiKey,
  );
  if (!data?.sip_username) throw new TelnyxError(502, { error: 'missing_sip_username' });
  return { sipUsername: data.sip_username };
}

export async function hangupCall({ apiKey, callControlId, commandId, dryRun = false }) {
  await telnyxPost(
    `/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
    { cause: 'user_hangup', ...(commandId ? { command_id: commandId } : {}) },
    apiKey,
    dryRun,
  );
  return { ok: true };
}

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
