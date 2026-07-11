import { createClient } from "@supabase/supabase-js";
import mapping from "../_crm/mapping.js";
import { buildLightningUrl } from "../_crm/salesforce.js";

export const SF_ID = /^[a-zA-Z0-9]{15,18}$/;
const ISO_START_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function jsonResponse(status, body, headers) { return new Response(JSON.stringify(body), { status, headers }); }

export function isValidScheduledFor(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year
    && check.getUTCMonth() + 1 === month
    && check.getUTCDate() === day
  );
}

export function todayParisDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
}

const PGRST_NOT_FOUND = "PGRST116";
let serviceClient = null;

export function isNotFoundError(error) {
  return error?.code === PGRST_NOT_FOUND;
}

export function isValidEventStart(start) {
  if (!start || typeof start !== "string" || start.trim() === "") return false;
  const trimmed = start.trim();
  if (!ISO_START_RE.test(trimmed)) return false;

  const parts = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!parts) return false;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = parts[6] ? Number(parts[6]) : 0;
  const zone = parts[7];

  if (hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== "Z") {
    const offsetParts = zone.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!offsetParts) return false;
    const offsetHour = Number(offsetParts[2]);
    const offsetMinute = Number(offsetParts[3]);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() + 1 !== month
    || calendarCheck.getUTCDate() !== day
  ) {
    return false;
  }

  const parsed = new Date(trimmed);
  return !Number.isNaN(parsed.getTime());
}

export function getFollowUpOutcomes(taskMapping = mapping) {
  const semantic = taskMapping.objects.task.resultSemantic;
  return [semantic.followUpNoAnswer, semantic.followUpVoicemail];
}

export function filterContactsForFollowUp(contacts, followUpOutcomes = getFollowUpOutcomes()) {
  return (Array.isArray(contacts) ? contacts : []).filter((contact) => {
    // Deux cas de follow-up :
    // 1) essayé sans succès (skipped / non-décroché / répondeur) — compteur déjà incrémenté
    // 2) pas essayé (pending) — reporté tel quel, sans incrément
    if (contact?.status === "skipped" || contact?.status === "pending") return true;
    return followUpOutcomes.includes(contact?.outcome);
  });
}

export const SESSION_TYPES = ["prospection", "suivi_opportunites", "suivi_clients", "relance"];

export function isValidSessionType(value) {
  return typeof value === "string" && SESSION_TYPES.includes(value);
}

const PIPE_DECROCHE = ["Appel décroché", "Appel argumenté", "RDV planifié"];
const PIPE_ARGUMENTE = ["Appel argumenté", "RDV planifié"];

/** KPIs hub à partir des lignes contact (status called/skipped + outcome + marked_npa). */
export function computeHubKpis(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const called = list.filter((row) => row?.status === "called");
  const calls = called.length;
  const decroche = called.filter((row) => PIPE_DECROCHE.includes(row?.outcome)).length;
  const argumente = called.filter((row) => PIPE_ARGUMENTE.includes(row?.outcome)).length;
  const rdv = called.filter((row) => row?.outcome === "RDV planifié").length;
  const npa = list.filter((row) => row?.marked_npa === true).length;
  const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return {
    calls,
    decroche,
    argumente,
    rdv,
    npa,
    rate_decroche: rate(decroche, calls),
    rate_argumente: rate(argumente, calls),
    rate_rdv_per_decroche: rate(rdv, decroche),
    rate_rdv_per_argumente: rate(rdv, argumente),
  };
}

export function getServiceClient() {
  if (serviceClient) return serviceClient;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  return serviceClient;
}

/** Test-only hook to isolate the module-scope service client. */
export function __resetServiceClient() {
  serviceClient = null;
}

export async function journalAction({ actorId, actionType, changes, targets, result }) {
  const supabase = getServiceClient();
  if (!supabase) {
    console.error("_journal: missing Supabase URL or service role key");
    return;
  }
  try {
    await supabase.from("action_journal").insert({
      actor: actorId,
      action_type: actionType,
      changes: changes || {},
      targets: targets || [],
      result: result || {},
    });
  } catch (err) {
    console.error("Failed to write to action_journal:", err);
  }
}

export function actorName(user, profile) {
  return profile?.fullName || user.user_metadata?.full_name || user.email || "Utilisateur Inconnu";
}

export async function assertSessionOwner(client, sessionId, userId) {
  const { data: session, error } = await client
    .from("call_sessions")
    .select("id, owner, name, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error && !isNotFoundError(error)) return { error: "session_lookup_failed", status: 500 };
  if (!session || session.owner !== userId) return { error: "not_found", status: 404 };
  return { session };
}

export async function assertSessionContact(client, sessionId, contactId) {
  const { data: contact, error } = await client
    .from("call_session_contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (error && !isNotFoundError(error)) return { error: "contact_lookup_failed", status: 500 };
  if (!contact || contact.session_id !== sessionId) return { error: "not_found", status: 404 };
  return { contact };
}

export async function insertSessionWithContacts(client, userId, name, contacts, scheduledFor, options = {}) {
  const sessionType = isValidSessionType(options.sessionType) ? options.sessionType : "prospection";
  const { data: session, error: sessionError } = await client
    .from("call_sessions")
    .insert({
      owner: userId,
      name: name.trim(),
      status: "active",
      scheduled_for: scheduledFor,
      session_type: sessionType,
    })
    .select("id, name, status, created_at, scheduled_for, session_type")
    .single();

  if (sessionError || !session) return { error: "session_creation_failed", status: 500 };

  const contactRows = contacts.map((contact, index) => ({
    session_id: session.id,
    position: index,
    sf_contact_id: contact.sf_contact_id,
    sf_account_id: contact.sf_account_id || null,
    contact_name: contact.contact_name.trim(),
    account_name: contact.account_name || null,
    phone: contact.mobile_phone || contact.phone || null,
    email: contact.email || null,
    title: contact.title || null,
    linkedin_url: contact.linkedin_url || null,
    status: "pending",
    attempt_count: Number.isInteger(contact.attempt_count) && contact.attempt_count >= 0
      ? contact.attempt_count
      : 0,
    marked_npa: false,
  }));

  const { data: insertedContacts, error: contactsError } = await client
    .from("call_session_contacts")
    .insert(contactRows)
    .select("id, position, sf_contact_id, sf_account_id, contact_name, account_name, phone, email, title, linkedin_url, status, outcome, comments, sf_task_id, sf_event_id, called_at, recall_at, attempt_count, marked_npa")
    .order("position", { ascending: true });

  if (contactsError || !insertedContacts?.length) {
    await client.from("call_sessions").delete().eq("id", session.id);
    return { error: "session_contacts_insert_failed", status: 500 };
  }

  return { session, contacts: enrichSessionContacts(insertedContacts) };
}

export function enrichSessionContacts(contacts) {
  return (contacts || []).map((contact) => ({
    ...contact,
    sf_contact_url: buildLightningUrl("Contact", contact.sf_contact_id),
    sf_account_url: contact.sf_account_id ? buildLightningUrl("Account", contact.sf_account_id) : null,
  }));
}

export function getParisDateRange() {
  const now = new Date();
  const parisNowStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const [datePart, timePart] = parisNowStr.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  const utcNow = Date.now();
  const parisNowDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = utcNow - parisNowDate.getTime();

  const todayStart = new Date(Date.UTC(year, month - 1, day) + offsetMs);
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const dow = todayStart.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayStart.getTime() - mondayOffset * 86400000);
  const monthStart = new Date(Date.UTC(year, month - 1, 1) + offsetMs);

  return { todayStart, tomorrowStart, weekStart, monthStart };
}
