/**
 * api/_review/shared.js — CRUD for shared analyses (Régie).
 * Table: shared_analyses (Supabase, service-role only writes).
 */

/**
 * List shared analyses visible to a user.
 * - Manager/admin: sees own shares + shares received + team-wide
 * - Commercial: sees only shares received + team-wide
 */
export async function listShared(client, userId, role) {
  const isManager = role === 'manager' || role === 'admin';

  let query = client
    .from('shared_analyses')
    .select(
      'id, created_by, recipient_id, config, note, created_at, revoked_at',
    )
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (!isManager) {
    // Commercial: only shares addressed to them or team-wide
    query = query.or(`recipient_id.eq.${userId},recipient_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return { error: 'shared_lookup_failed', status: 500 };
  return { analyses: data || [] };
}

/**
 * Create a shared analysis (manager/admin only).
 * @param {object} params
 * @param {object} params.client - Supabase service client
 * @param {string} params.userId - creator's profile id
 * @param {object} params.config - { granularity, period, owner?, sections? }
 * @param {string} [params.note]
 * @param {string|null} [params.recipientId] - null = team-wide
 */
export async function createShared({
  client,
  userId,
  config,
  note,
  recipientId,
}) {
  if (!config || typeof config !== 'object') {
    return { error: 'invalid_config', status: 400 };
  }
  const { granularity, period } = config;
  if (!granularity || !period) {
    return { error: 'config_missing_granularity_or_period', status: 400 };
  }

  const { data, error } = await client
    .from('shared_analyses')
    .insert({
      created_by: userId,
      recipient_id: recipientId || null,
      config,
      note: note || null,
    })
    .select('id, created_by, recipient_id, config, note, created_at')
    .single();

  if (error) return { error: 'share_insert_failed', status: 500 };
  return { analysis: data };
}

/**
 * Revoke a shared analysis (manager/admin only, must be the creator).
 */
export async function revokeShared(client, userId, analysisId) {
  const { data, error } = await client
    .from('shared_analyses')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', analysisId)
    .eq('created_by', userId)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116')
      return { error: 'not_found_or_not_owner', status: 404 };
    return { error: 'revoke_failed', status: 500 };
  }
  return { revoked: data.id };
}
