/**
 * api/_review/funnel.js — SDR funnel for Régie.
 * Funnel: non décroché + répondeur → décroché → argumenté → RDV planifié.
 */
import mapping from '../_crm/mapping.js';

const { task: tsk } = mapping.objects;

/** Funnel stage order (bottom to top). */
const FUNNEL_STAGES = [
  'Appel non décroché',
  'Message répondeur',
  'Appel décroché',
  'Appel argumenté',
  'RDV planifié',
];

/**
 * Compute SDR funnel from call Task records.
 * @param {Array} calls - R4 records (TaskSubtype = 'Call')
 * @param {string} from
 * @param {string} toExclusive
 * @param {string|null} ownerId
 * @returns {object} { stages: [{ label, count }], total, conversion: { decroche, argumente, rdv } }
 */
export function computeFunnel(calls, from, toExclusive, ownerId) {
  const filtered = calls.filter((r) => {
    const d = String(r[tsk.fields.activityDate] || r.CreatedDate || '').slice(
      0,
      10,
    );
    const inRange = d >= from && d < toExclusive;
    const ownerMatch = !ownerId || r[tsk.fields.ownerId] === ownerId;
    return inRange && ownerMatch;
  });

  const counts = {};
  for (const stage of FUNNEL_STAGES) counts[stage] = 0;

  for (const r of filtered) {
    const result = r[tsk.fields.result];
    if (result && counts[result] !== undefined) {
      counts[result] += 1;
    }
  }

  const total = filtered.length;
  const noAnswer = counts['Appel non décroché'] + counts['Message répondeur'];
  const decroche =
    counts['Appel décroché'] +
    counts['Appel argumenté'] +
    counts['RDV planifié'];
  const argumente = counts['Appel argumenté'] + counts['RDV planifié'];
  const rdv = counts['RDV planifié'];

  return {
    stages: FUNNEL_STAGES.map((label) => ({ label, count: counts[label] })),
    total,
    conversion: {
      no_answer: noAnswer,
      decroche,
      argumente,
      rdv,
      decroche_rate: total > 0 ? decroche / total : null,
      argumente_rate: decroche > 0 ? argumente / decroche : null,
      rdv_rate: argumente > 0 ? rdv / argumente : null,
    },
  };
}
