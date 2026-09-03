/**
 * api/review.js — Régie cockpit macro endpoint + Business Review FY26.
 *
 * GET  /api/review?resource=kpis&period=FY26[&owner=005...]
 * GET  /api/review?resource=breakdown&period=FY26[&owner=005...]
 * GET  /api/review?resource=funnel&period=FY26[&owner=005...]
 * GET  /api/review?resource=attention[&owner=005...]
 * GET  /api/review?resource=shared
 * GET  /api/review?resource=overview[&fy=FY26]
 * GET  /api/review?resource=bridge[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=product[&fy=FY26]
 * GET  /api/review?resource=cycles[&fy=FY26]
 * GET  /api/review?resource=commercial[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=fte-config
 * POST /api/review?resource=fte-config  { FY25, FY26 }
 * POST /api/review?resource=shared  { config, note?, recipient_id? }
 * DELETE /api/review?resource=shared&id=<uuid>
 *
 * Auth: Supabase JWT (Bearer token).
 * Access: manager/admin → global + owner filter; commercial → own data + shared only.
 * Resources business (overview, bridge, product, cycles, commercial, fte-config) : manager/admin uniquement.
 */
import { verifyJWT } from './_auth.js';
import { getServiceClient } from './_calls/http.js';
import { getProfile } from './_calls/profileCache.js';
import { roleAtLeast } from './_config/access.js';
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
import { fyRange } from './_business-review/soql.js';
import { fetchEventsWindow, fetchFyWindow } from './_business-review/fetch.js';
import { computeOverview } from './_business-review/overview.js';
import {
  catalogueBridge,
  ownerBridge,
  volumeTicketBridge,
} from './_business-review/bridge.js';
import { splitNewRenew } from './_business-review/classify.js';
import { computeCycles } from './_business-review/cycles.js';
import { computeProduct } from './_business-review/product.js';
import { computeCommercial } from './_business-review/commercial.js';
import { loadFte, saveFte } from './_business-review/fte-config.js';

const CACHE_CONTROL = 'private, max-age=300, stale-while-revalidate=600';

const LEGACY_RESOURCES = [
  'kpis',
  'breakdown',
  'funnel',
  'calls',
  'attention',
  'shared',
];
const BUSINESS_RESOURCES = [
  'overview',
  'bridge',
  'product',
  'cycles',
  'commercial',
];
const SETTINGS_RESOURCES = ['fte-config'];
const VALID_RESOURCES = [
  ...LEGACY_RESOURCES,
  ...BUSINESS_RESOURCES,
  ...SETTINGS_RESOURCES,
];
const BUSINESS_FROM_FY = 22;

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

async function crmRecords(token, soql) {
  const result = await searchContacts(token, soql);
  if (result.error) throw new Error(result.error);
  return result.records || [];
}

/** Resolve effective owner filter. Commercial → forced to own sfUserId. */
function resolveOwner(profile, requestedOwner) {
  if (!roleAtLeast(profile.role, 'manager')) {
    return profile.sfUserId || null; // commercial: always own
  }
  return requestedOwner || null; // manager/admin: optional filter
}

/** Fetch SF token, preferring the user's own token if linked. */
async function sfToken(client, user) {
  const result = await fetchSFToken({ client, userId: user.id });
  if (result.error || !result.accessToken) return null;
  return result.accessToken;
}

// Vercel Web Handlers : exports nommés par méthode → le runtime passe un
// `Request` standard (URL absolue). L'ancien `export default` déclenchait la
// signature Node legacy (IncomingMessage) et `new URL(request.url)` levait
// `TypeError: Invalid URL` sur toutes les resources.
export const GET = reviewHandler;
export const POST = reviewHandler;
export const DELETE = reviewHandler;
export const OPTIONS = reviewHandler;

