/**
 * api/_dialer/persistence.js — registre d'appels (dialer_calls).
 *
 * Lot 11.7 (roadmap combo-power-dialing) : chaque composition réelle laisse
 * une trace en base. Avant ce lot, webrtc_token réservait du budget sans
 * jamais écrire de ligne — le registre 038 était orphelin (044 le disait
 * elle-même).
 *
 * Cycle de vie d'une ligne :
 *   openCallRow (call_started / dial) → status 'dialing', budget réservé
 *   closeCallRow (call_ended)         → status terminal + budget consommé
 *                                       (connecté) ou libéré (non-réponse /
 *                                       échec)
 *
 * Fail-loud sur l'ouverture : si la ligne ne peut pas être écrite, l'appel
 * NE PART PAS (budget réservé sans trace = fuite). Best-effort sur la
 * fermeture : la ligne sera close par la réconciliation Phase B (webhooks,
 * lot 11.8) si l'onglet meurt avant.
 */

/**
 * S11 : le numéro du prospect ne sort jamais en clair du serveur.
 * F4 (audit lot-11.7) : plancher relevé à 8 (minimum E.164 valide :
 * « + » + 7 chiffres) — en dessous, masquage INTÉGRAL. L'ancienne version
 * (slice(0,6)) révélait intégralement toute entrée ≤ 6 caractères.
 * Les numéros courts (8-10) ne gardent que l'indicatif pays ; les normaux
 * gardent préfixe pays + 2 derniers chiffres.
 */
export function maskE164(e164) {
  if (typeof e164 !== 'string' || e164.length < 8) return '****';
  if (e164.length < 11) return `${e164.slice(0, 2)}****`;
  return `${e164.slice(0, 3)}****${e164.slice(-2)}`;
}

/**
 * Crée la ligne dialer_calls d'un appel partant (statut 'dialing').
 * Lève si l'insert échoue — l'appelant doit libérer la réservation et
 * refuser le dial.
 * @returns {Promise<{id:number}>}
 */
export async function openCallRow(client, {
  ownerId,
  toNumber,
  campaignId = null,
  contactId = null,
  reservationId = null,
}) {
  const { data, error } = await client
    .from('dialer_calls')
    .insert({
      campaign_id: campaignId,
      contact_id: contactId,
      owner_user_id: ownerId,
      reservation_id: reservationId,
      to_number: toNumber,
      status: 'dialing',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`dialer_calls insert failed: ${error.message}`);
  }
  return { id: data.id };
}

/**
 * Clôture la ligne d'un appel : statut terminal, durée, cause + sort de la
 * réservation de budget (consommée si l'appel a été décroché, libérée sinon :
 * non-réponse, échec, abandon avant connexion).
 * Idempotent : une ligne déjà close n'est pas retouchée (double notification
 * SDK + call_ended, ou réconciliation webhook Phase B).
 * @returns {Promise<{closed:boolean}>}
 */
export async function closeCallRow(client, {
  callRecordId,
  ownerId,
  status,
  durationSec = null,
  hangupCause = null,
  answered = false,
}) {
  const { data: existing, error: findErr } = await client
    .from('dialer_calls')
    .select('id, reservation_id')
    .eq('id', callRecordId)
    .eq('owner_user_id', ownerId)
    .is('ended_at', null)
    .maybeSingle();
  if (findErr) throw new Error(`dialer_calls lookup failed: ${findErr.message}`);
  if (!existing) return { closed: false };

  // F3 (audit lot-11.7) : le release est conditionné aux lignes RÉELLEMENT
  // mises à jour par l'UPDATE (.select('id') renvoie les lignes affectées),
  // pas au lookup. Deux clôtureurs concurrents (client + réconciliation
  // webhooks 11.8) peuvent tous deux lire ended_at IS NULL ; seul celui qui
  // gagne l'UPDATE déclenche le release — plus de double libération possible.
  const { data: updated, error: updateErr } = await client
    .from('dialer_calls')
    .update({
      status,
      ended_at: new Date().toISOString(),
      ...(durationSec !== null ? { duration_sec: durationSec } : {}),
      ...(hangupCause ? { hangup_cause: hangupCause } : {}),
    })
    .eq('id', existing.id)
    .is('ended_at', null)
    .select('id');
  if (updateErr) throw new Error(`dialer_calls close failed: ${updateErr.message}`);
  if (!updated || updated.length === 0) return { closed: false };

  if (existing.reservation_id && client.rpc) {
    const { error: rpcErr } = await client.rpc('dialer_release_reservation', {
      p_reservation_id: existing.reservation_id,
      p_result: answered ? 'consumed' : 'released',
    });
    if (rpcErr) {
      console.error('[dialer.persistence] release_reservation failed:', rpcErr.message);
    }
  }
  return { closed: true };
}

/**
 * Historique des appels de l'utilisateur (GET ?resource=calls).
 * Numéros masqués (maskE164) — jamais d'E.164 prospect en clair côté client.
 */
export async function listUserCalls(client, userId, { limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { data, error, count } = await client
    .from('dialer_calls')
    .select(
      'id, campaign_id, to_number, status, started_at, answered_at, ended_at, duration_sec, hangup_cause, cost_cents, created_at',
      { count: 'exact' },
    )
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(capped);
  if (error) throw new Error(`dialer_calls list failed: ${error.message}`);
  return {
    total: count ?? (data ?? []).length,
    calls: (data ?? []).map((c) => ({ ...c, to_number: maskE164(c.to_number) })),
  };
}
