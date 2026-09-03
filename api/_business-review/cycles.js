/**
 * api/_business-review/cycles.js — Médiane / moyenne / exclusions (slide 8, P10).
 * Cycles négatifs exclus du calcul et comptés. >365 j et >730 j comptés, inclus.
 */
import mapping from '../_crm/mapping.js';
import { isRenew, productKey } from './classify.js';

const { opportunity: opp } = mapping.objects;
const PRODUCT_KEYS = ['catalogue', 'sur_mesure', 'conseil', 'autre'];

export function cycleDays(record) {
  const created = record?.[opp.fields.createdDate];
  const closed = record?.[opp.fields.closeDate];
  if (!created || !closed) return null;
  const t0 = Date.parse(`${String(created).slice(0, 10)}T00:00:00.000Z`);
  const t1 = Date.parse(`${String(closed).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.round((t1 - t0) / 86_400_000);
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeCycles(days) {
  const valid = [];
  let n_excluded = 0;
  let n_over_365 = 0;
  let n_over_730 = 0;
  for (const day of days || []) {
    if (day === null || day === undefined || day < 0) {
      n_excluded += 1;
      continue;
    }
    valid.push(day);
    if (day > 365) n_over_365 += 1;
    if (day > 730) n_over_730 += 1;
  }
  const medianValue = median(valid);
  const mean =
    valid.length === 0
      ? null
      : Math.round(valid.reduce((sum, day) => sum + day, 0) / valid.length);
  return {
    median: medianValue === null ? null : Math.round(medianValue),
    mean,
    n: valid.length,
    n_valid: valid.length,
    n_excluded,
    n_over_365,
    n_over_730,
  };
}

function daysByProduct(records) {
  const buckets = Object.fromEntries(PRODUCT_KEYS.map((key) => [key, []]));
  const all = [];
  for (const record of records || []) {
    const days = cycleDays(record);
    all.push(days);
    const key = productKey(record);
    (buckets[key] || buckets.autre).push(days);
  }
  return { all, buckets };
}

export function computeCycles(window) {
  const series = Object.keys(window || {})
    .sort()
    .map((fy) => {
      const wonNew = (window[fy]?.won || []).filter(
        (record) => !isRenew(record?.[opp.fields.name]),
      );
      const { all, buckets } = daysByProduct(wonNew);
      const global = summarizeCycles(all);
      const by_product = {};
      for (const key of PRODUCT_KEYS) {
        const stats = summarizeCycles(buckets[key]);
        by_product[key] = {
          median: stats.median,
          mean: stats.mean,
          n: stats.n_valid,
          n_excluded: stats.n_excluded,
          n_over_365: stats.n_over_365,
          n_over_730: stats.n_over_730,
        };
      }
      return {
        fy,
        median: global.median,
        mean: global.mean,
        n_valid: global.n_valid,
        n_excluded: global.n_excluded,
        n_over_365: global.n_over_365,
        n_over_730: global.n_over_730,
        by_product,
      };
    });

  return { series };
}
