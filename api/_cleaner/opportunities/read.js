import mapping from '../../_crm/mapping.js';
import {
  buildLightningUrl,
  fetchSFToken,
  searchContacts,
} from '../../_crm/salesforce.js';
import { CleanerError, isTimeoutError } from '../core/errors.js';
import {
  allowedOwnerIds,
  authorizeContext,
  scopeDescription,
  scopeOpportunityItems,
} from '../core/authorization.js';
import { normalizeCleanerSettings } from '../core/settings.js';
import {
  decodeCursor,
  encodeCursor,
  MAX_CLEANER_LIMIT,
} from '../core/validation.js';
import { detectOpportunityAnomalies } from './rules.js';
import { scoreOpportunity } from './score.js';

const RAW_CACHE_TTL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const rawCache = { records: null, fetchedAt: 0 };

export function __resetOpportunityReadCache() {
  rawCache.records = null;
  rawCache.fetchedAt = 0;
}

function timeoutPromise(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new CleanerError('timeout', 'Salesforce request timed out.', 504),
        ),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeSalesforceFailure(error) {
  if (error instanceof CleanerError) return error;
  if (isTimeoutError(error)) {
    return new CleanerError(
      'timeout',
      'Salesforce request timed out.',
      504,
      undefined,
      { cause: error },
    );
  }
  return new CleanerError(
    'salesforce_error',
    error?.message || 'Salesforce request failed.',
    502,
    undefined,
    { cause: error },
  );
}

async function runSalesforce(operation, timeoutMs) {
  try {
    return await timeoutPromise(operation(), timeoutMs);
  } catch (error) {
    throw normalizeSalesforceFailure(error);
  }
}

export function withCleanerTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return timeoutPromise(promise, timeoutMs);
}

function valueAt(record, field) {
  if (record && Object.hasOwn(record, field)) return record[field];
  return String(field)
    .split('.')
    .reduce((value, key) => value?.[key], record);
}

