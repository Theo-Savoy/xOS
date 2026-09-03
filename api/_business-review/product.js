/**
 * api/_business-review/product.js — Produit × exercice (slides 9, 11, A5).
 * Catégorie « Autre / non défini » obligatoire (P3). Conseil : 8 = 3 NEW + 5 RENEW (R11).
 */
import mapping from '../_crm/mapping.js';
import { isRenew, productKey, splitNewRenew } from './classify.js';
import { cycleDays, summarizeCycles } from './cycles.js';

const { opportunity: opp } = mapping.objects;

export { productKey };

export const PRODUCT_KEYS = ['catalogue', 'sur_mesure', 'conseil', 'autre'];
export const PRODUCT_LABELS = {
  catalogue: 'Catalogue',
  sur_mesure: 'Sur-mesure',
  conseil: 'Conseil',
  autre: 'Autre / non défini',
};

function emptyProduct(key) {
  return {
    key,
    label: PRODUCT_LABELS[key],
    closed: 0,
    won: 0,
    closing: null,
    amountNew: 0,
    amountRenew: 0,
    amount_total: 0,
    new: 0,
    renew: 0,
    total_signatures: 0,
    median: null,
    mean: null,
    n_cycle: 0,
    n_excluded: 0,
    cycleDays: [],
  };
}

function amountOf(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

function packProduct(bucket) {
  const { cycleDays: days, ...rest } = bucket;
  const closing = rest.closed > 0 ? rest.won / rest.closed : null;
  const cycles = summarizeCycles(days);
  return {
    ...rest,
    closing,
    amount_total: rest.amountNew + rest.amountRenew,
    total_signatures: rest.new + rest.renew,
    median: cycles.median,
    mean: cycles.mean,
    n_cycle: cycles.n_valid,
    n_excluded: cycles.n_excluded,
  };
}

export function computeProduct(window) {
  const series = Object.keys(window || {})
    .sort()
    .map((fy) => {
      const bucket = window[fy] || {};
      const products = Object.fromEntries(
        PRODUCT_KEYS.map((key) => [key, emptyProduct(key)]),
      );

      for (const record of bucket.closed || []) {
        if (isRenew(record?.[opp.fields.name])) continue;
        const key = productKey(record);
        products[key].closed += 1;
      }

      for (const record of bucket.won || []) {
        const key = productKey(record);
        const row = products[key] || products.autre;
        const amount = amountOf(record);
        if (isRenew(record?.[opp.fields.name])) {
          row.renew += 1;
          row.amountRenew += amount;
        } else {
          row.won += 1;
          row.new += 1;
          row.amountNew += amount;
          row.cycleDays.push(cycleDays(record));
        }
      }

      const packed = Object.fromEntries(
        PRODUCT_KEYS.map((key) => [key, packProduct(products[key])]),
      );
      const split = splitNewRenew(bucket.won || []);
      return {
        fy,
        amountNew: split.new.amount,
        amountRenew: split.renew.amount,
        amountTotal: split.total.amount,
        conservation: split.conservation,
        products: packed,
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
