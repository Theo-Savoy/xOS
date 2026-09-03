/**
 * api/review.js — Business Review FY26 interactif + partage d'analyses.
 *
 * GET  /api/review?resource=overview[&fy=FY26][&semester=S1|S2]
 * GET  /api/review?resource=bridge[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=product[&fy=FY26]
 * GET  /api/review?resource=cycles[&fy=FY26]
 * GET  /api/review?resource=commercial[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=market[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=portfolio[&fy=FY26]
 * GET  /api/review?resource=channels[&fy=FY26]
 * GET  /api/review?resource=diagnosis[&fy=FY26&compare=FY25]
 * GET  /api/review?resource=synthesis[&fy=FY26&compare=FY25][&semester=S1|S2]
 * GET  /api/review?resource=quality[&fy=FY26][&semester=S1|S2]
 * GET  /api/review?resource=definitions
 * GET  /api/review?resource=fte-config
 * POST /api/review?resource=fte-config  { value }
 * GET  /api/review?resource=shared
 * POST /api/review?resource=shared  { config, note?, recipient_id? }
 * DELETE /api/review?resource=shared&id=<uuid>
 *
 * Auth: Supabase JWT (Bearer token).
 * Access: manager/admin → toutes les resources ; commercial → shared uniquement.
 *
 * Lot 6 : resources kpis / breakdown / funnel / calls / attention retirées.
 * Seule la resource « shared » est accessible aux commerciaux.
 */
import { verifyJWT } from './_auth.js';
import { getServiceClient } from './_calls/http.js';
import { getProfile } from './_calls/profileCache.js';
import { roleAtLeast } from './_config/access.js';
import { fetchSFToken, searchContacts } from './_crm/salesforce.js';
import { parsePeriod } from './_review/period.js';
import { listShared, createShared, revokeShared } from './_review/shared.js';
import {
  filterEventsBySemester,
  filterWindowBySemester,
} from './_review/semester.js';
import { arrCatalogueOpps, fyRange } from './_business-review/soql.js';
import { fetchEventsWindow, fetchFyWindow } from './_business-review/fetch.js';
import { computeOverview } from './_business-review/overview.js';
import {
  bridgeByProduct,
  catalogueBridge,
  ownerBridge,
  volumeTicketBridge,
} from './_business-review/bridge.js';
import { splitNewRenew } from './_business-review/classify.js';
import { computeCycles } from './_business-review/cycles.js';
import { computeProduct } from './_business-review/product.js';
import { computeCommercial } from './_business-review/commercial.js';
import { computeMarket } from './_business-review/market.js';
import {
  computePortfolio,
  deriveArrCohort,
} from './_business-review/portfolio.js';
import { computeChannels } from './_business-review/channels.js';
import { computeDiagnosis } from './_business-review/diagnosis.js';
import {
  computeDefinitions,
  computeSynthesis,
} from './_business-review/synthesis.js';
import { computeQuality } from './_business-review/quality.js';
import { loadFte, saveFte } from './_business-review/fte-config.js';

const CACHE_CONTROL = 'private, max-age=300, stale-while-revalidate=600';
const ANALYSIS_NONE = { status: 'none' };

