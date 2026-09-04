/**
 * api/_business-review/overview.js — Série empilée NEW / RENEW FY22→FY26 (slide 3, A4).
 * Catégorie « Autre / non défini » dès le lot 1 (P3).
 */
import mapping from '../_crm/mapping.js';
import { isRenew, splitNewRenew } from './classify.js';

const { opportunity: opp } = mapping.objects;

const KNOWN_SALE_TYPES = new Set(
  Object.values(opp.saleTypes || {})
    .flat()
    .map((label) => String(label).trim().toLowerCase()),
);

function isKnownSaleType(value) {
  const label = String(value || '')
    .trim()
    .toLowerCase();
  if (!label) return false;
  return KNOWN_SALE_TYPES.has(label);
}

function otherBucket(newRecords) {
  let count = 0;
  let amount = 0;
  for (const record of newRecords || []) {
    if (isKnownSaleType(record?.[opp.saleTypeField])) continue;
    count += 1;
    amount += Number(record?.[opp.fields.amount]) || 0;
  }
  return { count, amount, label: 'Autre' };
}

function countNew(records) {
  return (records || []).filter((record) => !isRenew(record?.[opp.fields.name]))
    .length;
}

export function computeOverview(window) {
  const series = Object.keys(window || {})
    .sort()
    .map((fy) => {
      const bucket = window[fy] || {};
      const split = splitNewRenew(bucket.won || []);
      const closedNew = countNew(bucket.closed);
      const detectionsNew = countNew(bucket.created);
      const signaturesNew = split.new.count;
      return {
        fy,
        total: split.total.amount,
        new: split.new.amount,
        renew: split.renew.amount,
        total_count: split.total.count,
        new_count: split.new.count,
        renew_count: split.renew.count,
        detections_new: detectionsNew,
        closed_new: closedNew,
        signatures_new: signaturesNew,
        closing_new: closedNew > 0 ? signaturesNew / closedNew : null,
        other: otherBucket(split.new.records),
        conservation: split.conservation,
      };
    });

  const conservation = series.reduce(
    (acc, row) => ({
      ok: acc.ok && row.conservation.ok,
      delta_count: acc.delta_count + row.conservation.delta_count,
      delta_amount: acc.delta_amount + row.conservation.delta_amount,
    }),
    { ok: true, delta_count: 0, delta_amount: 0 },
  );

  return { series, conservation };
}
