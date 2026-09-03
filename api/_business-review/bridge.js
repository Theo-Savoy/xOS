/**
 * api/_business-review/bridge.js — Décompositions volume / ticket et Owner (R9, R10).
 * Formule séquentielle (Laspeyres), PAS symétrique — §2.3 / P4.
 */
import mapping from '../_crm/mapping.js';
import { trackingModeFor } from '../_config/access.js';
import { splitNewRenew } from './classify.js';

const { opportunity: opp } = mapping.objects;

function safeAmount(record) {
  return Number(record?.[opp.fields.amount]) || 0;
}

function ownerIdOf(record) {
  return record?.[opp.fields.ownerId] || '';
}

/**
 * effet_volume = (q_N − q_N-1) × ticket_N-1
 * effet_ticket = (ticket_N − ticket_N-1) × q_N
 */
export function volumeTicketBridge(prev, curr) {
  const qPrev = Number(prev?.count) || 0;
  const qCurr = Number(curr?.count) || 0;
  const aPrev = Number(prev?.amount) || 0;
  const aCurr = Number(curr?.amount) || 0;
  const ticketPrev = qPrev > 0 ? aPrev / qPrev : 0;
  const ticketCurr = qCurr > 0 ? aCurr / qCurr : 0;
  const volume = (qCurr - qPrev) * ticketPrev;
  const ticket = (ticketCurr - ticketPrev) * qCurr;
  const delta = aCurr - aPrev;
  return {
    volume,
    ticket,
    delta,
    prev: { amount: aPrev, count: qPrev, ticket: ticketPrev },
    curr: { amount: aCurr, count: qCurr, ticket: ticketCurr },
    conservation: {
      ok: Math.abs(volume + ticket - delta) <= 100,
      delta_amount: volume + ticket - delta,
    },
  };
}

function newAmountByOwner(records) {
  const split = splitNewRenew(records || []);
  const byOwner = new Map();
  for (const record of split.new.records) {
    const id = ownerIdOf(record);
    if (!id) continue;
    const mode = trackingModeFor(id);
    if (mode === 'sdr') continue;
    const current = byOwner.get(id) || {
      ownerId: id,
      amount: 0,
      count: 0,
      mode,
    };
    current.amount += safeAmount(record);
    current.count += 1;
    byOwner.set(id, current);
  }
  return byOwner;
}

function sumGroup(entries) {
  return entries.reduce(
    (acc, entry) => ({
      amount: acc.amount + entry.amount,
      count: acc.count + entry.count,
    }),
    { amount: 0, count: 0 },
  );
}

/**
 * Bridge Owner NEW : actifs (commerciaux encore là) / DG / partis.
 * Ordre de lecture imposé (R10) — le cadrage précède tout diagnostic d'équipe.
 */
export function ownerBridge(prevRecords, currRecords) {
  const prevByOwner = newAmountByOwner(prevRecords);
  const currByOwner = newAmountByOwner(currRecords);
  const ids = new Set([...prevByOwner.keys(), ...currByOwner.keys()]);

  const activePrev = [];
  const activeCurr = [];
  const dgPrev = [];
  const dgCurr = [];
  const departedPrev = [];
  const departedCurr = [];

  for (const id of ids) {
    const prev = prevByOwner.get(id) || {
      ownerId: id,
      amount: 0,
      count: 0,
      mode: trackingModeFor(id),
    };
    const curr = currByOwner.get(id) || {
      ownerId: id,
      amount: 0,
      count: 0,
      mode: trackingModeFor(id),
    };
    const mode = curr.mode || prev.mode;
    if (mode === 'dg') {
      dgPrev.push(prev);
      dgCurr.push(curr);
      continue;
    }
    if (curr.amount > 0 || curr.count > 0) {
      activePrev.push(prev);
      activeCurr.push(curr);
      continue;
    }
    departedPrev.push(prev);
    departedCurr.push(curr);
  }

  const active = {
    prev: sumGroup(activePrev),
    curr: sumGroup(activeCurr),
  };
  const dg = { prev: sumGroup(dgPrev), curr: sumGroup(dgCurr) };
  const departed = {
    prev: sumGroup(departedPrev),
    curr: sumGroup(departedCurr),
  };

  const pack = (label, group) => ({
    label,
    prev: group.prev.amount,
    curr: group.curr.amount,
    delta: group.curr.amount - group.prev.amount,
  });

  const result = {
    active: pack('Commerciaux actifs', active),
    dg: pack('PDG', dg),
    departed: pack('Commerciaux partis', departed),
  };
  result.total = result.active.delta + result.dg.delta + result.departed.delta;
  const newPrev = splitNewRenew(prevRecords).new.amount;
  const newCurr = splitNewRenew(currRecords).new.amount;
  const expected = newCurr - newPrev;
  result.conservation = {
    ok: Math.abs(result.total - expected) <= 100,
    delta_amount: result.total - expected,
  };
  return result;
}
