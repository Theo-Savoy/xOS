/**
 * api/_review/breakdown.js — CA par Type_de_vente__c for Régie.
 */
import mapping from '../_crm/mapping.js';

const { opportunity: opp } = mapping.objects;

function safeAmount(record) {
  return Number(record[opp.fields.amount]) || 0;
}

function inPeriod(dateValue, from, toExclusive) {
  if (!dateValue) return false;
  const d = String(dateValue).slice(0, 10);
  return d >= from && d < toExclusive;
}

/**
 * CA breakdown by sale type (Type_de_vente__c).
 * @param {Array} oppsByClose - R1 records
 * @param {string} from
 * @param {string} toExclusive
 * @param {string|null} ownerId
 * @returns {object} { by_type: { [type]: { count, amount, pct } }, total_count, total_amount }
 */
export function computeBreakdown(oppsByClose, from, toExclusive, ownerId) {
  const won = oppsByClose.filter(
    (r) =>
      r[opp.fields.isWon] &&
      inPeriod(r[opp.fields.closeDate], from, toExclusive) &&
      (!ownerId || r[opp.fields.ownerId] === ownerId),
  );

  const byType = new Map();
  let totalAmount = 0;
  let totalCount = 0;

  for (const r of won) {
    const type = r[opp.saleTypeField] || 'Non défini';
    const amount = safeAmount(r);
    if (!byType.has(type)) byType.set(type, { count: 0, amount: 0 });
    const entry = byType.get(type);
    entry.count += 1;
    entry.amount += amount;
    totalAmount += amount;
    totalCount += 1;
  }

  const result = {};
  for (const [type, entry] of byType) {
    result[type] = {
      count: entry.count,
      amount: entry.amount,
      pct: totalAmount > 0 ? entry.amount / totalAmount : 0,
    };
  }

  return {
    by_type: result,
    total_count: totalCount,
    total_amount: totalAmount,
  };
}
