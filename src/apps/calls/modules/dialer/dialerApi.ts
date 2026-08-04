/**
 * modules/dialer/dialerApi.ts — typed client for /api/dialer.
 *
 * GET  /api/dialer?resource=config  — JWT requis (fix visibilité audit §2.3)
 * POST /api/dialer?resource=dial    — dial one contact (JWT + flags + budget gate)
 * POST /api/dialer?resource=webrtc_token — token WebRTC éphémère (JWT + gates)
 *
 * The Supabase session token IS the auth: the route verifies it server-side.
 *
 * NOTE (audit 11.13 §2.11) : dialCall() n'a AUCUN appelant en production — le
 * dial passe par WebRTC (fetchRtcToken + SDK). Le endpoint serveur
 * ?resource=dial reste en place (api/dialer.js, gardé par budget + E.164 +
 * idempotency depuis le lot 11.13). Conservé comme chemin Call Control de
 * secours / futur — à supprimer ou réactiver selon arbitrage produit.
 */

import { apiFetch, ApiError } from '../../../../lib/apiClient';

export type DialerFlags = {
  enabled: boolean;
  dry_run: boolean | null;
  budget_session_cents: number;
  budget_user_day_cents: number;
  budget_org_month_cents: number;
  rate_rps: number;
  rate_burst: number;
};

export type DialerConfig = {
  env: string;
  is_dry_run: boolean;
  has_caller_id: boolean;
  has_webhook_public_key: boolean;
  caller_numbers: Array<{
    e164: string;
    label: string | null;
    status: string;
    priority: number;
  }>;
  entitlement: {
    enabled: boolean;
    dry_run: boolean;
  };
  flags: DialerFlags;
};

export type DialCallParams = {
  to: string;
  connectionId: string;
  webhookUrl: string;
  sessionId?: number | null;
  contactId?: number | null;
  campaignId?: number | null;
};

export type DialCallResult = {
  ok: boolean;
  dry_run: boolean;
  /** Contrat réel Telnyx (POST /v2/calls) : call_control_id, call_leg_id,
   * call_session_id. L'ancien champ call_id n'existe pas côté Telnyx — les
   * tests qui mockaient call_id vérifiaient un contrat erroné (P0 codex). */
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  command_id?: string | null;
  error?: string;
  message?: string;
};

export class DialerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DialerApiError';
  }
}

export async function fetchDialerConfig(token: string): Promise<DialerConfig> {
  try {
    return await apiFetch<DialerConfig>(
      token,
      '/api/dialer?resource=config',
    );
  } catch (err) {
    if (err instanceof ApiError) {
      throw new DialerApiError(
        err.status,
        (err.body as { error?: string } | undefined)?.error ?? `http_${err.status}`,
        err.message,
      );
    }
    throw err;
  }
}

export async function dialCall(
  token: string,
  params: DialCallParams,
): Promise<DialCallResult> {
  const body = {
    to: params.to,
    connection_id: params.connectionId,
    webhook_url: params.webhookUrl,
    session_id: params.sessionId ?? null,
    contact_id: params.contactId ?? null,
    campaign_id: params.campaignId ?? null,
  };
  try {
    return await apiFetch<DialCallResult>(token, '/api/dialer?resource=dial', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new DialerApiError(
        err.status,
        (err.body as { error?: string } | undefined)?.error ?? `http_${err.status}`,
        err.message,
      );
    }
    throw err;
  }
}

export type RtcTokenResult = {
  dry_run: boolean;
  token: string | null;
  expires_in: number;
};

/**
 * Obtient un token WebRTC éphémère (audit 11.2 B.2). En dry-run, le serveur
 * renvoie { token: null } — le navigateur ne peut pas se connecter.
 */
export async function fetchRtcToken(
  token: string,
  callerNumber?: string,
): Promise<RtcTokenResult> {
  try {
    return await apiFetch<RtcTokenResult>(
      token,
      '/api/dialer?resource=webrtc_token',
      { method: 'POST', body: JSON.stringify({ caller_number: callerNumber ?? null }) },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      throw new DialerApiError(
        err.status,
        (err.body as { error?: string } | undefined)?.error ?? `http_${err.status}`,
        err.message,
      );
    }
    throw err;
  }
}
