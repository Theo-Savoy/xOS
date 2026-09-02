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
  has_connection_id: boolean;
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
    // S2 (audit 11.13) : connection_id / webhook_url ne sont PLUS envoyés —
    // le serveur les résout côté config (fail-closed si non configuré).
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
  /** Caller ID autorisé résolu côté serveur ; null uniquement en dry-run ou
   * quand aucun numéro source n'est configuré. */
  caller_number: string | null;
  expires_in: number;
  sip_uri?: string | null;
};

/**
 * Obtient un token WebRTC éphémère (audit 11.2 B.2). En dry-run, le serveur
 * renvoie { token: null } — le navigateur ne peut pas se connecter.
 * Lot 11.7 : le budget n'est plus réservé ici (un token couvre une session,
 * pas un appel) — la réservation se fait par composition (notifyCallStarted).
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

export type CallStartedResult = {
  dry_run: boolean;
  /** Id de la ligne dialer_calls (null en dry-run). À renvoyer sur call_ended. */
  call_record_id: number | null;
};

/**
 * Lot 11.7 : registre + budget AVANT chaque composition réelle. Le serveur
 * écrit la ligne dialer_calls ('dialing') et réserve le budget atomiquement.
 * Échec (429 budget, 403, 500) ⇒ l'appelant NE DOIT PAS composer — c'est le
 * pendant fail-loud du dry-run G2 : jamais d'appel réel hors traçabilité.
 */
export async function notifyCallStarted(
  token: string,
  params: {
    to: string;
    callerNumber?: string | null;
    contactId?: number | null;
    campaignId?: number | null;
  },
): Promise<CallStartedResult> {
  try {
    return await apiFetch<CallStartedResult>(
      token,
      '/api/dialer?resource=call_started',
      {
        method: 'POST',
        body: JSON.stringify({
          to: params.to,
          caller_number: params.callerNumber ?? null,
          contact_id: params.contactId ?? null,
          campaign_id: params.campaignId ?? null,
        }),
      },
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

/**
 * Lot 11.7 : clôture de la ligne après l'appel. Best-effort pour l'UX (un
 * échec de clôture ne doit pas casser la session — la réconciliation
 * webhooks Phase B rattrape les lignes orphelines), mais l'erreur est loggée
 * fort : pas de silent failure.
 * @returns true si le serveur a confirmé la clôture.
 */
export async function notifyCallEnded(
  token: string,
  params: {
    callRecordId: number;
    /** Statut terminal (vocabulaire dialer_calls) : 'ended' par défaut. */
    status?: 'no_answer' | 'voicemail' | 'busy' | 'failed' | 'ended';
    /** true si l'appel a été décroché ⇒ le budget est consommé. */
    answered?: boolean;
    durationSec?: number | null;
    hangupCause?: string | null;
  },
): Promise<boolean> {
  try {
    await apiFetch<{ closed: boolean }>(
      token,
      '/api/dialer?resource=call_ended',
      {
        method: 'POST',
        body: JSON.stringify({
          call_record_id: params.callRecordId,
          status: params.status ?? 'ended',
          answered: params.answered ?? false,
          duration_sec: params.durationSec ?? null,
          hangup_cause: params.hangupCause ?? null,
        }),
      },
    );
    return true;
  } catch (err) {
    // Loud : la ligne resterait 'dialing' sans trace de l'échec de clôture.
    console.error('[dialerApi] call_ended failed:', err);
    return false;
  }
}

export type UserCallRecord = {
  id: number;
  campaign_id: number | null;
  /** Masqué côté serveur (jamais d'E.164 prospect en clair). */
  to_number: string;
  status: string;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  hangup_cause: string | null;
  cost_cents: number;
  created_at: string;
};

/** Lot 11.7 : historique des appels de l'utilisateur (numéros masqués). */
export async function fetchUserCalls(
  token: string,
  limit = 50,
): Promise<{ total: number; calls: UserCallRecord[] }> {
  try {
    return await apiFetch<{ total: number; calls: UserCallRecord[] }>(
      token,
      `/api/dialer?resource=calls&limit=${limit}`,
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

export type PowerPoolCall = {
  id: number;
  pool_slot: number;
  /** Contact de séance rattaché (null hors séance : PowerDialerView autonome). */
  contact_id: number | null;
  to_number: string;
  status: string;
  amd_result: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  hangup_cause: string | null;
};

export type PowerPoolStatus = {
  id: string;
  parallelism: number;
  status: string;
  winner_call_id: number | null;
  calls: PowerPoolCall[];
};

export async function startPowerPool(
  token: string,
  params: {
    destinations: string[];
    parallelism: number;
    callerNumber?: string | null;
    /** Séance Combo : alignés 1:1 sur destinations (omis hors séance). */
    sessionId?: number | null;
    contactIds?: number[] | null;
  },
): Promise<{ dry_run: boolean; session_id: string | null; calls: Array<{ slot: number; call_record_id?: number; status: string; error?: string }> }> {
  return apiFetch(token, '/api/dialer?resource=pool_start', {
    method: 'POST',
    body: JSON.stringify({
      destinations: params.destinations,
      parallelism: params.parallelism,
      caller_number: params.callerNumber ?? null,
      ...(params.contactIds?.length
        ? { session_id: params.sessionId, contact_ids: params.contactIds }
        : {}),
    }),
  });
}

export async function fetchPowerPoolStatus(token: string, sessionId: string): Promise<PowerPoolStatus> {
  return apiFetch(token, `/api/dialer?resource=pool_status&session_id=${encodeURIComponent(sessionId)}`);
}

export async function hangupPowerPool(
  token: string,
  sessionId: string,
  callRecordId?: number | null,
): Promise<void> {
  await apiFetch(token, '/api/dialer?resource=pool_hangup', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, call_record_id: callRecordId ?? null }),
  });
}

/** Message utilisateur court pour un refus call_started (budget/quota). */
export function callBlockedMessage(err: unknown): string {
  if (err instanceof DialerApiError) {
    switch (err.code) {
      case 'budget_exceeded_session':
        return 'Budget de la session atteint — finis la session ou augmente le plafond.';
      case 'budget_exceeded_user_day':
        return 'Budget du jour atteint pour ton compte.';
      case 'budget_exceeded_org_month':
        return 'Budget mensuel de l’organisation atteint — le dialer est coupé.';
      case 'calls_exceeded_user_day':
        return 'Limite d’appels du jour atteinte.';
      case 'calls_exceeded_user_month':
        return 'Limite d’appels du mois atteinte.';
      case 'caller_number_not_owned':
        return 'Numéro appelant non valide pour ton compte.';
      case 'rate_limited':
        return 'Trop de requêtes — attends quelques secondes.';
      default:
        return `Appel refusé par le serveur (${err.code}).`;
    }
  }
  return 'Appel refusé par le serveur.';
}
