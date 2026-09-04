/** Target list (ex /api/calls-list) — absorbed into /api/calls. */
import mapping from '../_crm/mapping.js';
import {
  buildTargetQuery,
  boundedLimit,
  fetchOpportunityAccountIdSets,
  fetchSFToken,
  filterByOpportunityAccounts,
  filterTargetContacts,
  hasOpportunityQueryFilters,
  hasRelanceQueryFilters,
  parisToday,
  searchContacts,
  SOQL_FETCH_CAP,
} from '../_crm/salesforce.js';
import { buildPreviewContactList } from './selection.js';
import { findActiveSessionConflicts } from './activeSessionConflicts.js';
import { getProfile } from './profileCache.js';
import { SF_ID } from './http.js';

const MAX_PER_COMPANY_OPTIONS = [1, 2, 3, 5];
// Plafond d'ids par requête SOQL : garde l'URI sous la limite Salesforce
// (16 384 o) même avec des filtres longs (presets, propriétaires, secteurs).
const TARGET_ID_CHUNK_SIZE = 300;
const TARGET_QUERY_CONCURRENCY = 4;
// Budget conservateur pour le WHERE Hors ids cibles (~1 900 o couvrent tous
// les presets + propriétaires + secteurs), ~28 o par id encodé.
const URI_BUDGET = 14_000;
const ID_ENCODED_SIZE = 28;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringIds(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item)
    : [];
}

function chunks(values, chunkSize) {
  if (values.length <= chunkSize) return [values];
  const result = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    result.push(values.slice(index, index + chunkSize));
  }
  return result;
}

/**
 * Découpe les ids cibles (contacts d'abord, comptes seulement quand aucun
 * contact) en chunks qui restent sous le budget URI. Quand les contacts sont
 * ciblés, les comptes sont RETIRÉS de la requête (les ids contact sont plus
 * sélectifs) pour éviter le produit cartésien contact×compte (jusqu'à 64 SOQL).
 */
function targetFilterChunks(filters) {
  const contactIds = stringIds(filters.contact?.contacts_cibles);
  const accountIds = stringIds(filters.entreprise?.comptes_cibles);

  if (contactIds.length > 0) {
    const chunkSize = Math.max(
      1,
      Math.min(TARGET_ID_CHUNK_SIZE, Math.floor((URI_BUDGET - 4_000) / ID_ENCODED_SIZE)),
    );
    return chunks(contactIds, chunkSize).map((contactChunk) => ({
      ...filters,
      contact: { ...filters.contact, contacts_cibles: contactChunk },
      entreprise: { ...filters.entreprise, comptes_cibles: undefined },
    }));
  }

  const chunkSize = Math.max(
    1,
    Math.min(TARGET_ID_CHUNK_SIZE, Math.floor((URI_BUDGET - 4_000) / ID_ENCODED_SIZE)),
  );
  return chunks(accountIds, chunkSize).map((accountChunk) => ({
    ...filters,
    entreprise: { ...filters.entreprise, comptes_cibles: accountChunk },
  }));
}

async function searchTargetContacts(token, filters, sfUserId, includeTasks, options = {}) {
  const filterChunks = targetFilterChunks(filters);
  const searches = [];
  let nextChunk = 0;
  let failed = false;
  const worker = async () => {
    while (nextChunk < filterChunks.length && !failed) {
      const chunkIndex = nextChunk;
      nextChunk += 1;
      const chunkFilters = filterChunks[chunkIndex];
      const search = await searchContacts(
        token,
        buildTargetQuery(chunkFilters, mapping, sfUserId, {
          includeTasks,
          ...(options.fetchLimit ? { fetchLimit: options.fetchLimit } : {}),
        }),
        options,
      );
      if (search.error) {
        failed = true;
        searches[chunkIndex] = search;
        return;
      }
      searches[chunkIndex] = search;
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(TARGET_QUERY_CONCURRENCY, filterChunks.length) },
      worker,
    ),
  );
  const firstError = searches.find((search) => search?.error);
  if (firstError) return firstError;
  const recordsById = new Map();
  let truncated = false;

  for (const search of searches) {
    if (search.error) return search;
    truncated ||= search.truncated === true;
    for (const record of search.records || []) {
      const id = record?.[mapping.objects.contact.fields.id];
      if (typeof id !== 'string' || !id) continue;
      if (!recordsById.has(id)) recordsById.set(id, record);
    }
  }

  const records = [...recordsById.values()];
  const fetchCap = options.fetchCap ?? SOQL_FETCH_CAP;
  return {
    records: records.slice(0, fetchCap),
    truncated: truncated || records.length > fetchCap,
  };
}

