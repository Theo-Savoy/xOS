/** Salesforce CRM adapter. All organization-specific API names come from mapping. */
import defaultMapping from "./mapping.js";

export function escapeSOQL(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapedList(values) {
  return values.map((value) => `'${escapeSOQL(value)}'`).join(", ");
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function boundedLimit(value) {
  if (!Number.isInteger(value)) return 200;
  return Math.max(1, Math.min(value, 500));
}

function taskSubquery(mapping) {
  const task = mapping.objects.task;
  const fields = task.fields;
  return `(SELECT ${[fields.id, fields.activityDate, fields.result, fields.duration].join(", ")} FROM ${task.childRelationship} WHERE ${fields.subtype} = '${escapeSOQL(task.subtypeValue)}' ORDER BY ${fields.activityDate} DESC)`;
}

/**
 * Builds the Contact SOQL query. Some last-call predicates are completed by
 * filterTargetContacts because SOQL cannot compare a Task row to its latest sibling.
 */
export function buildTargetQuery(filters = {}, mapping = defaultMapping, sfUserId) {
  const account = mapping.objects.account;
  const contact = mapping.objects.contact;
  const task = mapping.objects.task;
  const opportunity = mapping.objects.opportunity;
  const enterprise = filters.entreprise || {};
  const contactFilters = filters.contact || {};
  const followUp = filters.relance || {};
  const conditions = [];

  const sectors = stringList(enterprise.secteurs);
  if (sectors.length) conditions.push(`Account.${account.fields.industry} IN (${escapedList(sectors)})`);
  const employeeBands = stringList(enterprise.effectifs);
  if (employeeBands.length) conditions.push(`Account.${account.fields.employeeCount} IN (${escapedList(employeeBands)})`);
  const customerTypes = stringList(enterprise.type_client);
  if (customerTypes.length) conditions.push(`Account.${account.fields.customerType} IN (${escapedList(customerTypes)})`);
  if (typeof enterprise.compte_principal === "string" && enterprise.compte_principal) {
    conditions.push(`Account.${account.fields.parentId} = '${escapeSOQL(enterprise.compte_principal)}'`);
  }

  const openOpportunities = `${contact.fields.accountId} IN (SELECT ${opportunity.fields.accountId} FROM ${opportunity.name} WHERE ${opportunity.fields.isClosed} = false)`;
  if (enterprise.opp_ouverte === true) conditions.push(openOpportunities);
  if (enterprise.opp_ouverte === false) conditions.push(`${contact.fields.accountId} NOT IN (SELECT ${opportunity.fields.accountId} FROM ${opportunity.name} WHERE ${opportunity.fields.isClosed} = false)`);
  if (enterprise.opp_perdue === true) {
    conditions.push(`${contact.fields.accountId} IN (SELECT ${opportunity.fields.accountId} FROM ${opportunity.name} WHERE ${opportunity.fields.stageName} = '${escapeSOQL(opportunity.closedLostStage)}')`);
    conditions.push(`${contact.fields.accountId} NOT IN (SELECT ${opportunity.fields.accountId} FROM ${opportunity.name} WHERE ${opportunity.fields.isClosed} = false)`);
  }

  if (contactFilters.a_telephone === true) conditions.push(`${contact.fields.phone} != null`);
  if (contactFilters.exclure_npa !== false) conditions.push(`${contact.fields.doNotCall} = false`);
  const decisionLevels = stringList(contactFilters.niveau_decision);
  if (decisionLevels.length) conditions.push(`${contact.fields.decisionLevel} IN (${escapedList(decisionLevels)})`);
  if (filters.ownerOnly === true && typeof sfUserId === "string" && sfUserId) {
    conditions.push(`Account.${account.fields.ownerId} = '${escapeSOQL(sfUserId)}'`);
  }

  const callBase = `${task.fields.subtype} = '${escapeSOQL(task.subtypeValue)}'`;
  if (followUp.jamais_appele === true) {
    conditions.push(`${contact.fields.id} NOT IN (SELECT ${task.fields.whoId} FROM ${task.name} WHERE ${callBase})`);
  }
  const beforeDays = positiveInteger(followUp.dernier_appel_avant_jours);
  if (beforeDays) {
    conditions.push(`${contact.fields.id} NOT IN (SELECT ${task.fields.whoId} FROM ${task.name} WHERE ${callBase} AND ${task.fields.activityDate} >= LAST_N_DAYS:${beforeDays})`);
  }
  const withinDays = positiveInteger(followUp.dernier_appel_dans_jours);
  if (withinDays) {
    conditions.push(`${contact.fields.id} IN (SELECT ${task.fields.whoId} FROM ${task.name} WHERE ${callBase} AND ${task.fields.activityDate} = LAST_N_DAYS:${withinDays})`);
  }

  const select = [
    contact.fields.id,
    contact.fields.name,
    contact.fields.phone,
    `${contact.fields.accountId}`,
    `Account.${account.fields.id}`,
    `Account.${account.fields.name}`,
    taskSubquery(mapping),
  ].join(", ");
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  return `SELECT ${select} FROM ${contact.name}${where} LIMIT ${boundedLimit(filters.limit)}`;
}

function dateAgeDays(dateValue, now) {
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : (now.getTime() - date.getTime()) / 86_400_000;
}

/** Apply predicates that depend on the latest Task record returned by SOQL. */
export function filterTargetContacts(records, filters = {}, mapping, now = new Date()) {
  const followUp = filters.relance || {};
  const fields = mapping.objects.task.fields;
  const excluded = followUp.exclure_si_plus_de || {};
  const maxCalls = positiveInteger(excluded.appels);
  const recentDays = positiveInteger(excluded.sur_jours);
  const wantedResults = Array.isArray(followUp.dernier_resultat)
    ? stringList(followUp.dernier_resultat)
    : mapping.objects.task.results.slice(0, 2);
  const minDuration = Number.isFinite(followUp.duree_min_sec) ? followUp.duree_min_sec : null;
  const maxDuration = Number.isFinite(followUp.duree_max_sec) ? followUp.duree_max_sec : null;

  return (Array.isArray(records) ? records : []).filter((record) => {
    const calls = Array.isArray(record?.[mapping.objects.task.childRelationship]?.records)
      ? record[mapping.objects.task.childRelationship].records
      : [];
    const latest = calls[0];
    if (wantedResults.length && (!latest || !wantedResults.includes(latest[fields.result]))) return false;
    const duration = latest?.[fields.duration];
    if (minDuration !== null && (!Number.isFinite(duration) || duration < minDuration)) return false;
    if (maxDuration !== null && (!Number.isFinite(duration) || duration > maxDuration)) return false;
    if (maxCalls && recentDays) {
      const recentCalls = calls.filter((call) => {
        const age = dateAgeDays(call[fields.activityDate], now);
        return age !== null && age >= 0 && age <= recentDays;
      });
      if (recentCalls.length > maxCalls) return false;
    }
    return true;
  });
}

export async function fetchSFToken() {
  const clientId = process.env.SF_CLIENT_ID || "";
  const clientSecret = process.env.SF_CLIENT_SECRET || "";
  const refreshToken = process.env.SF_REFRESH_TOKEN || "";
  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
  if (!clientId || !clientSecret || !refreshToken) return { error: "sf_missing_credentials" };
  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return { error: "sf_auth_error" };
  return { accessToken: (await response.json()).access_token };
}

function instanceUrl() {
  return process.env.SF_INSTANCE_URL || "https://db0000000d7rdeay.my.salesforce.com";
}

export async function searchContacts(token, soql) {
  const response = await fetch(`${instanceUrl()}/services/data/v67.0/query?${new URLSearchParams({ q: soql })}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return { error: "sf_query_error" };
  return { records: (await response.json()).records || [] };
}

async function createSObject(token, objectName, fields) {
  const response = await fetch(`${instanceUrl()}/services/data/v67.0/sobjects/${objectName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return { error: "sf_write_error", message: (await response.text()).slice(0, 500) };
  return { record: await response.json() };
}

export async function logCall(token, { contactId, accountId, resultat, comments = "", durationSec = 0, ownerId, actorName = "Utilisateur Inconnu" }, mapping = defaultMapping) {
  const task = mapping.objects.task;
  const fields = task.fields;
  const call = {
    [fields.subtype]: task.subtypeValue,
    [fields.result]: resultat,
    [fields.duration]: durationSec,
    [fields.whoId]: contactId,
    [fields.status]: task.statusValue,
    [fields.subject]: `Appel — ${resultat}`,
    [fields.description]: `${comments}\n\n[via X OS par ${actorName}]`,
  };
  if (accountId) call[fields.whatId] = accountId;
  if (ownerId) call[fields.ownerId] = ownerId;
  return createSObject(token, task.name, call);
}

export async function createEvent(token, { subject, startDateTime, durationMin, whoId, whatId, ownerId, invitees = [] }, mapping = defaultMapping) {
  const event = mapping.objects.event;
  const fields = event.fields;
  const start = new Date(startDateTime);
  const duration = Number(durationMin);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(duration) || duration <= 0) return { error: "invalid_event" };
  const payload = {
    [fields.subject]: subject,
    [fields.startDateTime]: start.toISOString(),
    [fields.endDateTime]: new Date(start.getTime() + duration * 60_000).toISOString(),
  };
  if (whoId) payload[fields.whoId] = whoId;
  if (whatId) payload[fields.whatId] = whatId;
  if (ownerId) payload[fields.ownerId] = ownerId;
  const created = await createSObject(token, event.name, payload);
  if (created.error || !Array.isArray(invitees)) return created;
  for (const invitee of invitees.filter((id) => typeof id === "string" && id)) {
    const relation = await createSObject(token, event.relationName, {
      [fields.eventId]: created.record.id,
      [fields.relationId]: invitee,
    });
    if (relation.error) return { ...created, inviteeError: relation.error };
  }
  return created;
}
