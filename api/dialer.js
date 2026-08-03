/**
 * api/dialer.js — Telnyx Power Dialer router.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §3.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P0-2 (Response), P0-6 (client stub),
 * P1-3 (circuit breaker), P2-5 (maxDuration).
 *
 * Resources:
 *   GET  /api/dialer?resource=config        — env, flags, budget remaining (open read)
 *   POST /api/dialer?resource=webhooks      — Telnyx webhook receiver (OPEN: Ed25519 is the auth)
 *   POST /api/dialer?resource=dial          — dial one contact (JWT + flags + budget gate)
 *   GET  /api/dialer?resource=campaigns     — list user's campaigns (11.2)
 *   GET  /api/dialer?resource=calls         — list calls (11.2)
 *   GET  /api/dialer?resource=audit         — audit log read (manager/admin only, 11.1+)
 *
 * Auth model (critical, mirrors middleware.js isAuthBridge):
 *   - `webhooks` is OPEN. Telnyx cannot send a JWT; the Ed25519 signature is the auth.
 *   - EVERY other resource requires a valid JWT (verifyJWT).
 *   - `config` is an open read (state inspection without side effects).
 *
 * Unified dry-run (audit §8-d): cfg.isDryRun OR flags.dryRun — the most
 * pessimistic wins. One boolean, exposed to the whole layer.
 */

import { verifyJWT } from './_auth.js';
import { getServiceClient, jsonResponse } from './_calls/http.js';
import { loadDialerConfig, loadDialerFlags } from './_dialer/config.js';
import { handleWebhook } from './_dialer/webhooks.js';
import { reserveBudget, releaseReservation, loadUserEntitlements } from './_dialer/budget.js';
import { buildAuditRow, writeAudit } from './_dialer/audit.js';
import { dialContact } from './_dialer/telnyx.js';

export const config = { maxDuration: 30 };

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (status, body) => jsonResponse(status, body, headers);

const NOT_IMPLEMENTED = (resource) =>
  json(501, {
    error: 'not_implemented',
    resource,
    message: `Resource ${resource} ships in a later lot (see docs/specs/lot-11.1-telnyx-infra.md).`,
  });

async function handleConfig(client) {
  const cfg = loadDialerConfig();
  const flags = await loadDialerFlags(client);
  return json(200, {
    env: cfg.env,
    is_dry_run: cfg.isDryRun,
    has_caller_id: Boolean(cfg.callerId),
    has_webhook_public_key: Boolean(cfg.webhookPublicKey),
    flags: {
      enabled: flags.enabled,
      dry_run: flags.dryRun,
      budget_session_cents: flags.budgetSessionCents,
      budget_user_day_cents: flags.budgetUserDayCents,
      budget_org_month_cents: flags.budgetOrgMonthCents,
      rate_rps: flags.rateRps,
      rate_burst: flags.rateBurst,
    },
  });
}

/**
 * POST ?resource=dial — dial ONE contact through Telnyx.
 * Gate order: JWT → flags.enabled → budget check → Telnyx dial.
 * On ORG_EXCEEDED the kill switch is flipped (P1-3) — dialer_enabled=false.
 */
