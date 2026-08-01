/**
 * api/_review/period.js — Fiscal year logic & period parsing for Régie.
 * FY: July → June. Ported from fetch_dashboard_data_v2.py.
 */

/** FY integer for a given date (July+ → next year's FY). */
export function fyIntForDate(date) {
  return date.getMonth() >= 6
    ? date.getFullYear() + 1 - 2000
    : date.getFullYear() - 2000;
}

/** FY label: fyInt 26 → "FY26". */
export function fyLabel(fyInt) {
  return `FY${String(fyInt).padStart(2, '0')}`;
}

/** FY bounds: fyInt 26 → { from: "2025-07-01", toExclusive: "2026-07-01" }. */
export function fyBounds(fyInt) {
  const startYear = 2000 + fyInt - 1;
  return {
    from: `${startYear}-07-01`,
    toExclusive: `${startYear + 1}-07-01`,
  };
}

/** Quarter index (1-4) for a date within its FY. */
export function quarterIndex(date) {
  return date.getMonth() >= 6
    ? Math.floor((date.getMonth() - 6) / 3) + 1
    : Math.floor((date.getMonth() + 6) / 3);
}

/** Quarter bounds for a given FY + quarter (1-4). */
export function quarterBounds(fyInt, quarter) {
  const startMonth = ((quarter - 1) * 3 + 6) % 12; // July=6 → Q1 starts July
  const startYear = 2000 + fyInt - 1 + (startMonth < 6 ? 1 : 0);
  const endMonth = (startMonth + 3) % 12;
  const endYear = startYear + (endMonth < startMonth ? 1 : 0);
  return {
    from: `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`,
    toExclusive: `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`,
  };
}

/** Month bounds: "2026-03" → { from: "2026-03-01", toExclusive: "2026-04-01" }. */
export function monthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    toExclusive: `${endYear}-${String(endMonth).padStart(2, '0')}-01`,
  };
}

/** ISO week bounds: "2026-W14" → { from: monday, toExclusive: next monday }. */
export function weekBounds(weekKey) {
  const [year, week] = weekKey.split('-W').map(Number);
  // ISO week 1 contains Jan 4
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
  const monday = new Date(mondayW1.getTime() + (week - 1) * 7 * 86400000);
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);
  return {
    from: monday.toISOString().slice(0, 10),
    toExclusive: nextMonday.toISOString().slice(0, 10),
  };
}

/**
 * Parse a period string into { from, toExclusive, label, granularity }.
 * Formats: "FY26", "FY26-Q2", "2026-03", "2026-W14"
 */
export function parsePeriod(period) {
  if (!period || typeof period !== 'string') return null;

  // FY26-Q2
  const qMatch = period.match(/^FY(\d{2})-Q([1-4])$/i);
  if (qMatch) {
    const fyInt = Number(qMatch[1]);
    const quarter = Number(qMatch[2]);
    const bounds = quarterBounds(fyInt, quarter);
    return {
      ...bounds,
      label: period.toUpperCase(),
      granularity: 'quarter',
      fyInt,
      quarter,
    };
  }

  // FY26
  const fyMatch = period.match(/^FY(\d{2})$/i);
  if (fyMatch) {
    const fyInt = Number(fyMatch[1]);
    const bounds = fyBounds(fyInt);
    return {
      ...bounds,
      label: period.toUpperCase(),
      granularity: 'year',
      fyInt,
    };
  }

  // 2026-W14
  const wMatch = period.match(/^(\d{4})-W(\d{2})$/i);
  if (wMatch) {
    const bounds = weekBounds(period);
    return { ...bounds, label: period, granularity: 'week' };
  }

  // 2026-03
  const mMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) {
    const bounds = monthBounds(period);
    return { ...bounds, label: period, granularity: 'month' };
  }

  return null;
}

/** Last complete week (ISO) before today. */
export function lastCompleteWeek(today = new Date()) {
  const day = today.getUTCDay() || 7;
  const thisMonday = new Date(today.getTime() - (day - 1) * 86400000);
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const year = lastMonday.getUTCFullYear();
  // ISO week number
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const week = Math.round((lastMonday - mondayW1) / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** N-1 period label: "FY26" → "FY25", "FY26-Q2" → "FY25-Q2", "2026-03" → "2025-03", "2026-W14" → "2025-W14". */
export function priorPeriodLabel(period) {
  if (!period) return null;
  const fyMatch = period.match(/^FY(\d{2})(-Q[1-4])?$/i);
  if (fyMatch) {
    const fyInt = Number(fyMatch[1]) - 1;
    return `FY${String(fyInt).padStart(2, '0')}${fyMatch[2] || ''}`;
  }
  const yearMatch = period.match(/^(\d{4})(-.+)$/);
  if (yearMatch) {
    return `${Number(yearMatch[1]) - 1}${yearMatch[2]}`;
  }
  return null;
}

/** N-2 period label. */
export function prior2PeriodLabel(period) {
  if (!period) return null;
  const fyMatch = period.match(/^FY(\d{2})(-Q[1-4])?$/i);
  if (fyMatch) {
    const fyInt = Number(fyMatch[1]) - 2;
    return `FY${String(fyInt).padStart(2, '0')}${fyMatch[2] || ''}`;
  }
  const yearMatch = period.match(/^(\d{4})(-.+)$/);
  if (yearMatch) {
    return `${Number(yearMatch[1]) - 2}${yearMatch[2]}`;
  }
  return null;
}

/** Earliest FY available (3 FYs back from current). */
export function earliestQueryDate(today = new Date()) {
  const currentFy = fyIntForDate(today);
  return fyBounds(currentFy - 2).from;
}