const BUSINESS_RESOURCES = [
  'overview',
  'bridge',
  'product',
  'cycles',
  'commercial',
  'market',
  'portfolio',
  'channels',
  'diagnosis',
  'synthesis',
  'quality',
];
const SETTINGS_RESOURCES = ['fte-config', 'definitions'];
const ANNUAL_ONLY_RESOURCES = ['portfolio', 'diagnosis'];
const VALID_RESOURCES = [
  'shared',
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

/** Payload de section : slot IA/commentaires désactivé (P2-10). */
function sectionJson(body) {
  return json(200, { ...body, analysis: body.analysis ?? ANALYSIS_NONE });
}

function withSemester(fetched, semester) {
  if (!semester) return fetched;
  return {
    ...fetched,
    window: filterWindowBySemester(fetched.window, semester),
  };
}

function eventsWithSemester(fetched, semester) {
  if (!semester) return fetched;
  return {
    ...fetched,
    window: filterEventsBySemester(fetched.window, semester),
  };
}

async function crmRecords(token, soql) {
  const result = await searchContacts(token, soql);
  if (result.error) throw new Error(result.error);
  return result.records || [];
}

/** Récupère le token SF de l'utilisateur (OAuth + refresh). */
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
  const resource = url.searchParams.get('resource') || 'shared';
  const method = request.method.toUpperCase();

  if (!VALID_RESOURCES.includes(resource)) {
    return json(400, { error: 'unknown_resource', valid: VALID_RESOURCES });
  }

  // --- Shared analyses (Supabase only, pas de SF) ---
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

  if (resource === 'definitions') {
    if (!roleAtLeast(profile.role, 'manager')) {
      return json(403, { error: 'manager_required' });
    }
    if (method !== 'GET') return json(405, { error: 'method_not_allowed' });
    return sectionJson({
      resource: 'definitions',
      conservation: { ok: true, delta_count: 0, delta_amount: 0 },
      ...computeDefinitions(),
    });
  }

  // --- Business review (manager/admin, fenêtre multi-FY) ---
  if (BUSINESS_RESOURCES.includes(resource)) {
    if (!roleAtLeast(profile.role, 'manager')) {
      return json(403, { error: 'manager_required' });
    }
    const fyParam = url.searchParams.get('fy') || 'FY26';
    const fyParsed = parsePeriod(fyParam);
    if (!fyParsed || fyParsed.granularity !== 'year') {
      return json(400, { error: 'invalid_fy', hint: 'FY22 … FY26' });
    }
    const defaultCompare = `FY${String(fyParsed.fyInt - 1).padStart(2, '0')}`;
    const compareParam = url.searchParams.get('compare') || defaultCompare;
    const compareParsed = parsePeriod(compareParam);
    if (!compareParsed || compareParsed.granularity !== 'year') {
      return json(400, { error: 'invalid_compare', hint: 'FY22 … FY26' });
    }
    if (compareParsed.fyInt >= fyParsed.fyInt) {
      return json(400, {
        error: 'invalid_compare',
        hint: 'compare doit être strictement inférieur à fy',
      });
    }
    if (compareParsed.fyInt < 22) {
      return json(400, {
        error: 'invalid_compare',
        hint: 'compare minimum FY22',
      });
    }
    const semester = url.searchParams.get('semester');
    if (semester && semester !== 'S1' && semester !== 'S2') {
      return json(400, { error: 'invalid_semester', hint: 'S1 ou S2' });
    }
    if (semester && ANNUAL_ONLY_RESOURCES.includes(resource)) {
      return json(400, {
        error: 'annual_only_resource',
        hint: 'Cette lecture dépend des ETP annuels ou de la cohorte au 30/06.',
      });
    }

    const period = {
      granularity: semester ? 'semester' : 'year',
      semester: semester || null,
      label: `${fyParsed.label}${semester ? ` ${semester}` : ''}`,
      compare_label: `${compareParsed.label}${semester ? ` ${semester}` : ''}`,
    };

    const token = await sfToken(client, user);
    if (!token) return json(502, { error: 'sf_auth_error' });

    try {
      if (resource === 'overview') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const overview = computeOverview(fetched.window);
        return sectionJson({
          resource: 'overview',
          period,
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: overview.conservation,
          series: overview.series,
        });
      }

      if (resource === 'bridge') {
        const fyInts = fyRange(compareParsed.fyInt, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const prevWon = fetched.window[compareParsed.label]?.won || [];
        const currWon = fetched.window[fyParsed.label]?.won || [];
        const prevNew = splitNewRenew(prevWon).new;
        const currNew = splitNewRenew(currWon).new;
        const volumeTicket = volumeTicketBridge(prevNew, currNew);
        const owner = ownerBridge(prevWon, currWon);
        const byProduct = bridgeByProduct(prevWon, currWon);
        const catalogue = byProduct.catalogue;
        const conservation = {
          ok:
            volumeTicket.conservation.ok &&
            owner.conservation.ok &&
            byProduct.catalogue.conservation.ok &&
            byProduct.sur_mesure.conservation.ok &&
            byProduct.conseil.conservation.ok,
          delta_count: 0,
          delta_amount:
            (volumeTicket.conservation.delta_amount || 0) +
            (owner.conservation.delta_amount || 0) +
            (catalogue.conservation.delta_amount || 0),
        };
        return sectionJson({
          resource: 'bridge',
          period,
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation,
          volume_ticket: volumeTicket,
          owner,
          catalogue,
          by_product: byProduct,
        });
      }

      if (resource === 'product') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const product = computeProduct(fetched.window);
        return sectionJson({
          resource: 'product',
          period,
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: product.conservation,
          series: product.series,
        });
      }

      if (resource === 'cycles') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const cycles = computeCycles(fetched.window);
        return sectionJson({
          resource: 'cycles',
          period,
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
        const [rawFetched, fte, rawEvents] = await Promise.all([
          fetchFyWindow(token, fyInts),
          loadFte(client),
          fetchEventsWindow(token, fyInts),
        ]);
        const fetched = withSemester(rawFetched, semester);
        const events = eventsWithSemester(rawEvents, semester);
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
        return sectionJson({
          resource: 'commercial',
          period,
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: truncated_fys.length > 0,
          truncated_fys,
          ...commercial,
        });
      }

      if (resource === 'market') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const market = computeMarket(fetched.window, {
          fy: fyParsed.label,
          compare: compareParsed.label,
        });
        return sectionJson({
          resource: 'market',
          period,
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: {
            ok: true,
            delta_count: 0,
            delta_amount: 0,
          },
          ...market,
        });
      }

      if (resource === 'portfolio') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = await fetchFyWindow(token, fyInts);
        let arrRecords = [];
        try {
          arrRecords = await crmRecords(token, arrCatalogueOpps());
        } catch {
          arrRecords = [];
        }
        const cohort = deriveArrCohort(
          fetched.window,
          fyParsed.label,
          arrRecords,
        );
        const portfolio = computePortfolio(
          fetched.window,
          cohort,
          fyParsed.label,
        );
        return sectionJson({
          resource: 'portfolio',
          period,
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: portfolio.conservation,
          statuses: portfolio.statuses,
          cohort: portfolio.cohort,
        });
      }

      if (resource === 'channels') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const channels = computeChannels(fetched.window, fyParsed.label);
        return sectionJson({
          resource: 'channels',
          period,
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: channels.conservation,
          channels: channels.channels,
          concentration: channels.concentration,
          sdr_limit: channels.sdr_limit,
        });
      }

      if (resource === 'quality') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const fetched = withSemester(
          await fetchFyWindow(token, fyInts),
          semester,
        );
        const quality = computeQuality(fetched.window, fyParsed.label);
        return sectionJson({
          resource: 'quality',
          period,
          fy: fyParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          conservation: {
            ok: true,
            delta_count: 0,
            delta_amount: 0,
          },
          ...quality,
        });
      }

      if (resource === 'diagnosis' || resource === 'synthesis') {
        const fyInts = fyRange(BUSINESS_FROM_FY, fyParsed.fyInt);
        const [rawFetched, fte] = await Promise.all([
          fetchFyWindow(token, fyInts),
          loadFte(client),
        ]);
        const fetched = withSemester(rawFetched, semester);
        let arrRecords = [];
        try {
          arrRecords = await crmRecords(token, arrCatalogueOpps());
        } catch {
          arrRecords = [];
        }
        const cohort = deriveArrCohort(
          rawFetched.window,
          fyParsed.label,
          arrRecords,
        );
        const portfolio = computePortfolio(
          fetched.window,
          cohort,
          fyParsed.label,
        );
        const channels = computeChannels(fetched.window, fyParsed.label);
        const market = computeMarket(fetched.window, {
          fy: fyParsed.label,
          compare: compareParsed.label,
        });
        const cycles = computeCycles(fetched.window);
        if (resource === 'diagnosis') {
          const diagnosis = computeDiagnosis({
            portfolio,
            channels,
            market,
            cycles,
            fte,
            fy: fyParsed.label,
            compare: compareParsed.label,
          });
          return sectionJson({
            resource: 'diagnosis',
            period,
            fy: fyParsed.label,
            compare: compareParsed.label,
            truncated: fetched.truncated,
            truncated_fys: fetched.truncated_fys,
            ...diagnosis,
          });
        }
        const prevWon = fetched.window[compareParsed.label]?.won || [];
        const currWon = fetched.window[fyParsed.label]?.won || [];
        const catalogue = catalogueBridge(prevWon, currWon);
        const synthesis = computeSynthesis({
          window: fetched.window,
          fy: fyParsed.label,
          compare: compareParsed.label,
          semester: semester || null,
          catalogue,
          market,
          portfolio,
        });
        return sectionJson({
          resource: 'synthesis',
          period,
          fy: fyParsed.label,
          compare: compareParsed.label,
          truncated: fetched.truncated,
          truncated_fys: fetched.truncated_fys,
          ...synthesis,
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

  // Cas non atteint normalement (VALID_RESOURCES est exhaustif)
  return json(400, { error: 'unknown_resource', valid: VALID_RESOURCES });
}