async function reviewHandler(request) {
  const user = await verifyJWT(request);
  if (!user) return json(401, { error: 'unauthorized' });

  const client = getServiceClient();
  if (!client) return json(500, { error: 'supabase_unavailable' });

  const profile = await getProfile(client, user.id);
  if (profile.error) return json(500, { error: profile.error });

  const url = new URL(request.url);
  const resource = url.searchParams.get('resource') || 'kpis';
  const method = request.method.toUpperCase();

  if (!VALID_RESOURCES.includes(resource)) {
    return json(400, { error: 'unknown_resource', valid: VALID_RESOURCES });
  }

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
      const id = url.searchParams.get('id');
      if (!id) return json(400, { error: 'missing_id' });
      const result = await revokeShared(client, user.id, id);
      if (result.error) return json(result.status, { error: result.error });
      return json(200, result);
    }
    return json(405, { error: 'method_not_allowed' });
  }

  // --- ETP (settings, pas de Salesforce) ---
  if (resource === 'fte-config') {
    if (!roleAtLeast(profile.role, 'manager')) {
      return json(403, { error: 'manager_required' });
    }
    if (method === 'GET') {
      try {
        const value = await loadFte(client);
        return json(200, { resource: 'fte-config', value });
      } catch (err) {
        console.error('review fte-config error:', err);
        return json(500, {
          error: 'internal_error',
          message: String(err.message || err),
        });
      }
    }
    if (method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: 'invalid_json' });
      }
      try {
        const value = await saveFte(client, body.value ?? body);
        return json(200, { resource: 'fte-config', value });
      } catch (err) {
        console.error('review fte-config error:', err);
        return json(500, {
          error: 'internal_error',
          message: String(err.message || err),
        });
      }
    }
    return json(405, { error: 'method_not_allowed' });
  }

  // --- Business review (manager/admin, fenêtre multi-FY) ---
  if (BUSINESS_RESOURCES.includes(resource)) {
    if (!roleAtLeast(profile.role, 'manager')) {
      return json(403, { error: 'manager_required' });
    }
    const fyParam = url.searchParams.get('fy') || 'FY26';
    const compareParam = url.searchParams.get('compare') || 'FY25';
    const fyParsed = parsePeriod(fyParam);
    const compareParsed = parsePeriod(compareParam);
    if (!fyParsed || fyParsed.granularity !== 'year') {
      return json(400, { error: 'invalid_fy', hint: 'FY22 … FY26' });
    }
    if (!compareParsed || compareParsed.granularity !== 'year') {
      return json(400, { error: 'invalid_compare', hint: 'FY22 … FY26' });
    }

    const token = await sfToken(client, user);
    if (!token) return json(502, { error: 'sf_auth_error' });

    try {
      if (resource === 'overview') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = await fetchFyWindow(token, fyInts);
        const overview = computeOverview(fetched.window);
        return json(200, {
          resource: 'overview',
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: overview.conservation,
          series: overview.series,
        });
      }

      if (resource === 'bridge') {
        const fyInts = fyRange(compareParsed.fyInt, fyParsed.fyInt);
        const fetched = await fetchFyWindow(token, fyInts);
        const prevWon = fetched.window[compareParsed.label]?.won || [];
        const currWon = fetched.window[fyParsed.label]?.won || [];
        const prevNew = splitNewRenew(prevWon).new;
        const currNew = splitNewRenew(currWon).new;
        const volumeTicket = volumeTicketBridge(prevNew, currNew);
        const owner = ownerBridge(prevWon, currWon);
        const catalogue = catalogueBridge(prevWon, currWon);
        const conservation = {
          ok:
            volumeTicket.conservation.ok &&
            owner.conservation.ok &&
            catalogue.conservation.ok,
          delta_count: 0,
          delta_amount:
            (volumeTicket.conservation.delta_amount || 0) +
            (owner.conservation.delta_amount || 0) +
            (catalogue.conservation.delta_amount || 0),
        };
        return json(200, {
          resource: 'bridge',
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation,
          volume_ticket: volumeTicket,
          owner,
          catalogue,
        });
      }

      if (resource === 'product') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = await fetchFyWindow(token, fyInts);
        const product = computeProduct(fetched.window);
        return json(200, {
          resource: 'product',
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: product.conservation,
          series: product.series,
        });
      }

      if (resource === 'cycles') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = await fetchFyWindow(token, fyInts);
        const cycles = computeCycles(fetched.window);
        return json(200, {
          resource: 'cycles',
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: {
            ok: true,
            delta_count: 0,
            delta_amount: 0,
          },
          series: cycles.series,
        });
      }

      if (resource === 'commercial') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const [fetched, fte, events] = await Promise.all([
          fetchFyWindow(token, fyInts),
          loadFte(client),
          fetchEventsWindow(token, fyInts),
        ]);
        const commercial = computeCommercial(
          fetched.window,
          fte,
          events.window,
          {
            fy: fyParsed.label,
            compare: compareParsed.label,
          },
        );
        const truncated_fys = [
          ...new Set([
            ...(fetched.truncated_fys || []),
            ...(events.truncated_fys || []),
          ]),
        ];
        return json(200, {
          resource: 'commercial',
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: truncated_fys.length > 0,
          truncated_fys,
          ...commercial,
        });
      }
    } catch (err) {
      console.error('review business error:', err);
      return json(500, {
        error: 'internal_error',
        message: String(err.message || err),
      });
    }
  }

  // --- SF-backed resources ---
  const period = url.searchParams.get('period');
  const parsed = parsePeriod(period);
  if (!parsed)
    return json(400, {
      error: 'invalid_period',
      hint: 'FY26, FY26-Q2, 2026-03, 2026-W14',
    });

  const requestedOwner = url.searchParams.get('owner');
  const ownerId = resolveOwner(profile, requestedOwner);
  const ownerIds = ownerId ? [ownerId] : null; // null = all owners

  const token = await sfToken(client, user);
  if (!token) return json(502, { error: 'sf_auth_error' });

  const queryStart = earliestQueryDate();

  try {
    if (resource === 'kpis') {
      const [oppsByClose, oppsByCreated] = await Promise.all([
        crmRecords(token, oppsByCloseDate(ownerIds, queryStart)),
        crmRecords(token, oppsByCreatedDate(ownerIds, queryStart)),
      ]);

      // N-1 / N-2 comparisons
      const priorLabel = priorPeriodLabel(period);
      const prior2Label = prior2PeriodLabel(period);
      const priorParsed = priorLabel ? parsePeriod(priorLabel) : null;
      const prior2Parsed = prior2Label ? parsePeriod(prior2Label) : null;

      const [priorWon, priorCreated, prior2Won, prior2Created] =
        await Promise.all([
          priorParsed
            ? crmRecords(
                token,
                wonInPeriod(
                  ownerIds,
                  priorParsed.from,
                  priorParsed.toExclusive,
                ),
              )
            : Promise.resolve([]),
          priorParsed
            ? crmRecords(
                token,
                oppsCreatedInPeriod(
                  ownerIds,
                  priorParsed.from,
                  priorParsed.toExclusive,
                ),
              )
            : Promise.resolve([]),
          prior2Parsed
            ? crmRecords(
                token,
                wonInPeriod(
                  ownerIds,
                  prior2Parsed.from,
                  prior2Parsed.toExclusive,
                ),
              )
            : Promise.resolve([]),
          prior2Parsed
            ? crmRecords(
                token,
                oppsCreatedInPeriod(
                  ownerIds,
                  prior2Parsed.from,
                  prior2Parsed.toExclusive,
                ),
              )
            : Promise.resolve([]),
        ]);

      const kpis = computeKpis({
        oppsByClose,
        oppsByCreated,
        from: parsed.from,
        toExclusive: parsed.toExclusive,
        ownerId,
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
        ownerId,
      );
      return json(200, { resource: 'breakdown', period: parsed, ...breakdown });
    }

    if (resource === 'funnel') {
      const calls = await crmRecords(token, callsQuery(ownerIds, queryStart));
      const funnel = computeFunnel(
        calls,
        parsed.from,
        parsed.toExclusive,
        ownerId,
      );
      return json(200, { resource: 'funnel', period: parsed, ...funnel });
    }

    if (resource === 'calls') {
      const calls = await crmRecords(token, callsQuery(ownerIds, queryStart));
      const stats = computeCallStats(
        calls,
        parsed.from,
        parsed.toExclusive,
        ownerId,
      );
      return json(200, { resource: 'calls', period: parsed, ...stats });
    }

    if (resource === 'attention') {
      const oppsByClose = await crmRecords(
        token,
        oppsByCloseDate(ownerIds, queryStart),
      );
      const attention = computeAttention(oppsByClose, ownerId);
      return json(200, { resource: 'attention', ...attention });
    }

    return json(400, {
      error: 'unknown_resource',
      valid: VALID_RESOURCES,
    });
  } catch (err) {
    console.error('review error:', err);
    return json(500, {
      error: 'internal_error',
      message: String(err.message || err),
    });
  }
}