export function parseListContactsBody(body) {
  if (!isObject(body)) return { error: 'invalid_body' };
  if (!isObject(body.filters)) return { error: 'invalid_filters' };
  for (const family of ['entreprise', 'contact', 'relance']) {
    if (body.filters[family] !== undefined && !isObject(body.filters[family])) {
      return { error: 'invalid_filters' };
    }
  }
  if (
    body.limit !== undefined &&
    (!Number.isInteger(body.limit) || body.limit < 1)
  ) {
    return { error: 'invalid_limit' };
  }
  if (
    body.preset_id !== undefined &&
    (!Number.isInteger(body.preset_id) || body.preset_id < 1)
  ) {
    return { error: 'invalid_preset_id' };
  }
  if (
    body.max_per_company !== undefined &&
    body.max_per_company !== null &&
    (!Number.isInteger(body.max_per_company) ||
      !MAX_PER_COMPANY_OPTIONS.includes(body.max_per_company))
  ) {
    return { error: 'invalid_max_per_company' };
  }
  // Frontière de confiance : les listes d'ids cibles (rapport Salesforce) sont
  // plafonnées et validées au format SF 15/18, sinon un body malveillant peut
  // déclencher des centaines de requêtes SOQL ou une URI hors limite.
  const contactsCibles = body.filters.contact?.contacts_cibles;
  if (
    contactsCibles !== undefined &&
    (!Array.isArray(contactsCibles) ||
      contactsCibles.length > SOQL_FETCH_CAP ||
      !contactsCibles.every(
        (id) => typeof id === 'string' && SF_ID.test(id),
      ))
  ) {
    return { error: 'invalid_contacts_cibles' };
  }
  const comptesCibles = body.filters.entreprise?.comptes_cibles;
  if (
    comptesCibles !== undefined &&
    (!Array.isArray(comptesCibles) ||
      comptesCibles.length > SOQL_FETCH_CAP ||
      !comptesCibles.every((id) => typeof id === 'string' && SF_ID.test(id)))
  ) {
    return { error: 'invalid_comptes_cibles' };
  }
  return {
    filters: { ...body.filters, limit: body.limit ?? body.filters.limit },
    maxPerCompany: body.max_per_company ?? null,
    countOnly: body.count_only === true,
  };
}

function normalizeContacts(records) {
  const contact = mapping.objects.contact.fields;
  const account = mapping.objects.account.fields;
  const task = mapping.objects.task;
  // ActivityDate est un date literal SOQL (YYYY-MM-DD) : comparaison de chaînes,
  // en date Paris pour ne pas basculer une tentative du jour dans le futur après minuit.
  const today = parisToday();
  return records
    .filter((record) => typeof record?.[contact.id] === 'string')
    .map((record) => {
      const tasks = record[task.childRelationship];
      const lastCall = Array.isArray(tasks?.records)
        ? tasks.records.find((record) => {
            const activityDate = record[task.fields.activityDate];
            return (
              typeof activityDate === 'string' &&
              activityDate.slice(0, 10) <= today
            );
          })
        : null;
      return {
        sf_contact_id: record[contact.id],
        sf_account_id:
          record.Account?.[account.id] ?? record[contact.accountId] ?? null,
        contact_name: record[contact.name] || '',
        account_name: record.Account?.[account.name] ?? null,
        // Prefer mobile for dialing — filter "a_telephone" means has MobilePhone.
        phone: record[contact.mobilePhone] ?? record[contact.phone] ?? null,
        title: record[contact.title] ?? null,
        linkedin_url: record[contact.linkedin] ?? null,
        email: record[contact.email] ?? null,
        mobile_phone: record[contact.mobilePhone] ?? null,
        ...(lastCall?.[task.fields.activityDate]
          ? { last_call_at: lastCall[task.fields.activityDate] }
          : {}),
        ...(typeof tasks?.totalSize === 'number'
          ? { call_count: tasks.totalSize }
          : {}),
      };
    });
}

