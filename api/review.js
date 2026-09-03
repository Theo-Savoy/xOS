/**
 * api/review.js — Régie cockpit macro endpoint.
 *
 * GET  /api/review?resource=kpis&period=FY26[&owner=005...]
 * GET  /api/review?resource=breakdown&period=FY26[&owner=005...]
 * GET  /api/review?resource=funnel&period=FY26[&owner=005...]
 * GET  /api/review?resource=attention[&owner=005...]
 * GET  /api/review?resource=shared
 * POST /api/review?resource=shared  { config, note?, recipient_id? }
 * DELETE /api/review?resource=shared&id=<uuid>
 *
 * Auth: Supabase JWT (Bearer token).
 * Access: manager/admin → global + owner filter; commercial → own data + shared only.
 */
import { verifyJWT } from './_auth.js';
import { getServiceClient } from './_calls/http.js';
import { getProfile } from './_calls/profileCache.js';
import { roleAtLeast, sfIdKey } from './_config/access.js';
import { fetchSFToken, searchContacts } from './_crm/salesforce.js';
import {
  parsePeriod,
  priorPeriodLabel,
  prior2PeriodLabel,
  earliestQueryDate,
} from './_review/period.js';
import {
  oppsByCloseDate,
  oppsByCreatedDate,
  eventsQuery,
  callsQuery,
  wonInPeriod,
  oppsCreatedInPeriod,
} from './_review/soql.js';
import { computeKpis } from './_review/kpis.js';
import { computeBreakdown } from './_review/breakdown.js';
import { computeFunnel } from './_review/funnel.js';
import { computeAttention } from './_review/attention.js';
import { computeCallStats } from './_review/calls.js';
import { listShared, createShared, revokeShared } from './_review/shared.js';

const CACHE_CONTROL = 'private, max-age=300, stale-while-revalidate=600';

// Cache court des données brutes SF par requête (identique à perf.js) :
// le frontend appelle les 6 resources en parallèle, et kpis/calls/funnel
// rejouent les mêmes SOQL — sans cache, chaque invocation re-tire l'org.
const SF_DATA_CACHE_TTL_MS = 60_000;
const sfDataCache = new Map();

/** Test-only hook to isolate the module-scope SF data cache. */
export function __resetSfDataCache() {
  sfDataCache.clear();
}

async function crmRecords(token, soql) {
  const key = `${token.slice(-8)}:${soql}`;
  const cached = sfDataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.records;
  const result = await searchContacts(token, soql);
  if (result.error) throw new Error(result.error);
  const records = result.records || [];
  sfDataCache.set(key, { records, expiresAt: Date.now() + SF_DATA_CACHE_TTL_MS });
  return records;
}

/**
 * Roster des SF User Id mappés (profiles + sf_user_map), dédupliqués.
 * Retourne [] si aucun roster n'existe (→ le caller garde un scope vide,
 * jamais null : null = toute l'org = timeout sur un gros org).
 */
async function mappedSfUserIds(client) {
  const { data: profiles, error } = await client
    .from('profiles')
    .select('sf_user_id');
  if (error) return [];
  const ids = [];
  const seen = new Set();
  const push = (id) => {
    if (!id) return;
    const key = sfIdKey(id);
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(id);
  };
  for (const row of profiles || []) push(row.sf_user_id);
  try {
    const { data: mapRows } = await client.from('sf_user_map').select('sf_user_id');
    for (const row of mapRows || []) push(row.sf_user_id);
  } catch {
    // sf_user_map absent → roster = profiles uniquement
  }
  return ids;
}

/**
 * Résout le scope owner effectif.
 * - commercial → toujours son propre sfUserId (ou [] si non mappé → 0 résultat)
 * - manager/admin sans filtre → roster complet (jamais null = toute l'org)
 * - manager/admin avec filtre → le filtre explicite
 */
