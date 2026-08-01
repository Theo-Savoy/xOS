/**
 * api/_review/soql.js — SOQL query builders for Régie.
 * Ported from fetch_dashboard_data_v2.py (6 queries).
 * Uses mapping.js for all field names — no hardcoded API names.
 */
import mapping from '../_crm/mapping.js';
import { escapeSOQL } from '../_crm/salesforce.js';

const { opportunity: opp, event: evt, task: tsk } = mapping.objects;

/** Owner filter clause. ownerIds = array of SF User IDs. */
export function ownerClause(field, ownerIds) {
  if (!ownerIds?.length) return '';
  return ` AND ${field} IN (${ownerIds.map((id) => `'${escapeSOQL(id)}'`).join(', ')})`;
}

/**
 * R1 — Opps by CloseDate (CA signé, pipeline, closing, attention).
 * Fields: Id, Name, OwnerId, Owner.Name, AccountId, Account.Name, StageName,
 *         CloseDate, Amount, Probability, IsWon, IsClosed, CreatedDate,
 *         Type_de_vente__c, ExpectedRevenue, LastActivityDate
 */
export function oppsByCloseDate(ownerIds, queryStart) {
  const fields = [
    opp.fields.id,
    opp.fields.name,
    opp.fields.ownerId,
    opp.fields.ownerName,
    opp.fields.accountId,
    opp.fields.accountName,
    opp.fields.stageName,
    opp.fields.closeDate,
    opp.fields.amount,
    opp.fields.probability,
    opp.fields.isWon,
    opp.fields.isClosed,
    opp.fields.createdDate,
    opp.saleTypeField,
    opp.fields.expectedRevenue,
    opp.fields.lastActivityDate,
  ];
  return `SELECT ${fields.join(', ')} FROM ${opp.name} WHERE ${opp.fields.ownerId} != null AND ${opp.fields.closeDate} >= ${queryStart}${ownerClause(opp.fields.ownerId, ownerIds)} ORDER BY ${opp.fields.closeDate} ASC`;
}

/**
 * R2 — Opps by CreatedDate (pipeline généré).
 */
export function oppsByCreatedDate(ownerIds, queryStart) {
  const fields = [
    opp.fields.id,
    opp.fields.name,
    opp.fields.ownerId,
    opp.fields.ownerName,
    opp.fields.accountId,
    opp.fields.accountName,
    opp.fields.stageName,
    opp.fields.closeDate,
    opp.fields.amount,
    opp.fields.probability,
    opp.fields.isWon,
    opp.fields.isClosed,
    opp.fields.createdDate,
    opp.saleTypeField,
    opp.fields.expectedRevenue,
  ];
  return `SELECT ${fields.join(', ')} FROM ${opp.name} WHERE ${opp.fields.createdDate} >= ${queryStart}T00:00:00Z${ownerClause(opp.fields.ownerId, ownerIds)} ORDER BY ${opp.fields.createdDate} ASC`;
}

/**
 * R3 — Events (RDV). Filter "rdv" in Subject done in JS.
 */
export function eventsQuery(ownerIds, queryStart) {
  const fields = [
    evt.fields.subject,
    evt.fields.activityDate,
    evt.fields.ownerId,
    'Owner.Name',
    'DurationInMinutes',
  ];
  return `SELECT ${fields.join(', ')} FROM ${evt.name} WHERE ${evt.fields.ownerId} != null AND CreatedDate >= ${queryStart}T00:00:00Z${ownerClause(evt.fields.ownerId, ownerIds)} ORDER BY CreatedDate ASC`;
}

/**
 * R4 — Appels (funnel SDR). TaskSubtype = 'Call'.
 */
export function callsQuery(ownerIds, queryStart) {
  const fields = [
    tsk.fields.subject,
    tsk.fields.activityDate,
    tsk.fields.ownerId,
    'Owner.Name',
    tsk.fields.subtype,
    tsk.fields.status,
    tsk.fields.result,
    tsk.fields.duration,
  ];
  return `SELECT ${fields.join(', ')} FROM ${tsk.name} WHERE ${tsk.fields.ownerId} != null AND CreatedDate >= ${queryStart}T00:00:00Z AND ${tsk.fields.subtype} = '${escapeSOQL(tsk.subtypeValue)}'${ownerClause(tsk.fields.ownerId, ownerIds)} ORDER BY CreatedDate ASC`;
}

/**
 * R5 — Comparatif N-1: won opps in prior period (by CloseDate).
 */
export function wonInPeriod(ownerIds, from, toExclusive) {
  const fields = [
    opp.fields.id,
    opp.fields.name,
    opp.fields.ownerId,
    opp.fields.amount,
    opp.fields.closeDate,
  ];
  return `SELECT ${fields.join(', ')} FROM ${opp.name} WHERE ${opp.fields.isWon} = true AND ${opp.fields.closeDate} >= ${from} AND ${opp.fields.closeDate} < ${toExclusive}${ownerClause(opp.fields.ownerId, ownerIds)}`;
}

/**
 * R6 — Opps created in prior period (for N-1 pipeline comparison).
 */
export function oppsCreatedInPeriod(ownerIds, from, toExclusive) {
  const fields = [
    opp.fields.id,
    opp.fields.ownerId,
    opp.fields.amount,
    opp.fields.createdDate,
  ];
  return `SELECT ${fields.join(', ')} FROM ${opp.name} WHERE ${opp.fields.createdDate} >= ${from}T00:00:00Z AND ${opp.fields.createdDate} < ${toExclusive}T00:00:00Z${ownerClause(opp.fields.ownerId, ownerIds)}`;
}
