/**
 * api/dialer.js — Telnyx Power Dialer router.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §3.
 * Audit: docs/audits/lot-11.1-go-nogo-transport.md P0-2 (Response), P0-6 (client stub),
 * P1-3 (circuit breaker), P2-5 (maxDuration).
 *
 * Resources:
 *   GET  /api/dialer?resource=config        — env, flags, budget remaining (JWT)
 *   POST /api/dialer?resource=webhooks      — Telnyx webhook receiver (OPEN: Ed25519 is the auth)
 *   POST /api/dialer?resource=dial          — dial one contact (JWT + flags + budget gate)
 *   POST /api/dialer?resource=webrtc_token  — token WebRTC éphémère (JWT + flags + entitlement + budget)
 *   GET  /api/dialer?resource=campaigns     — list user's campaigns (11.2)
 *   GET  /api/dialer?resource=calls         — list calls (11.2)
 *   GET  /api/dialer?resource=audit         — audit log read (manager/admin only, 11.1+)
 *
 * Auth model (critical, mirrors middleware.js isAuthBridge):
 *   - `webhooks` is OPEN. Telnyx cannot send a JWT; the Ed25519 signature is the auth.
 *   - EVERY other resource requires a valid JWT (verifyJWT) — y compris config.
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
import { dialContact, issueRtcToken } from './_dialer/telnyx.js';
import { RateLimiter } from './_dialer/rateLimit.js';

export const config = { maxDuration: 30 };

// S4 (audit 11.13) : rate limiter par user. NOTE : bucket in-memory = par
// instance Vercel (pas partagé multi-instance) — meilleur que rien, à passer
// sur un store partagé (Redis/Supabase) si le dialer passe multi-instance.
const rateLimiter = new RateLimiter({ capacity: 20, refillPerSecond: 5 });

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

/**
 * S11 (audit 11.13) : pseudonymise un numéro E.164 pour l'audit — hash FNV-1a
 * sans secret (déterministe, pas réversible, pas stocké en clair). Suffisant
 * pour tracer sans exposer le numéro du prospect (RGPD / rétention).
 */
