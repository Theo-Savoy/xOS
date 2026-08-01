/**
 * api/_review/attention.js — Opps needing attention for Régie.
 * Stale opps (scored), key opps (high value), hot opps (high probability).
 */
import mapping from '../_crm/mapping.js';

const { opportunity: opp } = mapping.objects;

function safeAmount(record) {
  return Number(record[opp.fields.amount]) || 0;
}

function safeProbability(record) {
  return Number(record[opp.fields.probability]) || 0;
}

function daysSince(dateValue, now) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/**
 * Score = days_since_activity × (amount/1000) × (probability/100 + 0.1)
 * Ported from gen_dashboard_v6.py.
 */
function staleScore(record, now) {
  const days = daysSince(record[opp.fields.lastActivityDate], now);
  if (days === null || days < 0) return 0;
  const amount = safeAmount(record);
  const prob = safeProbability(record);
  return days * (amount / 1000) * (prob / 100 + 0.1);
}

/**
 * Compute attention lists from open opps.
 * @param {Array} oppsByClose - R1 records
 * @param {string|null} ownerId
 * @param {number} [staleLimit=15]
 * @param {number} [keyLimit=10]
 * @returns {object} { stale: [], key: [], hot: [] }
 */
export function computeAttention(
  oppsByClose,
  ownerId,
  staleLimit = 15,
  keyLimit = 10,
) {
  const now = new Date();
  const open = oppsByClose.filter(
    (r) =>
      !r[opp.fields.isClosed] &&
      (!ownerId || r[opp.fields.ownerId] === ownerId),
  );

  // Stale: scored, top N
  const stale = open
    .map((r) => ({
      id: r[opp.fields.id],
      name: r[opp.fields.name],
      owner_id: r[opp.fields.ownerId],
      owner_name: r[opp.fields.ownerName],
      account_name: r[opp.fields.accountName],
      stage: r[opp.fields.stageName],
      amount: safeAmount(r),
      probability: safeProbability(r),
      close_date: r[opp.fields.closeDate],
      last_activity: r[opp.fields.lastActivityDate],
      days_since_activity: daysSince(r[opp.fields.lastActivityDate], now),
      score: staleScore(r, now),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, staleLimit);

  // Key: highest amount open opps
  const key = [...open]
    .sort((a, b) => safeAmount(b) - safeAmount(a))
    .slice(0, keyLimit)
    .map((r) => ({
      id: r[opp.fields.id],
      name: r[opp.fields.name],
      owner_id: r[opp.fields.ownerId],
      owner_name: r[opp.fields.ownerName],
      account_name: r[opp.fields.accountName],
      stage: r[opp.fields.stageName],
      amount: safeAmount(r),
      probability: safeProbability(r),
      close_date: r[opp.fields.closeDate],
    }));

  // Hot: highest probability open opps (≥ 50%)
  const hot = open
    .filter((r) => safeProbability(r) >= 50)
    .sort((a, b) => safeProbability(b) - safeProbability(a))
    .slice(0, keyLimit)
    .map((r) => ({
      id: r[opp.fields.id],
      name: r[opp.fields.name],
      owner_id: r[opp.fields.ownerId],
      owner_name: r[opp.fields.ownerName],
      account_name: r[opp.fields.accountName],
      stage: r[opp.fields.stageName],
      amount: safeAmount(r),
      probability: safeProbability(r),
      close_date: r[opp.fields.closeDate],
    }));

  return { stale, key, hot };
}
