import mapping from '../../_crm/mapping.js';
import { DEFAULT_CLEANER_SETTINGS } from '../core/settings.js';
import { scoreContribution } from './score.js';

const OPPORTUNITY_FIELDS = mapping.objects.opportunity.fields;
const USER_FIELDS = mapping.objects.user.fields;
const STALLED_STAGE = mapping.objects.opportunityHistory.stages.stalledSuspect;

const FIELD_ALIASES = {
  closeDate: ['close_date', 'closeDate', OPPORTUNITY_FIELDS.closeDate],
  createdDate: ['created_date', 'createdDate', OPPORTUNITY_FIELDS.createdDate],
  lastActivityDate: [
    'last_activity',
    'lastActivity',
    'lastActivityDate',
    OPPORTUNITY_FIELDS.lastActivityDate,
  ],
  amount: ['amount', OPPORTUNITY_FIELDS.amount],
  probability: ['probability', OPPORTUNITY_FIELDS.probability],
  stage: ['stage', 'stage_name', 'stageName', OPPORTUNITY_FIELDS.stageName],
  ownerId: ['owner_id', 'ownerId', OPPORTUNITY_FIELDS.ownerId],
  ownerName: ['owner', 'owner_name', 'ownerName', OPPORTUNITY_FIELDS.ownerName],
  ownerActive: [
    'owner_active',
    'ownerActive',
    OPPORTUNITY_FIELDS.ownerIsActive,
  ],
  isClosed: ['is_closed', 'isClosed', OPPORTUNITY_FIELDS.isClosed],
};

const RULE_LABELS = {
  close_date_overdue_over_1_year: 'Date de clôture dépassée de plus d’un an',
  close_date_overdue_6_to_12_months: 'Date de clôture dépassée de 6 à 12 mois',
  close_date_overdue_3_to_6_months: 'Date de clôture dépassée de 3 à 6 mois',
  close_date_overdue_under_3_months:
    'Date de clôture dépassée de moins de 3 mois',
  activity_never_recorded: 'Aucune activité jamais enregistrée',
  activity_inactive_over_1_year: 'Pas d’activité depuis plus d’un an',
  activity_inactive_over_3_months: 'Pas d’activité depuis plus de 3 mois',
  activity_inactive_over_30_days: 'Pas d’activité depuis plus de 30 jours',
  amount_missing: 'Montant absent',
  amount_implausible: 'Montant incohérent',
  probability_zero: 'Probabilité égale à 0 %',
  owner_inactive: 'Propriétaire inactif',
  owner_former_employee: 'Ancien commercial',
  opportunity_created_over_2_years: 'Opportunité créée il y a plus de 2 ans',
  opportunity_created_over_1_year: 'Opportunité créée il y a plus d’un an',
  stage_suspect_stalled: 'Étape bloquée',
};

function readField(opportunity, logicalField) {
  for (const alias of FIELD_ALIASES[logicalField] || []) {
    if (alias in opportunity && opportunity[alias] !== undefined)
      return opportunity[alias];
  }
  if (
    logicalField === 'ownerActive' &&
    opportunity.owner &&
    typeof opportunity.owner === 'object'
  ) {
    return (
      opportunity.owner.isActive ?? opportunity.owner[USER_FIELDS.isActive]
    );
  }
  if (
    logicalField === 'ownerName' &&
    opportunity.owner &&
    typeof opportunity.owner === 'object'
  ) {
    return opportunity.owner.name ?? opportunity.owner[USER_FIELDS.name];
  }
  return null;
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  const candidate = Number(normalized);
  return Number.isFinite(candidate) ? candidate : null;
}

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
    )
      return null;
    return candidate;
  }
  const candidate = new Date(text);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function daysSince(todayValue, value) {
  const today = parseDate(todayValue);
  const date = parseDate(value);
  if (!today || !date) return null;
  return Math.floor((today.getTime() - date.getTime()) / 86400000);
}

function thresholdsFor(context) {
  const candidate =
    context?.thresholds || context?.settings?.settings || context?.settings;
  return {
    ...DEFAULT_CLEANER_SETTINGS,
    ...(candidate || {}),
    score: { ...DEFAULT_CLEANER_SETTINGS.score, ...(candidate?.score || {}) },
  };
}

function makeAnomaly(
  ruleId,
  severity,
  field,
  actual,
  expected,
  opportunity,
  thresholds,
) {
  const evidenceActual =
    actual === null || actual === undefined
      ? null
      : typeof actual === 'string' || typeof actual === 'number'
        ? actual
        : String(actual);
  return {
    ruleId,
    severity,
    score: scoreContribution(ruleId, opportunity, thresholds),
    label: RULE_LABELS[ruleId],
    evidence: [{ field, actual: evidenceActual, expected }],
  };
}

function formerEmployee(opportunity, context) {
  if (
    opportunity.former_owner === true ||
    opportunity.owner_former_employee === true
  )
    return true;
  const ownerId = readField(opportunity, 'ownerId');
  const ownerName = readField(opportunity, 'ownerName');
  return (
    (context.formerOwnerIds || []).includes(ownerId) ||
    (context.formerOwnerNames || []).includes(ownerName)
  );
}

