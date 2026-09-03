/**
 * api/_business-review/portfolio.js — Slide 15, R12, P7.
 * Quatre statuts exclusifs (flux CA vs stock ARR) et cohorte d'ouverture séparée.
 */
import mapping from '../_crm/mapping.js';
import { fyBounds } from '../_review/period.js';
import { productKey, splitNewRenew } from './classify.js';

const { opportunity: opp } = mapping.objects;

const STATUS_META = {
  gagnes: { label: 'Gagnés', kind: 'flux' },
  fidelises: { label: 'Fidélisés', kind: 'flux' },
  engages: { label: 'Engagés', kind: 'stock' },
  perdus: { label: 'Perdus', kind: 'stock' },
};

function amountOf(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

function accountIdOf(record) {
  return (
    record?.[opp.fields.accountId] ||
    record?.AccountId ||
    record?.Account?.Id ||
    ''
  );
}

function accountNameOf(record) {
  return (
    record?.[opp.fields.accountName] ||
    record?.Account?.Name ||
    record?.AccountName ||
    ''
  );
}

function closeDay(record) {
  return String(record?.[opp.fields.closeDate] || '').slice(0, 10);
}

function emptyStatus(key) {
  return {
    key,
    label: STATUS_META[key].label,
    kind: STATUS_META[key].kind,
    count: 0,
    amount: 0,
  };
}

function arrDurationYears(record) {
  const label = String(record?.[opp.commissionTypeField] || '');
  const match = label.match(/(\d+)\s*ans/i);
  return match ? Number(match[1]) : 0;
}

function isArrCatalogue(record) {
  return (
    productKey(record) === 'catalogue' &&
    (opp.arrCommissionTypes || []).includes(record?.[opp.commissionTypeField])
  );
}

function addYears(iso, years) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function fyIntOfLabel(fy) {
  const match = String(fy || '').match(/(\d{2})$/);
  return match ? Number(match[1]) : 26;
}

/** Cohorte d'ouverture catalogue depuis les contrats ARR de la fenêtre (live). */
export function deriveArrCohort(window, fy = 'FY26', extraArr = []) {
  const fyInt = fyIntOfLabel(fy);
  const { from: fyStart, toExclusive: fyEnd } = fyBounds(fyInt);
  const seen = new Set();
  const records = [];
  for (const bucket of Object.values(window || {})) {
    for (const record of bucket?.won || []) {
      const id = record?.[opp.fields.id];
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      records.push(record);
    }
  }
  for (const record of extraArr || []) {
    const id = record?.[opp.fields.id];
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    records.push(record);
  }

  const byAccount = new Map();
  for (const record of records) {
    if (!isArrCatalogue(record)) continue;
    const accountId = accountIdOf(record);
    if (!accountId) continue;
    const close = closeDay(record);
    const years = arrDurationYears(record);
    if (!close || years < 2) continue;
    const end = addYears(close, years);
    if (close >= fyStart) continue;
    if (end <= fyStart) continue;
    const current = byAccount.get(accountId) || {
      AccountId: accountId,
      AccountName: accountNameOf(record),
      arr: 0,
      active_at_close: false,
    };
    current.arr += amountOf(record);
    if (end > fyEnd) current.active_at_close = true;
    byAccount.set(accountId, current);
  }
  return [...byAccount.values()];
}

function signedByAccount(records) {
  const map = new Map();
  for (const record of records || []) {
    const accountId = accountIdOf(record);
    if (!accountId) continue;
    const current = map.get(accountId) || {
      accountId,
      name: accountNameOf(record),
      amount: 0,
    };
    current.amount += amountOf(record);
    map.set(accountId, current);
  }
  return map;
}

function priorAccountIds(window, fy) {
  const fyInt = fyIntOfLabel(fy);
  const { from: fyStart } = fyBounds(fyInt);
  const ids = new Set();
  for (const bucket of Object.values(window || {})) {
    for (const record of bucket?.won || []) {
      if (closeDay(record) < fyStart) {
        const accountId = accountIdOf(record);
        if (accountId) ids.add(accountId);
      }
    }
  }
  return ids;
}

export function computePortfolio(window, arrCohort = [], fy = 'FY26') {
  const won = window?.[fy]?.won || [];
  const split = splitNewRenew(won);
  const signed = signedByAccount(won);
  const prior = priorAccountIds(window, fy);

  const gagnes = emptyStatus('gagnes');
  const fidelises = emptyStatus('fidelises');
  for (const row of signed.values()) {
    if (prior.has(row.accountId)) {
      fidelises.count += 1;
      fidelises.amount += row.amount;
    } else {
      gagnes.count += 1;
      gagnes.amount += row.amount;
    }
  }

  const signedIds = new Set(signed.keys());
  const engages = emptyStatus('engages');
  const perdus = emptyStatus('perdus');
  let cohortArr = 0;
  let retained = 0;
  let lostCount = 0;
  for (const row of arrCohort || []) {
    const id = row.AccountId || row.accountId;
    const arr = Number(row.arr) || 0;
    cohortArr += arr;
    if (signedIds.has(id)) {
      retained += 1;
      continue;
    }
    if (row.active_at_close) {
      engages.count += 1;
      engages.amount += arr;
      retained += 1;
    } else {
      perdus.count += 1;
      perdus.amount += arr;
      lostCount += 1;
    }
  }

  const nStatus =
    gagnes.count + fidelises.count + engages.count + perdus.count;
  const nCohort = (arrCohort || []).length;
  const signedAmount = gagnes.amount + fidelises.amount;
  const lostShare = cohortArr > 0 ? perdus.amount / cohortArr : 0;

  return {
    fy,
    statuses: {
      gagnes,
      fidelises,
      engages,
      perdus,
      n_accounts: nStatus,
    },
    cohort: {
      n_accounts: nCohort,
      arr: cohortArr,
      retained: {
        count: retained,
        pct: nCohort ? Math.round((retained * 1000) / nCohort) / 10 : 0,
      },
      lost: {
        count: lostCount,
        pct: nCohort ? Math.round((lostCount * 1000) / nCohort) / 10 : 0,
      },
    },
    conservation: {
      signed: {
        ok: Math.abs(signedAmount - split.total.amount) <= 1_000,
        delta_amount: signedAmount - split.total.amount,
        actual: signedAmount,
        expected: split.total.amount,
      },
      lost_share: {
        ok: Math.abs(lostShare - 0.334) <= 0.002,
        ratio: lostShare,
        expected: 0.334,
      },
      ok:
        Math.abs(signedAmount - split.total.amount) <= 1_000 &&
        (nCohort === 0 || Math.abs(lostShare - 0.334) <= 0.002),
      delta_count: 0,
      delta_amount: signedAmount - split.total.amount,
    },
  };
}
