/**
 * api/_business-review/classify.js — Classification NEW / RENEW (R1, R2, R3).
 * Point unique de vérité : aucune réimplémentation locale ailleurs.
 */
import mapping from '../_crm/mapping.js';

const { opportunity: opp } = mapping.objects;

export function isRenew(name) {
  if (typeof name !== 'string' || !name) return false;
  const lower = name.toLowerCase();
  return lower.includes('renew') || lower.includes('tacite');
}

function safeAmount(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

export function assertConservation(total, newPart, renewPart) {
  const delta_count =
    (total?.count || 0) - (newPart?.count || 0) - (renewPart?.count || 0);
  const delta_amount =
    (total?.amount || 0) - (newPart?.amount || 0) - (renewPart?.amount || 0);
  return {
    ok: delta_count === 0 && Math.abs(delta_amount) <= 0.01,
    delta_count,
    delta_amount,
  };
}

/** Sépare une liste d'opportunités en NEW / RENEW (filtre en JS, pas en SOQL — P13). */
export function splitNewRenew(records) {
  const news = [];
  const renews = [];
  let newAmount = 0;
  let renewAmount = 0;

  for (const record of records || []) {
    const amount = safeAmount(record);
    if (isRenew(record?.[opp.fields.name])) {
      renews.push(record);
      renewAmount += amount;
    } else {
      news.push(record);
      newAmount += amount;
    }
  }

  const newPart = { count: news.length, amount: newAmount, records: news };
  const renewPart = {
    count: renews.length,
    amount: renewAmount,
    records: renews,
  };
  const total = {
    count: newPart.count + renewPart.count,
    amount: newPart.amount + renewPart.amount,
  };

  return {
    total,
    new: newPart,
    renew: renewPart,
    conservation: assertConservation(total, newPart, renewPart),
  };
}