export function detectOpportunityAnomalies(opportunity = {}, context = {}) {
  const record =
    opportunity && typeof opportunity === 'object' ? opportunity : {};
  const safeContext = context && typeof context === 'object' ? context : {};
  const thresholds = thresholdsFor(safeContext);
  const closeDate = readField(record, 'closeDate');
  const createdDate = readField(record, 'createdDate');
  const lastActivityDate = readField(record, 'lastActivityDate');
  const today = safeContext.today;
  const closeAge = daysSince(today, closeDate);
  const createdAge = daysSince(today, createdDate);
  const activityAge = daysSince(today, lastActivityDate);
  const amount = numberValue(readField(record, 'amount'));
  const probability = numberValue(readField(record, 'probability'));
  const ownerActive = readField(record, 'ownerActive');
  const stage = readField(record, 'stage');
  const closed = readField(record, 'isClosed');
  const anomalies = [];

  if (closed === true || closed === 'true') return anomalies;

  if (closeAge !== null && closeAge > 0) {
    let ruleId = 'close_date_overdue_under_3_months';
    if (closeAge > 365) ruleId = 'close_date_overdue_over_1_year';
    else if (closeAge > 180) ruleId = 'close_date_overdue_6_to_12_months';
    else if (closeAge > 90) ruleId = 'close_date_overdue_3_to_6_months';
    anomalies.push(
      makeAnomaly(
        ruleId,
        closeAge > thresholds.closeDateCriticalDays ? 'critical' : 'warning',
        'close_date',
        closeDate,
        'date antérieure à today',
        record,
        thresholds,
      ),
    );
  }

  if (amount === null || amount === 0) {
    anomalies.push(
      makeAnomaly(
        'amount_missing',
        'critical',
        'amount',
        readField(record, 'amount'),
        'montant numérique strictement positif',
        record,
        thresholds,
      ),
    );
  } else if (amount > 0 && amount <= thresholds.amountImplausibleMax) {
    anomalies.push(
      makeAnomaly(
        'amount_implausible',
        'critical',
        'amount',
        amount,
        `montant supérieur à ${thresholds.amountImplausibleMax}`,
        record,
        thresholds,
      ),
    );
  }

  if (probability === 0) {
    anomalies.push(
      makeAnomaly(
        'probability_zero',
        'warning',
        'probability',
        probability,
        'probabilité strictement supérieure à 0',
        record,
        thresholds,
      ),
    );
  }
  if (ownerActive === false || ownerActive === 'false') {
    anomalies.push(
      makeAnomaly(
        'owner_inactive',
        'critical',
        'owner_active',
        ownerActive,
        'propriétaire actif',
        record,
        thresholds,
      ),
    );
  }
  if (formerEmployee(record, safeContext)) {
    anomalies.push(
      makeAnomaly(
        'owner_former_employee',
        'critical',
        'owner',
        readField(record, 'ownerName'),
        'propriétaire non ancien salarié',
        record,
        thresholds,
      ),
    );
  }
  if (createdAge !== null) {
    if (createdAge > thresholds.opportunityVeryOldDays) {
      anomalies.push(
        makeAnomaly(
          'opportunity_created_over_2_years',
          'critical',
          'created_date',
          createdDate,
          `créée depuis moins de ${thresholds.opportunityVeryOldDays} jours`,
          record,
          thresholds,
        ),
      );
    } else if (createdAge > thresholds.opportunityOldDays) {
      anomalies.push(
        makeAnomaly(
          'opportunity_created_over_1_year',
          'warning',
          'created_date',
          createdDate,
          `créée depuis moins de ${thresholds.opportunityOldDays} jours`,
          record,
          thresholds,
        ),
      );
    }
  }

  const stalledStage =
    safeContext.stalledStage || safeContext.meta?.stalledStage || STALLED_STAGE;
  if (stage === stalledStage) {
    anomalies.push(
      makeAnomaly(
        'stage_suspect_stalled',
        'warning',
        'stage',
        stage,
        'étape différente de l’étape bloquée',
        record,
        thresholds,
      ),
    );
  }

  if (anomalies.length > 0) {
    if (lastActivityDate === null || lastActivityDate === '') {
      anomalies.splice(
        1,
        0,
        makeAnomaly(
          'activity_never_recorded',
          'warning',
          'last_activity',
          lastActivityDate,
          'au moins une activité enregistrée',
          record,
          thresholds,
        ),
      );
    } else if (activityAge !== null) {
      let activityRuleId = null;
      if (activityAge > 365) activityRuleId = 'activity_inactive_over_1_year';
      else if (activityAge > 90)
        activityRuleId = 'activity_inactive_over_3_months';
      else if (activityAge > 30)
        activityRuleId = 'activity_inactive_over_30_days';
      if (activityRuleId)
        anomalies.splice(
          1,
          0,
          makeAnomaly(
            activityRuleId,
            'warning',
            'last_activity',
            lastActivityDate,
            'activité récente',
            record,
            thresholds,
          ),
        );
    }
  }

  return anomalies;
}
