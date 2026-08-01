/**
 * api/dialer.js — Telnyx Power Dialer router.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §3.
 *
 * Resources:
 *   GET  /api/dialer?resource=config         — env, flags, budget remaining
 *   POST /api/dialer?resource=campaigns     — create campaign (11.2)
 *   GET  /api/dialer?resource=campaigns     — list user's campaigns (11.2)
 *   GET  /api/dialer?resource=calls         — list calls (11.2)
 *   POST /api/dialer?resource=webhooks      — Telnyx webhook receiver (signature-verified)
 *   GET  /api/dialer?resource=audit        — audit log read (manager/admin only, 11.1)
 *
 * Lot 11.1 only ships:
 *   - The router (this file) returning 503 for non-implemented resources
 *   - GET ?resource=config for inspection
 *   - POST ?resource=webhooks for signature verification + idempotency
 *
 * Other resources return 501 Not Implemented until their respective lots.
 */

import { loadDialerConfig, loadDialerFlags } from './_dialer/config.js';
import { handleWebhook } from './_dialer/webhooks.js';

const NOT_IMPLEMENTED = (resource) => ({
  status: 501,
  body: {
    error: 'not_implemented',
    resource,
    message: `Resource ${resource} ships in a later lot (see docs/specs/lot-11.1-telnyx-infra.md).`,
  },
});

async function handleConfig(client, { req, res, user }) {
  const cfg = loadDialerConfig();
  const flags = await loadDialerFlags(client);
  return {
    status: 200,
    body: {
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
    },
  };
}

export default async function handler(req, res) {
  // The dialer router is wired but disabled until Théo opts in via settings.
  // Pre-flight: reject everything if dialer_enabled=false, EXCEPT ?resource=config
  // (so QA can read state without triggering side-effects).
  const url = new URL(req.url, `https://${req.headers.host ?? 'localhost'}`);
  const resource = url.searchParams.get('resource');

  try {
    // 1) config — open read
    if (resource === 'config') {
      const client = await getSupabaseServiceClient(req);
      return await handleConfig(client, { req, res, user: null });
    }

    // 2) webhooks — Telnyx calls us, no user auth (signature is the auth)
    if (resource === 'webhooks' && req.method === 'POST') {
      return await handleWebhook(req, res);
    }

    // 3) audit — manager/admin only
    if (resource === 'audit') {
      // implemented in a follow-up: query dialer_audit_log filtered by user
      return NOT_IMPLEMENTED(resource);
    }

    // 4) All other resources are gated by dialer_enabled flag and require JWT
    const client = await getSupabaseServiceClient(req);
    const user = await getAuthedUser(client, req);
    if (!user) {
      return { status: 401, body: { error: 'unauthenticated' } };
    }

    const flags = await loadDialerFlags(client);
    if (!flags.enabled) {
      return {
        status: 503,
        body: {
          error: 'dialer_disabled',
          message:
            'Dialer feature is currently disabled. Enable via settings.dialer_enabled.',
        },
      };
    }

    // Defer to lot 11.2+
    switch (resource) {
      case 'campaigns':
        return NOT_IMPLEMENTED(resource);
      case 'calls':
        return NOT_IMPLEMENTED(resource);
      default:
        return {
          status: 400,
          body: {
            error: 'unknown_resource',
            valid: ['config', 'webhooks', 'campaigns', 'calls', 'audit'],
          },
        };
    }
  } catch (err) {
    console.error('[dialer.handler] unexpected error:', err);
    return {
      status: 500,
      body: {
        error: 'internal_error',
        message: err instanceof Error ? err.message : 'unknown',
      },
    };
  }
}

// Helpers (placeholders — wired to the real _auth.js in a follow-up commit)
async function getSupabaseServiceClient() {
  throw new Error('getSupabaseServiceClient not yet wired (11.1 stub)');
}
async function getAuthedUser() {
  throw new Error('getAuthedUser not yet wired (11.1 stub)');
}