function hashE164(e164) {
  let h = 0x811c9dc5;
  for (let i = 0; i < e164.length; i += 1) {
    h ^= e164.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `h${h.toString(16).padStart(8, '0')}`;
}

async function handleConfig(client, user) {
  const cfg = loadDialerConfig();
  const flags = await loadDialerFlags(client);
  // Entitlement de l'utilisateur courant (exigé : config n'est plus un open read,
  // cf. audit claude §2.3 — il fuitait env/budgets sans auth).
  const entitlements = user
    ? await loadUserEntitlements(client, user.id)
    : { enabled: false, dryRun: true };

  // Numéros de caller ID alloués à l'utilisateur (sélecteur Phase A —
  // table dialer_phone_numbers, prévue par le schéma depuis le début).
  let callerNumbers = [];
  if (user) {
    const { data: numbers, error: numbersErr } = await client
      .from('dialer_phone_numbers')
      .select('e164, label, status, priority')
      .eq('owner_user_id', user.id)
      .in('status', ['active', 'cooldown'])
      .order('priority', { ascending: true });
    if (numbersErr) {
      console.error('[dialer.config] load caller numbers failed:', numbersErr.message);
    } else {
      callerNumbers = (numbers ?? []).map((n) => ({
        e164: n.e164,
        label: n.label ?? null,
        status: n.status,
        priority: n.priority ?? 99,
      }));
    }
  }

  return json(200, {
    env: cfg.env,
    is_dry_run: cfg.isDryRun,
    has_caller_id: Boolean(cfg.callerId),
    has_webhook_public_key: Boolean(cfg.webhookPublicKey),
    caller_numbers: callerNumbers,
    entitlement: {
      enabled: entitlements.enabled,
      dry_run: entitlements.dryRun,
    },
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

/** Caps de budget : mêmes plafonds pour le dial Call Control et le token
 *  WebRTC (org via flags, user via entitlements). */
function budgetCaps(flags, entitlements) {
  return {
    sessionCents: flags.budgetSessionCents,
    userDayCents: entitlements.budgetDayCents,
    orgMonthCents: flags.budgetOrgMonthCents,
    userDayCalls: entitlements.callsDayLimit,
    userMonthCalls: entitlements.callsMonthLimit,
  };
}

/**
 * POST ?resource=webrtc_token — token éphémère pour le SDK WebRTC.
 * (Audit 11.2 B.2) Mêmes gates que le dial : JWT → flags → entitlement →
 * dry-run. En dry-run, AUCUN token n'est émis : le navigateur ne peut pas se
 * connecter parce qu'il n'a rien avec quoi se connecter (G2).
 * `client` et `flags` sont résolus par le routeur (JWT → client → flags.enabled),
 * qui a déjà renvoyé 503 si le dialer est coupé.
 */
async function handleWebrtcToken(request, user, client, flags) {
  // S4 (audit 11.13) : rate limit par user (bucket in-memory, cf. note).
  const rl = rateLimiter.tryConsume(`user:${user.id}`);
  if (!rl.allowed) {
    return json(429, { error: 'rate_limited', retry_after_ms: rl.retryAfterMs });
  }

  const cfg = loadDialerConfig();
  const entitlements = await loadUserEntitlements(client, user.id);

  const isDryRun =
    cfg.isDryRun || flags.dryRun === true || entitlements.dryRun === true;

  if (!entitlements.enabled && !isDryRun) {
    return json(403, { error: 'dialer_entitlement_denied' });
  }

  // Dry-run : pas de token. Le navigateur reçoit { token: null } et reste en
  // mode simulation — impossible de transformer ça en vrai appel.
  if (isDryRun) {
    return json(200, { dry_run: true, token: null, expires_in: 0 });
  }

  if (!entitlements.telnyxCredentialId) {
    return json(409, { error: 'no_rtc_credential' });
  }

  // B7 (audit 11.3) : validation du caller_number contre dialer_phone_numbers —
  // le navigateur ne doit pas pouvoir choisir un numéro qui n'appartient pas à
  // l'utilisateur. Le sélecteur frontend l'envoie ; on vérifie ici.
  let callerNumber = null;
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const requestedCaller = body?.caller_number;
  if (requestedCaller) {
    const { data: owned } = await client
      .from('dialer_phone_numbers')
      .select('e164')
      .eq('owner_user_id', user.id)
      .eq('e164', requestedCaller)
      .in('status', ['active', 'cooldown'])
      .maybeSingle();
    if (!owned) {
      return json(403, { error: 'caller_number_not_owned' });
    }
    callerNumber = owned.e164;
  }

  // S1 (audit 11.13 sécurité) : le chemin WebRTC — le chemin RÉELLEMENT
  // utilisé — doit être gardé comme le dial Call Control. Un token = un
  // appel potentiel ≈ 1 cent : on réserve avant d'émettre. Sinon un user
  // entitlé pourrait composer hors caps session/jour/org.
  const reservation = await reserveBudget(client, {
    userId: user.id,
    campaignId: body?.campaign_id ?? null,
    estimatedCostCents: 1,
    caps: budgetCaps(flags, entitlements),
  });

  if (!reservation.allowed) {
    return json(429, { error: reservation.reason });
  }

  try {
    const token = await issueRtcToken({
      apiKey: cfg.apiKey,
      credentialId: entitlements.telnyxCredentialId,
      ttlSec: 600,
      dryRun: false,
    });

    // Reservation consumed : le token est émis, l'appel est (potentiellement)
    // passé. La consommation réelle exacte sera réconciliée sur hangup (Phase
    // B — webhooks) ; ici on garde le cap défensif.
    await releaseReservation(client, reservation.reservationId, { result: 'consumed' });

    await writeAudit(client, buildAuditRow({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'webrtc_token',
      payload: { caller_number: callerNumber },
      costCents: 1,
      result: 'success',
      metadata: { env: cfg.env, dry_run: false },
    })).catch((e) => console.error('[dialer] audit write failed:', e.message));

    return json(200, { dry_run: false, token, caller_number: callerNumber, expires_in: 600 });
  } catch (err) {
    // L'émission a échoué : on libère la réservation (cap non consommé).
    await releaseReservation(client, reservation.reservationId, { result: 'released' });
    console.error('[dialer] webrtc token issue failed:', err instanceof Error ? err.message : err);
    return json(502, { error: 'webrtc_token_failed' });
  }
}

/**
 * POST ?resource=dial — dial ONE contact through Telnyx.
 * Gate order: JWT → flags.enabled → budget check → Telnyx dial. Les deux
 * premières gates sont tenues par le routeur, qui passe `client` et `flags`.
 * On ORG_EXCEEDED the kill switch is flipped (P1-3) — dialer_enabled=false.
 */
async function handleDial(request, user, client, flags) {
  // S4 (audit 11.13) : rate limit par user (bucket in-memory, cf. note).
  const rl = rateLimiter.tryConsume(`user:${user.id}`);
  if (!rl.allowed) {
    return json(429, { error: 'rate_limited', retry_after_ms: rl.retryAfterMs });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json_body' });
  }

  const to = body?.to;
  if (!to) {
    return json(400, { error: 'missing_fields', required: ['to'] });
  }
  // S3 (audit 11.13 sécurité) : validation E.164 serveur — le client ne doit
  // pas pouvoir injecter un format non-E.164 (SIP, chaînes d'abus).
  if (!/^\+[1-9]\d{6,14}$/.test(to)) {
    return json(400, { error: 'invalid_e164' });
  }
  // S2 (audit 11.13 sécurité) : connection_id / webhook_url / from du body
  // sont IGNORÉS — on résout connection et caller ID depuis la config
  // serveur (fail-closed si non configuré, jamais de dial via une connection
  // arbitraire contrôlée par le client). Le webhook est l'URL serveur fixe.
  const cfg = loadDialerConfig();
  const connectionId = cfg.connectionId;
  const webhookUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://xos-dechet-repo.vercel.app'}/api/dialer?resource=webhooks`;

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

  // Fail-closed : sans connection Call Control configurée côté serveur, pas
  // de dial (sauf dry-run qui ne touche pas le réseau).
  if (!connectionId && !isDryRun) {
    return json(503, { error: 'dial_not_configured' });
  }

  // Budget reservation — atomic (advisory lock in RPC). Estimated cost of one
  // outbound FR dial ≈ 1 cent.
  const reservation = await reserveBudget(client, {
    userId: user.id,
    campaignId: body?.campaign_id ?? null,
    estimatedCostCents: 1,
    caps: budgetCaps(flags, entitlements),
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
    // S6 (audit 11.13) : code stable seul — l'objet `reservation` exposait la
    // forme interne des caps au client. Le détail reste côté serveur (audit).
    return json(429, { error: reservation.reason });
  }

  try {
    // S5 (audit 11.13) : idempotence par header client stable. Un double-clic
    // ou un retry après timeout rejoue la MÊME clé → Telnyx ignore le doublon
    // au lieu de créer deux appels réels. En l'absence de clé (ancien client),
    // on génère un id par requête (comportement historique, non dédupliqué).
    const idemKey = request.headers.get('x-idempotency-key') ?? crypto.randomUUID();
    const commandId = `xos-dial-${idemKey}`;
    const dialed = await dialContact({
      apiKey: cfg.apiKey,
      connectionId,
      from: cfg.callerId, // S2 : caller ID résolu serveur, jamais du body
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
      // S11 (audit 11.13) : `to` pseudonymisé (hash) — pas de numéro de
      // prospect en clair dans l'audit (RGPD / rétention).
      payload: { to: hashE164(to), connection_id: connectionId, dry_run: isDryRun, command_id: commandId },
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
      payload: { to: hashE164(to), connection_id: connectionId, dry_run: isDryRun },
      result: 'failed',
      errorCode: err instanceof Error ? err.code ?? err.name : 'unknown',
    })).catch(() => {});
    return json(502, { error: 'dial_failed' });
  }
}

export async function handler(request) {
  const url = new URL(request.url, 'http://localhost');
  const resource = url.searchParams.get('resource');

  try {
    // 1) webhooks — OPEN (Telnyx cannot carry a JWT; Ed25519 signature is the auth)
    if (resource === 'webhooks' && request.method === 'POST') {
      return await handleWebhook(request);
    }

    // 2) audit — manager/admin only (implemented in a follow-up)
    if (resource === 'audit') {
      return NOT_IMPLEMENTED(resource);
    }

    // 3) All other resources (config, dial, …): JWT required.
    // config est protégé depuis le fix visibilité (audit §2.3) : il renvoyait
    // env/budgets/état caller ID à quiconque sans auth.
    const user = await verifyJWT(request);
    if (!user) return json(401, { error: 'unauthenticated' });

    const client = getServiceClient();
    if (!client) return json(500, { error: 'service_client_unavailable' });

    // config — JWT requis mais PAS de gate enabled : c'est le panneau d'état,
    // il doit rester lisible même quand le dialer est désactivé.
    if (resource === 'config') {
      return await handleConfig(client, user);
    }

    const flags = await loadDialerFlags(client);
    if (!flags.enabled) {
      return json(503, {
        error: 'dialer_disabled',
        message: 'Dialer feature is currently disabled. Enable via settings.dialer_enabled.',
      });
    }

    if (resource === 'dial' && request.method === 'POST') {
      return await handleDial(request, user, client, flags);
    }

    // Token WebRTC éphémère (audit 11.2 B.2) : mêmes gates que le dial, mais
    // en dry-run on n'émet AUCUN token — le navigateur ne peut pas se
    // connecter parce qu'il n'a rien avec quoi se connecter (G2).
    if (resource === 'webrtc_token' && request.method === 'POST') {
      return await handleWebrtcToken(request, user, client, flags);
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
          valid: ['config', 'webhooks', 'dial', 'webrtc_token', 'campaigns', 'calls', 'audit'],
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
