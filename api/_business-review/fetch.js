/**
 * api/_business-review/fetch.js — Fenêtre multi-FY, une requête par exercice (P2).
 * Ne pas relever SOQL_FETCH_CAP : le découpage par FY reste sous 2 000 lignes.
 */
import { fyLabel } from '../_review/period.js';
import { searchContacts } from '../_crm/salesforce.js';
import { closedOppsForFy, createdOppsForFy, wonOppsForFy } from './soql.js';

async function fetchSoql(token, soql, search) {
  const result = await search(token, soql);
  if (result?.error) throw new Error(result.error);
  return {
    records: result?.records || [],
    truncated: result?.truncated === true,
  };
}

/**
 * @param {string} token
 * @param {number[]} fyInts
 * @param {Function} [search] — injectable pour les tests
 * @returns {Promise<{ window: Record<string, { won: any[], closed: any[], created: any[] }>, truncated: boolean, truncated_fys: string[] }>}
 */
export async function fetchFyWindow(token, fyInts, search = searchContacts) {
  const ints = fyInts || [];
  const entries = await Promise.all(
    ints.map(async (fyInt) => {
      const label = fyLabel(fyInt);
      const [won, closed, created] = await Promise.all([
        fetchSoql(token, wonOppsForFy(fyInt), search),
        fetchSoql(token, closedOppsForFy(fyInt), search),
        fetchSoql(token, createdOppsForFy(fyInt), search),
      ]);
      const truncated = won.truncated || closed.truncated || created.truncated;
      return [
        label,
        {
          won: won.records,
          closed: closed.records,
          created: created.records,
          truncated,
        },
      ];
    }),
  );

  const window = Object.fromEntries(
    entries.map(([label, payload]) => [
      label,
      {
        won: payload.won,
        closed: payload.closed,
        created: payload.created,
      },
    ]),
  );
  const truncated_fys = entries
    .filter(([, payload]) => payload.truncated)
    .map(([label]) => label);

  return {
    window,
    truncated: truncated_fys.length > 0,
    truncated_fys,
  };
}
