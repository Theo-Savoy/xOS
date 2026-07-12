import { DEFAULT_CLEANER_SETTINGS } from '../core/settings.js';

function parseDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      return null;
    }
    return candidate;
  }
  const candidate = new Date(text);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  const candidate = Number(normalized);
  return Number.isFinite(candidate) ? candidate : null;
}

function scoreThresholds(thresholds = {}) {
  const source =
    thresholds &&
    typeof thresholds === 'object' &&
    thresholds.settings &&
    typeof thresholds.settings === 'object'
      ? thresholds.settings
      : thresholds || {};
  const candidate =
    source.score && typeof source.score === 'object' ? source.score : source;
  return { ...DEFAULT_CLEANER_SETTINGS.score, ...candidate };
}

function daysBetween(todayValue, dateValue) {
  const today = parseDate(todayValue) || new Date();
  const date = parseDate(dateValue);
  return date
    ? Math.floor((today.getTime() - date.getTime()) / 86400000)
    : null;
}

function overdueDays(opportunity, thresholds) {
  const explicit = numberValue(opportunity.days_overdue);
  if (explicit !== null) return explicit;
  const derived = daysBetween(
    thresholds.today,
    opportunity.close_date ?? opportunity.closeDate,
  );
  return derived === null ? 0 : derived;
}

export function scoreContribution(ruleId, opportunity = {}, thresholds = {}) {
  const score = scoreThresholds(thresholds);
  switch (ruleId) {
    case 'close_date_overdue_over_1_year':
    case 'close_date_overdue_6_to_12_months':
    case 'close_date_overdue_3_to_6_months':
    case 'close_date_overdue_under_3_months':
      return Math.min(
        Math.max(overdueDays(opportunity, thresholds), 0) /
          score.overduePointEveryDays,
        score.overdueCap,
      );
    case 'activity_never_recorded':
      return score.neverActive;
    case 'activity_inactive_over_1_year':
      return score.inactive365Days;
    case 'activity_inactive_over_3_months':
      return score.inactive90Days;
    case 'activity_inactive_over_30_days':
      return score.inactive30Days;
    case 'amount_missing':
      return score.amountMissing;
    case 'amount_implausible':
      return score.amountImplausible;
    case 'probability_zero':
      return score.probabilityZero;
    case 'owner_inactive':
      return score.ownerInactive;
    case 'owner_former_employee':
      return score.formerEmployee;
    case 'opportunity_created_over_2_years':
      return score.veryOldOpportunity;
    case 'opportunity_created_over_1_year':
      return score.oldOpportunity;
    case 'stage_suspect_stalled':
      return score.stalledStage;
    default:
      return 0;
  }
}

export function scoreOpportunity(anomalies, opportunity = {}, thresholds = {}) {
  const record =
    opportunity && typeof opportunity === 'object' ? opportunity : {};
  const ruleIds = new Set(
    (Array.isArray(anomalies) ? anomalies : []).map(
      (anomaly) => anomaly?.ruleId,
    ),
  );
  let total = 0;
  for (const ruleId of ruleIds)
    total += scoreContribution(ruleId, record, thresholds);

  const amount = numberValue(record.amount);
  const score = scoreThresholds(thresholds);
  if (record.category === 'dechet' && amount !== null && amount > 0) {
    total += Math.min(amount / score.amountPointEvery, score.amountCap);
  }
  return Math.round(total * 10) / 10;
}