function firstValue(record, fields) {
  for (const field of fields) {
    const value = valueAt(record, field);
    if (value !== undefined) return value;
  }
  return null;
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return typeof value === 'string' ? value : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? String(value)
    : date.toISOString().slice(0, 10);
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function opportunityQuery() {
  const opportunity = mapping.objects.opportunity;
  const fields = opportunity.fields;
  return [
    `SELECT ${[
      fields.id,
      fields.name,
      fields.accountId,
      fields.accountName,
      fields.accountOwnerId,
      fields.accountOwnerName,
      fields.isClosed,
      fields.isWon,
      fields.stageName,
      fields.amount,
      fields.probability,
      opportunity.saleTypeField,
      opportunity.lossReasonField,
      fields.closeDate,
      fields.ownerId,
      fields.ownerName,
      fields.ownerIsActive,
      fields.createdDate,
      fields.lastActivityDate,
      fields.lastStageChangeDate,
    ].join(', ')} FROM ${opportunity.name}`,
    `WHERE ${fields.isClosed} = false`,
    `ORDER BY ${fields.id} ASC`,
  ].join(' ');
}

async function loadRawRecords(context, timeoutMs) {
  if (rawCache.records && Date.now() - rawCache.fetchedAt < RAW_CACHE_TTL_MS) {
    return {
      records: rawCache.records,
      cached: true,
      fetchedAt: rawCache.fetchedAt,
    };
  }

  let token = context.token?.accessToken || context.token;
  if (!token) {
    const tokenLoader = context.fetchSFToken || fetchSFToken;
    const result = await runSalesforce(
      () => tokenLoader({ client: context.supabase, userId: context.user?.id }),
      timeoutMs,
    );
    if (result?.error || !result?.accessToken) {
      throw new CleanerError(
        'salesforce_error',
        result?.error || 'Salesforce token unavailable.',
        502,
      );
    }
    token = result.accessToken;
  }

  const search = context.searchContacts || searchContacts;
  const result = await runSalesforce(
    () => search(token, opportunityQuery()),
    timeoutMs,
  );
  if (result?.error)
    throw new CleanerError(
      'salesforce_error',
      result.message || result.error,
      502,
    );
  if (!Array.isArray(result?.records)) {
    throw new CleanerError(
      'salesforce_error',
      'Salesforce returned an invalid opportunity page.',
      502,
    );
  }
  rawCache.records = result.records.slice();
  rawCache.fetchedAt = Date.now();
  return {
    records: rawCache.records,
    cached: false,
    fetchedAt: rawCache.fetchedAt,
  };
}

async function loadSettings(context, timeoutMs) {
  if (context.settings?.settings && context.settings.key === 'cleaner_v2')
    return context.settings;
  if (!context.supabase?.from) return normalizeCleanerSettings([]);
  const result = await timeoutPromise(
    context.supabase.from('settings').select('key, value'),
    timeoutMs,
  );
  if (result?.error)
    throw new CleanerError(
      'supabase_error',
      'Cleaner settings lookup failed.',
      500,
    );
  return normalizeCleanerSettings(result?.data || []);
}

function normalizeOpportunity(record, settings, context) {
  const opportunity = mapping.objects.opportunity;
  const fields = opportunity.fields;
  const id = firstValue(record, [fields.id, 'id']);
  if (typeof id !== 'string' || !id)
    throw new CleanerError(
      'salesforce_error',
      'Salesforce returned an opportunity without an id.',
      502,
    );
  const ownerId = firstValue(record, [fields.ownerId, 'owner_id', 'ownerId']);
  const base = {
    id,
    name: firstValue(record, [fields.name, 'name']),
    account_id: firstValue(record, [fields.accountId, 'account_id']),
    account: firstValue(record, [
      fields.accountName,
      'account',
      'Account.Name',
    ]),
    account_owner_id: firstValue(record, [
      fields.accountOwnerId,
      'account_owner_id',
    ]),
    account_owner_name: firstValue(record, [
      fields.accountOwnerName,
      'account_owner_name',
    ]),
    owner_id: ownerId,
    owner: firstValue(record, [fields.ownerName, 'owner', 'owner_name']),
    owner_active: booleanValue(
      firstValue(record, [fields.ownerIsActive, 'owner_active']),
    ),
    former_owner:
      record.former_owner === true || record.owner_former_employee === true,
    stage: firstValue(record, [fields.stageName, 'stage']),
    close_date: dateValue(firstValue(record, [fields.closeDate, 'close_date'])),
    amount: numberValue(firstValue(record, [fields.amount, 'amount'])),
    probability: numberValue(
      firstValue(record, [fields.probability, 'probability']),
    ),
    type_vente: firstValue(record, [opportunity.saleTypeField, 'type_vente']),
    loss_reason: firstValue(record, [
      opportunity.lossReasonField,
      'loss_reason',
    ]),
    created_date: dateValue(
      firstValue(record, [fields.createdDate, 'created_date']),
    ),
    last_activity: dateValue(
      firstValue(record, [fields.lastActivityDate, 'last_activity']),
    ),
    is_closed: booleanValue(firstValue(record, [fields.isClosed, 'is_closed'])),
    category: 'dechet',
  };
  const ruleContext = {
    today: context.today || new Date().toISOString().slice(0, 10),
    meta: context.meta,
    stalledStage: context.stalledStage,
    formerOwnerIds: context.formerOwnerIds,
    formerOwnerNames: context.formerOwnerNames,
    thresholds: settings.settings,
  };
  const anomalies = detectOpportunityAnomalies(base, ruleContext);
  if (!anomalies.length) return null;
  const item = {
    ...base,
    category: anomalies[0]?.ruleId || 'opportunity',
    primary_rule_id: anomalies[0]?.ruleId || null,
    anomalies,
    score: scoreOpportunity(anomalies, base, {
      ...settings.settings,
      today: ruleContext.today,
    }),
    salesforce_url: buildLightningUrl('Opportunity', id),
  };
  return item;
}

export async function loadOpportunityWorkspace(context = {}) {
  const authorization = authorizeContext(context);
  if (!authorization.ok)
    throw new CleanerError(
      authorization.error,
      authorization.error,
      authorization.status,
    );
  const query = context.query || {};
  const limit = Math.min(
    Math.max(Number(context.limit ?? query.limit ?? 100) || 100, 1),
    MAX_CLEANER_LIMIT,
  );
  const offset = decodeCursor(context.cursor ?? query.cursor);
  const timeoutMs = context.timeoutMs || DEFAULT_TIMEOUT_MS;
  const [raw, settings] = await Promise.all([
    loadRawRecords(context, timeoutMs),
    loadSettings(context, timeoutMs),
  ]);
  const normalized = raw.records
    .slice()
    .sort((left, right) =>
      String(
        valueAt(left, mapping.objects.opportunity.fields.id),
      ).localeCompare(
        String(valueAt(right, mapping.objects.opportunity.fields.id)),
      ),
    )
    .map((record) => normalizeOpportunity(record, settings, context))
    .filter(Boolean);
  const scoped = scopeOpportunityItems(normalized, context, query);
  const items = scoped.slice(offset, offset + limit);
  return {
    items,
    total: scoped.length,
    nextCursor:
      offset + limit < scoped.length ? encodeCursor(offset + limit) : null,
    filters: {
      scope: scopeDescription(context),
      ownerIds: allowedOwnerIds(context),
      query: { period: query.period || null },
    },
    metadata: {
      source: 'salesforce',
      fetchedAt: new Date(raw.fetchedAt).toISOString(),
      cache: raw.cached ? 'raw-short' : 'miss',
      rawCount: raw.records.length,
      scopedCount: scoped.length,
      settingsSource: settings.source,
      settingsWarnings: settings.warnings,
      bounded: true,
    },
  };
}
