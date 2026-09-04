import { fetchSFToken, listReports, runReport } from '../_crm/salesforce.js';
import { SF_ID } from './http.js';

const CONTACT_ID_RE = /^003[a-zA-Z0-9]{12}([a-zA-Z0-9]{3})?$/;
const ACCOUNT_ID_RE = /^001[a-zA-Z0-9]{12}([a-zA-Z0-9]{3})?$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function actionError(result) {
  return {
    error: result.error,
    status: result.status || 502,
    ...(result.message ? { message: result.message } : {}),
  };
}

/** Extract Salesforce Contact and Account ids from every row in a report. */
export function extractReportIds(payload) {
  const contactIds = [];
  const accountIds = [];
  const seenContacts = new Set();
  const seenAccounts = new Set();
  let rowCount = 0;
  let duplicateContactCount = 0;
  let duplicateAccountCount = 0;
  let unusableCount = 0;

  const factMap = isObject(payload?.factMap) ? payload.factMap : {};
  for (const fact of Object.values(factMap)) {
    const rows = Array.isArray(fact?.rows) ? fact.rows : [];
    for (const row of rows) {
      rowCount += 1;
      const rowIds = new Set();
      const cells = Array.isArray(row?.dataCells) ? row.dataCells : [];

      for (const cell of cells) {
        const value = cell?.value;
        if (typeof value !== 'string') continue;

        const kind = CONTACT_ID_RE.test(value)
          ? 'contact'
          : ACCOUNT_ID_RE.test(value)
            ? 'account'
            : null;
        if (!kind) continue;

        const normalizedId = value.slice(0, 15);
        const rowKey = `${kind}:${normalizedId}`;
        if (rowIds.has(rowKey)) continue;
        rowIds.add(rowKey);

        const seen = kind === 'contact' ? seenContacts : seenAccounts;
        const ids = kind === 'contact' ? contactIds : accountIds;
        if (seen.has(normalizedId)) {
          if (kind === 'contact') duplicateContactCount += 1;
          else duplicateAccountCount += 1;
        } else {
          seen.add(normalizedId);
          // Ids normalisés à 15 caractères : Salesforce accepte les 15 en
          // SOQL IN, et l'hydratation (lot 3) keyera sur slice(0,15).
          ids.push(normalizedId);
        }
      }

      if (rowIds.size === 0) unusableCount += 1;
    }
  }

  return {
    contact_ids: contactIds,
    account_ids: accountIds,
    row_count: rowCount,
    duplicate_contact_count: duplicateContactCount,
    duplicate_account_count: duplicateAccountCount,
    unusable_count: unusableCount,
    truncated:
      payload?.allData === false ||
      payload?.hasExceededTabularRowLimit === true,
  };
}

function parseListReportsBody(body) {
  if (!isObject(body)) return { error: 'invalid_body' };
  if (
    body.q !== undefined &&
    (typeof body.q !== 'string' || body.q.length > 100)
  ) {
    return { error: 'invalid_query' };
  }
  return { q: body.q ?? '' };
}

/** Returns { reports } or { error, status }. */
export async function listReportsAction(client, userId, body) {
  const parsed = parseListReportsBody(body);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const tokenResult = await fetchSFToken({ client, userId });
  if (tokenResult.error) return { error: tokenResult.error, status: 502 };

  const result = await listReports(tokenResult.accessToken, { q: parsed.q });
  if (result.error) return actionError(result);

  return {
    reports: (result.reports || []).map((report) => ({
      id: report.id,
      name: report.name,
      folder_name: report.folder_name ?? null,
      last_run_date: report.last_run_date ?? null,
    })),
  };
}

/** Returns extracted report ids/counters or { error, status }. */
export async function runReportAction(client, userId, body) {
  if (!isObject(body) || typeof body.reportId !== 'string') {
    return { error: 'invalid_report_id', status: 400 };
  }
  if (!SF_ID.test(body.reportId))
    return { error: 'invalid_report_id', status: 400 };

  const tokenResult = await fetchSFToken({ client, userId });
  if (tokenResult.error) return { error: tokenResult.error, status: 502 };

  const result = await runReport(tokenResult.accessToken, body.reportId);
  if (result?.error) return actionError(result);

  return {
    report_id: body.reportId,
    report_name: result?.attributes?.reportName ?? null,
    ...extractReportIds(result),
  };
}