async function handleDial(request, user) {
  const client = getServiceClient();
  if (!client) return json(500, { error: 'service_client_unavailable' });

  const flags = await loadDialerFlags(client);
  if (!flags.enabled) {
    return json(503, { error: 'dialer_disabled' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json_body' });
  }

  const to = body?.to;
  const connectionId = body?.connection_id;
  const webhookUrl = body?.webhook_url;
  if (!to || !connectionId || !webhookUrl) {
    return json(400, {
      error: 'missing_fields',
      required: ['to', 'connection_id', 'webhook_url'],
    });
  }

  const cfg = loadDialerConfig();

  // Per-user entitlements (remote contract): enabled/dry_run/caps per user.
  const entitlements = await loadUserEntitlements(client, user.id);

  // Unified dry-run: the most pessimistic of ALL THREE levels wins — config,
  // org flags, and per-user entitlement. (Audit P0: entitlements.dryRun used
  // to be loaded but never read → a user with enabled=true,dry_run=true could
  // place a REAL call once the org flag flipped to false.)
  const isDryRun =
    cfg.isDryRun || flags.dryRun === true || entitlements.dryRun === true;

  if (!entitlements.enabled && !isDryRun) {
    return json(403, { error: 'dialer_entitlement_denied' });
  }

  // Budget reservation — atomic (advisory lock in RPC). Estimated cost of one
  // outbound FR dial ≈ 1 cent.
  const reservation = await reserveBudget(client, {
    userId: user.id,
    campaignId: body?.campaign_id ?? null,
    estimatedCostCents: 1,
    caps: {
      sessionCents: flags.budgetSessionCents,
      userDayCents: entitlements.budgetDayCents,
      orgMonthCents: flags.budgetOrgMonthCents,
      userDayCalls: entitlements.callsDayLimit,
      userMonthCalls: entitlements.callsMonthLimit,
    },
  });

  if (!reservation.allowed) {
    if (reservation.reason === 'budget_exceeded_org_month') {
      // P1-3: flip the kill switch + audit (best effort, non-blocking).
      // settings.value is jsonb; the migration stores dialer_enabled as the
      // JSON string "false" — JSON.stringify(false) produces exactly that.
      const { error: updateErr } = await client
        .from('settings')
        .update({ value: JSON.stringify(false) })
        .eq('key', 'dialer_enabled');
      if (updateErr) {
        console.error('[dialer] kill switch update failed:', updateErr.message);
      }
      await writeAudit(client, buildAuditRow({
        actorUserId: user.id,
        actorKind: 'system',
        action: 'settings_update',
        payload: { key: 'dialer_enabled', set: false, reason: 'budget_org_month_exceeded' },
        result: 'budget_exceeded',
        errorCode: 'budget_exceeded_org_month',
      })).catch((e) => console.error('[dialer] audit write failed:', e.message));
    }
    return json(429, { error: reservation.reason, reservation });
  }

  try {
    // Idempotence : un command_id unique par intention (P0 codex). Deux clics
    // ou un retry après timeout rejouent le MÊME id → Telnyx ignore le doublon
    // au lieu de créer deux appels réels.
    const commandId = `xos-dial-${crypto.randomUUID()}`;
    const dialed = await dialContact({
      apiKey: cfg.apiKey,
      connectionId,
      from: body?.from ?? cfg.callerId,
      to,
      webhookUrl,
      clientState: { sessionId: body?.session_id ?? null, contactId: body?.contact_id ?? null, userId: user.id },
      amd: body?.amd ?? 'premium',
      dryRun: isDryRun,
      record: Boolean(body?.record),
      commandId,
    });

    // Reservation consumed (cost was incurred / simulated) — keep the row.
    await releaseReservation(client, reservation.reservationId, { result: 'consumed' });

    await writeAudit(client, buildAuditRow({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'dial',
      payload: { to, connection_id: connectionId, dry_run: isDryRun, command_id: commandId },
      costCents: 1,
      result: 'success',
      metadata: { env: cfg.env, dry_run: isDryRun },
    })).catch((e) => console.error('[dialer] audit write failed:', e.message));

    return json(200, { ok: true, dry_run: isDryRun, ...dialed });
  } catch (err) {
    // Dial failed — release the reservation so the cap isn't eaten.
    await releaseReservation(client, reservation.reservationId, { result: 'released' });
    await writeAudit(client, buildAuditRow({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'dial',
      payload: { to, connection_id: connectionId, dry_run: isDryRun },
      result: 'failed',
      errorCode: err instanceof Error ? err.code ?? err.name : 'unknown',
    })).catch(() => {});
    return json(502, { error: 'dial_failed', message: err instanceof Error ? err.message : String(err) });
  }
}

export async function handler(request) {
  const url = new URL(request.url, 'http://localhost');
  const resource = url.searchParams.get('resource');

  try {
    // 1) config — open read (state inspection, no side effects)
    if (resource === 'config') {
      const client = getServiceClient();
      if (!client) return json(500, { error: 'service_client_unavailable' });
      return await handleConfig(client);
    }

    // 2) webhooks — OPEN (Telnyx cannot carry a JWT; Ed25519 signature is the auth)
    if (resource === 'webhooks' && request.method === 'POST') {
      return await handleWebhook(request);
    }

    // 3) audit — manager/admin only (implemented in a follow-up)
    if (resource === 'audit') {
      return NOT_IMPLEMENTED(resource);
    }

    // 4) All other resources: JWT required + dialer_enabled gate
    const user = await verifyJWT(request);
    if (!user) return json(401, { error: 'unauthenticated' });

    const client = getServiceClient();
    if (!client) return json(500, { error: 'service_client_unavailable' });

    const flags = await loadDialerFlags(client);
    if (!flags.enabled) {
      return json(503, {
        error: 'dialer_disabled',
        message: 'Dialer feature is currently disabled. Enable via settings.dialer_enabled.',
      });
    }

    if (resource === 'dial' && request.method === 'POST') {
      return await handleDial(request, user);
    }

    // Defer to lot 11.2+
    switch (resource) {
      case 'campaigns':
        return NOT_IMPLEMENTED(resource);
      case 'calls':
        return NOT_IMPLEMENTED(resource);
      default:
        return json(400, {
          error: 'unknown_resource',
          valid: ['config', 'webhooks', 'dial', 'campaigns', 'calls', 'audit'],
        });
    }
  } catch (err) {
    console.error('[dialer.handler] unexpected error:', err);
    return json(500, { error: 'internal_error' });
  }
}

// Vercel Web Handlers: method exports make the runtime pass a standards-based
// Request and forward the returned Response. A default function export would
// instead be treated as a Node (req, res) handler.
export const GET = handler;
export const POST = handler;
