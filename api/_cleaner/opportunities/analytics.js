const ACTIVITY_RULES = new Set([
  'activity_never_recorded',
  'activity_inactive_over_30_days',
  'activity_inactive_over_3_months',
  'activity_inactive_over_1_year',
]);

function amountOf(item) {
  const amount = Number(item?.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function keyOf(value, fallback = 'unknown') {
  return value == null || value === '' ? fallback : String(value);
}

function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

function periodKey(value) {
  const date =
    dateOnly(value) ||
    (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
      ? `${value}-01`
      : null);
  return date ? date.slice(0, 7) : 'unknown';
}

function isOverdue(item, today) {
  if (Number(item?.days_overdue) > 0) return true;
  const closeDate = dateOnly(item?.close_date);
  return Boolean(
    closeDate && today && closeDate < today && item?.is_closed !== true,
  );
}

function distribution(items, key, includeAmount = true) {
  const map = new Map();
  for (const item of items) {
    const keyValue = keyOf(key(item));
    const row = map.get(keyValue) || {
      key: keyValue,
      label: keyValue,
      count: 0,
      amount: 0,
    };
    row.count += 1;
    if (includeAmount) row.amount += amountOf(item);
    map.set(keyValue, row);
  }
  return [...map.values()].sort(
    (left, right) =>
      right.count - left.count || left.key.localeCompare(right.key),
  );
}

function targetResults(history) {
  return (Array.isArray(history) ? history : []).flatMap((entry) => {
    const targets = entry?.cleaner_action_targets || entry?.targets;
    if (Array.isArray(targets) && targets.length) return targets;
    if (entry?.success === true || entry?.success === false) return [entry];
    return [];
  });
}

export function computeOpportunityAnalytics(items, history = [], period = {}) {
  const visibleItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : [];
  const safePeriod =
    period && typeof period === 'object' && !Array.isArray(period)
      ? period
      : {};
  const today = safePeriod.today || new Date().toISOString().slice(0, 10);
  const anomalyCount = visibleItems.reduce(
    (sum, item) =>
      sum + (Array.isArray(item.anomalies) ? item.anomalies.length : 0),
    0,
  );
  const overdueItems = visibleItems.filter((item) => isOverdue(item, today));
  const reasonsMap = new Map();
  for (const item of visibleItems) {
    for (const anomaly of Array.isArray(item.anomalies) ? item.anomalies : []) {
      if (!anomaly?.ruleId) continue;
      const row = reasonsMap.get(anomaly.ruleId) || {
        ruleId: anomaly.ruleId,
        label: anomaly.label || anomaly.ruleId,
        count: 0,
        amount: 0,
      };
      row.count += 1;
      row.amount += amountOf(item);
      reasonsMap.set(anomaly.ruleId, row);
    }
  }
  const reasonDistribution = [...reasonsMap.values()].sort(
    (left, right) =>
      right.count - left.count || left.ruleId.localeCompare(right.ruleId),
  );
  const targets = targetResults(history);
  const resolved = targets.filter((target) => target?.success === true).length;
  const failed = targets.filter((target) => target?.success === false).length;
  const correctionsTotal =
    targets.length || (Array.isArray(history) ? history.length : 0);
  const resolutionRate = correctionsTotal ? resolved / correctionsTotal : 0;
  const evolutionMap = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    const key = periodKey(entry.at || entry.created_at || entry.period);
    const row = evolutionMap.get(key) || {
      period: key,
      corrections: 0,
      resolved: 0,
      failed: 0,
      anomalies: 0,
    };
    const entryTargets =
      Array.isArray(entry.cleaner_action_targets) &&
      entry.cleaner_action_targets.length
        ? entry.cleaner_action_targets
        : Array.isArray(entry.targets)
          ? entry.targets
          : [];
    row.corrections += entryTargets.length || 1;
    row.resolved += entryTargets.filter(
      (target) => target.success === true,
    ).length;
    row.failed += entryTargets.filter(
      (target) => target.success === false,
    ).length;
    if (typeof entry.anomaly_count === 'number')
      row.anomalies += entry.anomaly_count;
    evolutionMap.set(key, row);
  }

  const ownerDistribution = distribution(
    visibleItems,
    (item) => item.owner_id,
    true,
  ).map((row) => ({
    ...row,
    ownerId: row.key,
    owner:
      visibleItems.find((item) => keyOf(item.owner_id) === row.key)?.owner ||
      row.label,
    active:
      visibleItems.find((item) => keyOf(item.owner_id) === row.key)
        ?.owner_active ?? null,
  }));
  const stageDistribution = distribution(
    visibleItems,
    (item) => item.stage,
    true,
  ).map((row) => ({ ...row, stage: row.key }));
  const overdueDistribution = distribution(
    overdueItems,
    (item) => {
      const days = Number(item.days_overdue);
      if (days > 365) return 'over_1_year';
      if (days > 180) return '6_to_12_months';
      if (days > 90) return '3_to_6_months';
      return 'under_3_months';
    },
    true,
  ).map((row) => ({ ...row, bucket: row.key }));
  const reasons = Object.fromEntries(
    reasonDistribution.map((row) => [row.ruleId, row.count]),
  );
  const totals = {
    totalItems: visibleItems.length,
    affectedItems: visibleItems.length,
    anomalies: anomalyCount,
    amount: visibleItems.reduce((sum, item) => sum + amountOf(item), 0),
    overdue: overdueItems.length,
    overdueAmount: overdueItems.reduce((sum, item) => sum + amountOf(item), 0),
    inactiveOwners: visibleItems.filter((item) => item.owner_active === false)
      .length,
    amountIncoherent: visibleItems.filter((item) =>
      (Array.isArray(item.anomalies) ? item.anomalies : []).some((anomaly) =>
        ['amount_missing', 'amount_implausible'].includes(anomaly.ruleId),
      ),
    ).length,
  };
  return {
    empty: visibleItems.length === 0,
    period: { ...safePeriod, today },
    totals,
    ownerDistribution,
    stageDistribution,
    overdueDistribution,
    reasonDistribution,
    owners: ownerDistribution,
    stages: stageDistribution,
    overdue: overdueDistribution,
    reasons,
    anomalyEvolution: [...evolutionMap.values()].sort((left, right) =>
      left.period.localeCompare(right.period),
    ),
    corrections: { total: correctionsTotal, resolved, failed, resolutionRate },
    resolutionRate,
  };
}
