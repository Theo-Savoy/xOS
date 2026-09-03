/**
 * api/profile.js — profil de l'utilisateur connecté.
 *
 * GET /api/profile
 * Auth: Supabase JWT (Bearer token).
 * Retourne { role, sf_user_id, full_name, sf_auth_connected_at }.
 */
import { verifyJWT, respond } from './_auth.js';
import { getServiceClient } from './_calls/http.js';
import { getProfile } from './_calls/profileCache.js';

export async function GET(request) {
  const user = await verifyJWT(request);
  if (!user) return respond(401, { error: 'unauthorized' });

  const client = getServiceClient();
  if (!client) return respond(500, { error: 'supabase_unavailable' });

  const profile = await getProfile(client, user.id);
  if (profile.error) return respond(500, { error: profile.error });

  return respond(200, {
    role: profile.role,
    sf_user_id: profile.sfUserId,
    full_name: profile.fullName ?? null,
    sf_auth_connected_at: profile.sfAuthConnectedAt ?? null,
  });
}