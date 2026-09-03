/**
 * api/_business-review/soql.js — Requêtes multi-FY FY22→FY26.
 * Dates via period.js (R4). Filtre RENEW en JS, jamais en SOQL (P13).
 */
import mapping from '../_crm/mapping.js';
import { escapeSOQL } from '../_crm/salesforce.js';
import { fyBounds } from '../_review/period.js';

const { opportunity: opp, event: evt } = mapping.objects;

function asFyInt(fyInt) {
  const n = Number(fyInt);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error(`invalid_fy:${fyInt}`);
  }
  return n;
}

/** Liste d'entiers FY inclusifs, ex. fyRange(22, 26) → [22, 23, 24, 25, 26]. */
export function fyRange(fromFy, toFy) {
  const from = asFyInt(fromFy);
  const to = asFyInt(toFy);
  if (from > to) return [];
  const ints = [];
  for (let fy = from; fy <= to; fy++) ints.push(fy);
  return ints;
}

function oppFields() {
  return [
    opp.fields.id,
    opp.fields.name,
    opp.fields.amount,
    opp.fields.closeDate,
    opp.fields.createdDate,
    opp.fields.ownerId,
    opp.fields.ownerName,
    opp.fields.stageName,
    opp.fields.isWon,
    opp.fields.isClosed,
    opp.saleTypeField,
    opp.lossReasonField,
    opp.winReasonField,
    opp.campaignField,
    opp.campaignNameField,
    opp.commissionTypeField,
  ].filter(Boolean);
}

function closeDateClause(fyInt) {
  const { from, toExclusive } = fyBounds(asFyInt(fyInt));
  return `${opp.fields.closeDate} >= ${escapeSOQL(from)} AND ${opp.fields.closeDate} < ${escapeSOQL(toExclusive)}`;
}

function createdDateClause(fyInt) {
  const { from, toExclusive } = fyBounds(asFyInt(fyInt));
  return `${opp.fields.createdDate} >= ${escapeSOQL(from)}T00:00:00Z AND ${opp.fields.createdDate} < ${escapeSOQL(toExclusive)}T00:00:00Z`;
}

export function wonOppsForFy(fyInt) {
  return `SELECT ${oppFields().join(', ')} FROM ${opp.name} WHERE ${opp.fields.isWon} = true AND ${closeDateClause(fyInt)} ORDER BY ${opp.fields.closeDate} ASC`;
}

export function createdOppsForFy(fyInt) {
  return `SELECT ${oppFields().join(', ')} FROM ${opp.name} WHERE ${createdDateClause(fyInt)} ORDER BY ${opp.fields.createdDate} ASC`;
}

export function closedOppsForFy(fyInt) {
  return `SELECT ${oppFields().join(', ')} FROM ${opp.name} WHERE ${opp.fields.isClosed} = true AND ${closeDateClause(fyInt)} ORDER BY ${opp.fields.closeDate} ASC`;
}

/** Events (RDV) d'un exercice — filtre Subject « rdv » en JS (D5, P11). */
export function eventsForFy(fyInt) {
  const { from, toExclusive } = fyBounds(asFyInt(fyInt));
  const fields = [
    evt.fields.subject,
    evt.fields.activityDate,
    evt.fields.ownerId,
    'Owner.Name',
  ];
  return `SELECT ${fields.join(', ')} FROM ${evt.name} WHERE ${evt.fields.ownerId} != null AND ${evt.fields.activityDate} >= ${escapeSOQL(from)} AND ${evt.fields.activityDate} < ${escapeSOQL(toExclusive)} ORDER BY ${evt.fields.activityDate} ASC`;
}