async function resolveOwnerIds({ client, profile, requestedOwner }) {
  if (!roleAtLeast(profile.role, 'manager')) {
    return profile.sfUserId ? [profile.sfUserId] : [];
  }
  if (requestedOwner) return [requestedOwner];
  const roster = await mappedSfUserIds(client);
  return roster;
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': CACHE_CONTROL,
      ...extraHeaders,
    },
  });
}

/** Fetch SF token, preferring the user's own token if linked. */
async function sfToken(client, user) {
  const result = await fetchSFToken({ client, userId: user.id });
  if (result.error || !result.accessToken) return null;
  return result.accessToken;
}

export default async function handler(request) {
  const startedAt = Date.now();
  const user = await verifyJWT(request);
  if (!user) return json(401, { error: 'unauthorized' });

  const client = getServiceClient();
  if (!client) return json(500, { error: 'supabase_unavailable' });

  const profile = await getProfile(client, user.id);
  if (profile.error) return json(500, { error: profile.error });

  // Vercel peut passer request.url en relatif ou absolu selon la route/proxy.
  // new URL() throw sur un path relatif → parser tolérant.
  const rawUrl = String(request.url || '');
  const queryPart = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
  const searchParams = new URLSearchParams(queryPart);
  const resource = searchParams.get('resource') || 'kpis';
  const method = request.method.toUpperCase();

  // --- Shared analyses (Supabase only, no SF) ---
  if (resource === 'shared') {
    if (method === 'GET') {
      const result = await listShared(client, user.id, profile.role);
      if (result.error) return json(result.status, { error: result.error });
      return json(200, result);
    }
    if (method === 'POST') {
      if (!roleAtLeast(profile.role, 'manager')) {
        return json(403, { error: 'manager_required' });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: 'invalid_json' });
      }
      const result = await createShared({
        client,
        userId: user.id,
        config: body.config,
        note: body.note,
        recipientId: body.recipient_id || null,
      });
      if (result.error) return json(result.status, { error: result.error });
      return json(201, result);
    }
    if (method === 'DELETE') {
      if (!roleAtLeast(profile.role, 'manager')) {
        return json(403, { error: 'manager_required' });
      }
      const id = searchParams.get('id');
      if (!id) return json(400, { error: 'missing_id' });
      const result = await revokeShared(client, user.id, id);
      if (result.error) return json(result.status, { error: result.error });
      return json(200, result);
    }
    return json(405, { error: 'method_not_allowed' });
  }

  // --- SF-backed resources ---
  const period = searchParams.get('period');
  const parsed = parsePeriod(period);
  if (!parsed)
    return json(400, {
      error: 'invalid_period',
      hint: 'FY26, FY26-Q2, 2026-03, 2026-W14',
    });

  const requestedOwner = searchParams.get('owner');
  const ownerIds = await resolveOwnerIds({ client, profile, requestedOwner });
  // Filtre JS additif (compute*) : un seul owner → le garder ; plusieurs → le
  // SOQL a déjà scoped, inutile de refiltrer en JS.
  const singleOwnerId = ownerIds.length === 1 ? ownerIds[0] : null;

  const token = await sfToken(client, user);
  if (!token) return json(502, { error: 'sf_auth_error' });

  // Aucun owner mappé (roster vide) → aucun résultat possible, éviter
  // de requêter toute l'org (timeout). Payload vide par resource.
  if (ownerIds.length === 0) {
    const empty = {
      kpis: () => ({
        ca_signe: 0, pipeline_genere: 0, pipeline_count: 0,
        closing_rate_count: null, closing_rate_amount: null,
        won_count: 0, closed_count: 0, lost_count: 0,
        by_owner: {}, prior: null, prior2: null,
      }),
      breakdown: () => ({ by_type: {}, total_count: 0, total_amount: 0 }),
      funnel: () => ({ stages: [], total: 0, conversion: {} }),
      calls: () => ({ total: 0, per_week: [], funnel: { stages: [], total: 0, conversion: {} } }),
      attention: () => ({ stale: [], key: [], hot: [] }),
    }[resource];
    if (empty) return json(200, { resource, period: parsed, ...empty() });
  }

  const queryStart = parsed.from; // pas toute l'histoire (3 FY) — inutile et lent
  // attention : opps ouvertes, sans borne de période → garder l'historique.
  const attentionStart = earliestQueryDate();

  try {
    if (resource === 'kpis') {
      // N-1 / N-2 comparisons — 6 requêtes en UNE vague (2 vagues = 2× latence SF)
      const priorLabel = priorPeriodLabel(period);
      const prior2Label = prior2PeriodLabel(period);
      const priorParsed = priorLabel ? parsePeriod(priorLabel) : null;
      const prior2Parsed = prior2Label ? parsePeriod(prior2Label) : null;

      const [oppsByClose, oppsByCreated, priorWon, priorCreated, prior2Won, prior2Created] =
        await Promise.all([
          crmRecords(token, oppsByCloseDate(ownerIds, queryStart)),
          crmRecords(token, oppsByCreatedDate(ownerIds, queryStart)),
          priorParsed
            ? crmRecords(
                token,
                wonInPeriod(ownerIds, priorParsed.from, priorParsed.toExclusive),
              )
            : Promise.resolve([]),
          priorParsed
            ? crmRecords(
                token,
                oppsCreatedInPeriod(ownerIds, priorParsed.from, priorParsed.toExclusive),
              )
            : Promise.resolve([]),
          prior2Parsed
            ? crmRecords(
                token,
                wonInPeriod(ownerIds, prior2Parsed.from, prior2Parsed.toExclusive),
              )
            : Promise.resolve([]),
          prior2Parsed
            ? crmRecords(
                token,
                oppsCreatedInPeriod(ownerIds, prior2Parsed.from, prior2Parsed.toExclusive),
              )
            : Promise.resolve([]),
        ]);

      const kpis = computeKpis({
        oppsByClose,
        oppsByCreated,
        from: parsed.from,
        toExclusive: parsed.toExclusive,
        ownerId: singleOwnerId,
        prior: priorParsed ? { won: priorWon, created: priorCreated } : null,
        prior2: prior2Parsed
          ? { won: prior2Won, created: prior2Created }
          : null,
      });
      return json(200, { resource: 'kpis', period: parsed, ...kpis });
    }

    if (resource === 'breakdown') {
      const oppsByClose = await crmRecords(
        token,
        oppsByCloseDate(ownerIds, queryStart),
      );
      const breakdown = computeBreakdown(
        oppsByClose,
        parsed.from,
        parsed.toExclusive,
        singleOwnerId,
      );
      return json(200, { resource: 'breakdown', period: parsed, ...breakdown });
    }

    if (resource === 'funnel') {
      const calls = await crmRecords(token, callsQuery(ownerIds, queryStart));
      const funnel = computeFunnel(
        calls,
        parsed.from,
        parsed.toExclusive,
        singleOwnerId,
      );
      return json(200, { resource: 'funnel', period: parsed, ...funnel });
    }

    if (resource === 'calls') {
      const calls = await crmRecords(token, callsQuery(ownerIds, queryStart));
      const stats = computeCallStats(
        calls,
        parsed.from,
        parsed.toExclusive,
        singleOwnerId,
      );
      return json(200, { resource: 'calls', period: parsed, ...stats });
    }

    if (resource === 'attention') {
      const oppsByClose = await crmRecords(
        token,
        oppsByCloseDate(ownerIds, attentionStart),
      );
      const attention = computeAttention(oppsByClose, singleOwnerId);
      return json(200, { resource: 'attention', ...attention });
    }

    return json(400, {
      error: 'unknown_resource',
      valid: ['kpis', 'breakdown', 'funnel', 'calls', 'attention', 'shared'],
    });
  } catch (err) {
    console.error(
      `review ${resource} error after ${Date.now() - startedAt}ms:`,
      err,
    );
    return json(500, {
      error: 'internal_error',
      message: String(err.message || err),
    });
  } finally {
    console.log(`review ${resource} ${Date.now() - startedAt}ms`);
  }
}
