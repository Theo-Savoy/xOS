/**
 * api/_review/kpis.js — KPI aggregation for Régie.
 * CA signé, pipeline généré, taux closing + comparaisons N-1/N-2.
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
 * Compute KPIs from oppsByCloseDate + oppsByCreatedDate records.
 * @param {object} params
 * @param {Array} params.oppsByClose - R1 records
 * @param {Array} params.oppsByCreated - R2 records
 * @param {string} params.from - period start (YYYY-MM-DD)
 * @param {string} params.toExclusive - period end exclusive
 * @param {string|null} params.ownerId - filter by owner (null = global)
 * @param {object} [params.prior] - { won: [], created: [] } for N-1
 * @param {object} [params.prior2] - { won: [], created: [] } for N-2
 * @returns {object} KPI payload
 */
export function computeKpis({
  oppsByClose,
  oppsByCreated,
  from,
  toExclusive,
  ownerId,
  prior,
  prior2,
}) {
  const filterOwner = (records) =>
    ownerId
      ? records.filter((r) => r[opp.fields.ownerId] === ownerId)
      : records;

  // --- Current period ---
  const wonCurrent = filterOwner(oppsByClose).filter(
    (r) =>
      r[opp.fields.isWon] &&
      inPeriod(r[opp.fields.closeDate], from, toExclusive),
  );
  const closedCurrent = filterOwner(oppsByClose).filter(
    (r) =>
      r[opp.fields.isClosed] &&
      inPeriod(r[opp.fields.closeDate], from, toExclusive),
  );
  const createdCurrent = filterOwner(oppsByCreated).filter((r) =>
    inPeriod(r[opp.fields.createdDate], from, toExclusive),
  );

  const caSigne = wonCurrent.reduce((sum, r) => sum + safeAmount(r), 0);
  const pipelineGenere = createdCurrent.reduce(
    (sum, r) => sum + safeAmount(r),
    0,
  );
  const pipelineCount = createdCurrent.length;

  const wonCount = wonCurrent.length;
  const closedCount = closedCurrent.length;
  const lostCount = closedCount - wonCount;
  const closingRateCount = closedCount > 0 ? wonCount / closedCount : null;

  const wonAmount = caSigne;
  const closedAmount = closedCurrent.reduce((sum, r) => sum + safeAmount(r), 0);
  const closingRateAmount = closedAmount > 0 ? wonAmount / closedAmount : null;

  // --- By owner breakdown ---
  const byOwner = new Map();
  for (const r of wonCurrent) {
    const owner = r[opp.fields.ownerId];
    if (!byOwner.has(owner))
      byOwner.set(owner, {
        won: 0,
        wonAmount: 0,
        closed: 0,
        closedAmount: 0,
        created: 0,
        createdAmount: 0,
      });
    const entry = byOwner.get(owner);
    entry.won += 1;
    entry.wonAmount += safeAmount(r);
  }
  for (const r of closedCurrent) {
    const owner = r[opp.fields.ownerId];
    if (!byOwner.has(owner))
      byOwner.set(owner, {
        won: 0,
        wonAmount: 0,
        closed: 0,
        closedAmount: 0,
        created: 0,
        createdAmount: 0,
      });
    const entry = byOwner.get(owner);
    entry.closed += 1;
    entry.closedAmount += safeAmount(r);
  }
  for (const r of createdCurrent) {
    const owner = r[opp.fields.ownerId];
    if (!byOwner.has(owner))
      byOwner.set(owner, {
        won: 0,
        wonAmount: 0,
        closed: 0,
        closedAmount: 0,
        created: 0,
        createdAmount: 0,
      });
    const entry = byOwner.get(owner);
    entry.created += 1;
    entry.createdAmount += safeAmount(r);
  }

  // --- N-1 comparison ---
  const priorKpis = prior ? computeSimpleKpis(prior, ownerId) : null;
  const prior2Kpis = prior2 ? computeSimpleKpis(prior2, ownerId) : null;

  return {
    period: { from, toExclusive },
    ownerId: ownerId || null,
    ca_signe: caSigne,
    pipeline_genere: pipelineGenere,
    pipeline_count: pipelineCount,
    closing_rate_count: closingRateCount,
    closing_rate_amount: closingRateAmount,
    won_count: wonCount,
    closed_count: closedCount,
    lost_count: lostCount,
    by_owner: Object.fromEntries(byOwner),
    prior: priorKpis,
    prior2: prior2Kpis,
  };
}

function computeSimpleKpis({ won, created }, ownerId) {
  const filterOwner = (records) =>
    ownerId
      ? records.filter((r) => r[opp.fields.ownerId] === ownerId)
      : records;

  const wonFiltered = filterOwner(won);
  const createdFiltered = filterOwner(created);
  return {
    ca_signe: wonFiltered.reduce((sum, r) => sum + safeAmount(r), 0),
    pipeline_genere: createdFiltered.reduce((sum, r) => sum + safeAmount(r), 0),
    pipeline_count: createdFiltered.length,
    won_count: wonFiltered.length,
  };
}
