/**
 * api/_business-review/channels.js — Slide 16, annexe A7.
 * Canaux = activité NEW (R2). Concentration = CA total RENEW inclus.
 * Tables top-N : n_displayed / n_total, % sur n_total (P6).
 */
import mapping from '../_crm/mapping.js';
import { isRenew, splitNewRenew } from './classify.js';

const { opportunity: opp } = mapping.objects;

export const CHANNEL_SLIDE_N = 4;
export const CONCENTRATION_TOP_N = 15;
const CONCENTRATION_TOP5 = 5;
export const CHANNEL_NONE = 'Détecté/Signé hors action marketing';

function amountOf(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

function isWon(record) {
  return record?.[opp.fields.isWon] === true;
}

function isNew(record) {
  return !isRenew(record?.[opp.fields.name]);
}

function campaignNameOf(record) {
  const nested = record?.Campaign?.Name;
  const flat = record?.[opp.campaignNameField];
  const label = String(nested || flat || '').trim();
  return label || CHANNEL_NONE;
}

function accountNameOf(record) {
  return (
    record?.[opp.fields.accountName] ||
    record?.Account?.Name ||
    record?.AccountName ||
    '(compte non renseigné)'
  );
}

function accountIdOf(record) {
  return (
    record?.[opp.fields.accountId] ||
    record?.AccountId ||
    record?.Account?.Id ||
    accountNameOf(record)
  );
}

/** Arrondi au demi-supérieur sur une décimale (P5). */
function roundPct1(part, total) {
  if (!total) return 0;
  return Math.round((part * 1000) / total) / 10;
}

export function computeChannels(window, fy = 'FY26') {
  const closed = window?.[fy]?.closed || [];
  const won = window?.[fy]?.won || [];
  const closedNew = closed.filter(isNew);
  const wonNew = won.filter(isNew);
  const split = splitNewRenew(won);

  const byChannel = new Map();
  function touch(name) {
    const current = byChannel.get(name) || {
      label: name,
      closed: 0,
      won: 0,
      amount: 0,
    };
    byChannel.set(name, current);
    return current;
  }

  const closedIds = new Set(
    closedNew.map((record) => record?.[opp.fields.id]).filter(Boolean),
  );
  for (const record of closedNew) {
    const row = touch(campaignNameOf(record));
    row.closed += 1;
    if (isWon(record)) {
      row.won += 1;
      row.amount += amountOf(record);
    }
  }
  for (const record of wonNew) {
    const id = record?.[opp.fields.id];
    if (id && closedIds.has(id)) continue;
    const row = touch(campaignNameOf(record));
    row.won += 1;
    row.amount += amountOf(record);
  }

  const items = [...byChannel.values()]
    .map((row) => ({
      ...row,
      closing: row.closed > 0 ? row.won / row.closed : null,
      closing_pct: roundPct1(row.won, row.closed),
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'fr'));

  const byAccount = new Map();
  for (const record of won) {
    const id = accountIdOf(record);
    const current = byAccount.get(id) || {
      accountId: id,
      name: accountNameOf(record),
      amount: 0,
    };
    current.amount += amountOf(record);
    byAccount.set(id, current);
  }
  const accounts = [...byAccount.values()].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fr'),
  );
  const totalSigned = split.total.amount;
  const top = accounts.map((row, i) => ({
    rank: i + 1,
    name: row.name,
    amount: row.amount,
    pct: roundPct1(row.amount, totalSigned),
  }));
  const top1 = top[0]?.amount || 0;
  const top5 = top
    .slice(0, CONCENTRATION_TOP5)
    .reduce((s, row) => s + row.amount, 0);
  const topN = top
    .slice(0, CONCENTRATION_TOP_N)
    .reduce((s, row) => s + row.amount, 0);

  return {
    fy,
    channels: {
      items,
      n_displayed: Math.min(CHANNEL_SLIDE_N, items.length),
      n_total: items.length,
      truncated: items.length > CHANNEL_SLIDE_N,
    },
    concentration: {
      items: top,
      top1_pct: roundPct1(top1, totalSigned),
      top5_pct: roundPct1(top5, totalSigned),
      topN_pct: roundPct1(topN, totalSigned),
      n_displayed: Math.min(CONCENTRATION_TOP_N, top.length),
      n_total: top.length,
      truncated: top.length > CONCENTRATION_TOP_N,
      total: totalSigned,
    },
    conservation: split.conservation,
    sdr_limit:
      'On ne peut pas mesurer combien de ventes viennent du SDR : aucune clé RDV → Opportunity.',
  };
}