/** Returns { contacts, dedup, excluded_count } or { count, capped } or { error, status }. */
export async function listContacts(client, userId, body) {
  const parsed = parseListContactsBody(body);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const profile = await getProfile(client, userId);
  if (profile.error) return { error: profile.error, status: 500 };

  // Prefer the user's Salesforce OAuth token so Combo keeps working when the
  // shared org refresh token is revoked — fall back to SF_REFRESH_TOKEN.
  const tokenResult = await fetchSFToken({ client, userId });
  if (tokenResult.error) return { error: tokenResult.error, status: 502 };

  const maxPerCompany = parsed.maxPerCompany;
  const requestedLimit = boundedLimit(parsed.filters.limit);
  const countOnly = parsed.countOnly;
  const opportunityFilters = hasOpportunityQueryFilters(parsed.filters);
  const wideFetch =
    countOnly ||
    hasRelanceQueryFilters(parsed.filters) ||
    opportunityFilters ||
    maxPerCompany !== null;
  const queryFilters = wideFetch
    ? { ...parsed.filters, limit: SOQL_FETCH_CAP }
    : parsed.filters;
  const includeTasks = !countOnly || hasRelanceQueryFilters(parsed.filters);

  const fetchAndFilter = async (fetchLimit) => {
    const [search, opportunitySetsResult] = await Promise.all([
      searchTargetContacts(
        tokenResult.accessToken,
        fetchLimit ? { ...queryFilters, limit: fetchLimit } : queryFilters,
        profile.sfUserId,
        includeTasks,
        fetchLimit ? { fetchLimit, fetchCap: fetchLimit } : {},
      ),
      opportunityFilters
        ? fetchOpportunityAccountIdSets(
            tokenResult.accessToken,
            mapping,
            parsed.filters,
          )
        : Promise.resolve(null),
    ]);
    if (search.error) {
      return { error: search.error, message: search.message };
    }
    let opportunitySets = null;
    if (opportunitySetsResult) {
      if (opportunitySetsResult.error) {
        return {
          error: opportunitySetsResult.error,
          message: opportunitySetsResult.message,
        };
      }
      opportunitySets = opportunitySetsResult;
    }
    let filtered = filterTargetContacts(search.records, parsed.filters, mapping);
    if (opportunitySets) {
      filtered = filterByOpportunityAccounts(
        filtered,
        parsed.filters,
        mapping,
        opportunitySets,
      );
    }
    const normalized = normalizeContacts(filtered);
    const contacts =
      maxPerCompany !== null
        ? buildPreviewContactList(normalized, requestedLimit, maxPerCompany)
        : normalized.slice(0, requestedLimit);
    return {
      contacts,
      normalizedLength: filtered.length,
      truncated: search.truncated === true || opportunitySets?.truncated === true,
    };
  };

  const first = await fetchAndFilter(null);
  if (first.error) return { error: first.error, message: first.message, status: 502 };

  if (countOnly) {
    return {
      count: first.normalizedLength,
      capped:
        first.normalizedLength >= SOQL_FETCH_CAP || first.truncated,
    };
  }

  // Diversification : quand maxPerCompany est actif et que la preview n'est pas
  // pleine, le fetch SOQL initial (borné à SOQL_FETCH_CAP) peut être concentré
  // sur peu d'entreprises. On relance avec un fetch plus profond jusqu'à
  // couvrir `requestedLimit` contacts distincts (1/entreprise) ou un plafond.
  const DIVERSIFY_LIMITS = [SOQL_FETCH_CAP * 2, SOQL_FETCH_CAP * 5, SOQL_FETCH_CAP * 10];
  let contacts = first.contacts;
  let truncated = first.truncated;
  if (maxPerCompany !== null && contacts.length < requestedLimit) {
    for (const fetchLimit of DIVERSIFY_LIMITS) {
      const attempt = await fetchAndFilter(fetchLimit);
      if (attempt.error) break;
      contacts = attempt.contacts;
      truncated = attempt.truncated;
      if (contacts.length >= requestedLimit || !truncated) break;
    }
  }

  // Les contacts déjà dans une séance active sont RENVOYÉS (pas exclus) :
  // le front décide via dedupMode (avertir = montrer + banner, exclure =
  // retirer de la sélection). L'exclusion stricte côté serveur empêchait
  // l'utilisateur de voir/choisir et réduisait artificiellement la preview.
  const dedup = await findActiveSessionConflicts(
    client,
    contacts.map((contact) => contact.sf_contact_id),
    parisToday(),
  );
  return {
    contacts,
    dedup,
    excluded_count: dedup.length,
    truncated,
  };
}
