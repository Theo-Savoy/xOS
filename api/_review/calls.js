/**
 * api/_review/calls.js — Call stats for Régie.
 * Volume per week + funnel (reuses funnel.js).
 */
import mapping from '../_crm/mapping.js';
import { computeFunnel } from './funnel.js';

const { task: tsk } = mapping.objects;

/**
 * Compute call stats: total, per-week volume, funnel.
 * @param {Array} calls - R4 records
 * @param {string} from
 * @param {string} toExclusive
 * @param {string|null} ownerId
 * @returns {object} { total, per_week: [{ week, count }], funnel }
 */
export function computeCallStats(calls, from, toExclusive, ownerId) {
  const filtered = calls.filter((r) => {
    const d = String(r[tsk.fields.activityDate] || r.CreatedDate || '').slice(
      0,
      10,
    );
    const inRange = d >= from && d < toExclusive;
    const ownerMatch = !ownerId || r[tsk.fields.ownerId] === ownerId;
    return inRange && ownerMatch;
  });

  // Per-week volume (ISO week)
  const weekMap = new Map();
  for (const r of filtered) {
    const dateStr = String(
      r[tsk.fields.activityDate] || r.CreatedDate || '',
    ).slice(0, 10);
    if (!dateStr) continue;
    const d = new Date(`${dateStr}T12:00:00Z`);
    // ISO week
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const year = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const mondayW1 = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
    const week = Math.round((d - mondayW1) / (7 * 86400000)) + 1;
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    weekMap.set(key, (weekMap.get(key) || 0) + 1);
  }

  const perWeek = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  return {
    total: filtered.length,
    per_week: perWeek,
    funnel: computeFunnel(calls, from, toExclusive, ownerId),
  };
}
