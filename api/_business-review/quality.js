/**
 * api/_business-review/quality.js — Annexe A8.
 * Compteurs de qualité des dates / montants / tags FY, sans masquer les exclusions (P10).
 */
import mapping from '../_crm/mapping.js';
import { fyIntForDate } from '../_review/period.js';
import { isRenew } from './classify.js';
import { cycleDays, summarizeCycles } from './cycles.js';

const { opportunity: opp } = mapping.objects;

function fyOfIso(iso) {
  if (!iso) return null;
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return fyIntForDate(date);
}

function fyIntOfLabel(fy) {
  const match = String(fy || '').match(/(\d{2})$/);
  return match ? Number(match[1]) : null;
}

export function computeQuality(window, fy = 'FY26') {
  const won = window?.[fy]?.won || [];
  const closed = window?.[fy]?.closed || [];
  const created = window?.[fy]?.created || [];
  const fyInt = fyIntOfLabel(fy);

  const wonNew = won.filter((record) => !isRenew(record?.[opp.fields.name]));
  const days = wonNew.map((record) => cycleDays(record));
  const cycles = summarizeCycles(days);

  let missing_amount = 0;
  let tag_mismatch = 0;
  for (const record of won) {
    const raw = record?.[opp.fields.amount];
    if (raw === null || raw === undefined || raw === '') missing_amount += 1;
    const closedFy = fyOfIso(record?.[opp.fields.closeDate]);
    if (fyInt !== null && closedFy !== null && closedFy !== fyInt) {
      tag_mismatch += 1;
    }
  }

  let created_rows = 0;
  let closed_rows = 0;
  for (const bucket of Object.values(window || {})) {
    created_rows += (bucket?.created || []).length;
    closed_rows += (bucket?.closed || []).length;
  }

  return {
    fy,
    tag_mismatch,
    negative_cycles: cycles.n_excluded,
    over_365: cycles.n_over_365,
    over_730: cycles.n_over_730,
    missing_amount,
    won_total: won.length,
    created_rows,
    closed_rows,
    n_valid: cycles.n_valid,
    n_won_new: wonNew.length,
    n_closed: closed.length,
    n_created: created.length,
    limits: [
      'Cycles négatifs exclus du calcul, comptés à côté de chaque médiane.',
      'Owner courant du snapshot : pas de reconstitution historique.',
      'Amount est déjà annualisé : ne pas multiplier par la durée.',
      'Canaux = activité NEW ; concentration = CA total RENEW inclus.',
      'Cohorte catalogue et statuts exclusifs sont deux univers distincts.',
      'Refresh live obligatoire avant partage actionnaires (P8).',
    ],
  };
}
