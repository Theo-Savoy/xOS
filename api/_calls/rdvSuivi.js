import {
  escapedList,
  fetchSFToken,
  searchContacts,
  updateSObjects,
} from "../_crm/salesforce.js";
import { getProfile } from "./profileCache.js";
import { journalAction } from "./http.js";

const VALID_STATUSES = ["a_venir", "effectue", "annule", "no_show"];

const STATUS_TO_SF = {
  effectue: "Effectué",
  annule: "Annulé",
  no_show: "No-show",
};

/**
 * list_rdvs — query SF Events for the user (or team) + enrich with local followups.
 * Params: { range_start?: string (ISO), range_end?: string (ISO), team_sf_user_ids?: string[] }
 */
async function handleListRdvs({ body, user, client, headers }) {
  const profileResult = await getProfile(client, user.id);
  if (profileResult.error) {
    return new Response(JSON.stringify({ error: profileResult.error }), { status: 500, headers });
  }

  const tokenResult = await fetchSFToken({ client, userId: user.id });
  if (tokenResult.error) {
    return new Response(JSON.stringify({ error: tokenResult.error }), { status: 502, headers });
  }

  // Determine owner filter: team (manager) or self (commercial)
  const teamSfUserIds = Array.isArray(body.team_sf_user_ids) && body.team_sf_user_ids.length > 0
    ? body.team_sf_user_ids.filter((id) => typeof id === "string" && id)
    : null;

  const ownerIds = teamSfUserIds ?? (profileResult.sfUserId ? [profileResult.sfUserId] : []);
  if (ownerIds.length === 0) {
    return new Response(JSON.stringify({ rdvs: [], pending_count: 0 }), { status: 200, headers });
  }

  // Date range: default = -7 days to +30 days
  const now = new Date();
  const rangeStart = body.range_start || new Date(now.getTime() - 7 * 86400_000).toISOString();
  const rangeEnd = body.range_end || new Date(now.getTime() + 30 * 86400_000).toISOString();

  const ownerClause = escapedList(ownerIds);
  const soql = [
    "SELECT Id, Subject, StartDateTime, EndDateTime, Description,",
    "WhoId, Who.Name, WhatId, What.Name, OwnerId, Owner.Name",
    "FROM Event",
    `WHERE OwnerId IN (${ownerClause})`,
    `AND StartDateTime >= ${rangeStart.replace(/'/g, "\\'")}`,
    `AND StartDateTime <= ${rangeEnd.replace(/'/g, "\\'")}`,
    "ORDER BY StartDateTime ASC",
    "LIMIT 200",
  ].join(" ");

  const sfResult = await searchContacts(tokenResult.accessToken, soql);
  if (sfResult.error) {
    return new Response(
      JSON.stringify({ error: sfResult.error, message: sfResult.message }),
      { status: 502, headers },
    );
  }

  const events = (sfResult.records || []).map((rec) => ({
    sf_event_id: rec.Id,
    subject: rec.Subject,
    start: rec.StartDateTime,
    end: rec.EndDateTime,
    description: rec.Description || null,
    contact_name: rec.Who?.Name || null,
    contact_id: rec.WhoId || null,
    account_name: rec.What?.Name || null,
    account_id: rec.WhatId || null,
    owner_name: rec.Owner?.Name || null,
    owner_id: rec.OwnerId || null,
  }));

  // Enrich with local followups
  const eventIds = events.map((e) => e.sf_event_id);
  let followupMap = new Map();
  if (eventIds.length > 0) {
    const { data: followups } = await client
      .from("rdv_followups")
      .select("sf_event_id, status, notes, reported_by, reported_at")
      .in("sf_event_id", eventIds);
    for (const f of followups || []) {
      followupMap.set(f.sf_event_id, f);
    }
  }

  // Enrich with Combo origin (call_session_contacts.sf_event_id)
  let comboOriginSet = new Set();
  if (eventIds.length > 0) {
    const { data: comboRows } = await client
      .from("call_session_contacts")
      .select("sf_event_id, session_id")
      .in("sf_event_id", eventIds);
    for (const row of comboRows || []) {
      comboOriginSet.add(row.sf_event_id);
    }
  }

  const rdvs = events.map((event) => {
    const followup = followupMap.get(event.sf_event_id);
    return {
      ...event,
      status: followup?.status || "a_venir",
      notes: followup?.notes || null,
      reported_by: followup?.reported_by || null,
      reported_at: followup?.reported_at || null,
      via_combo: comboOriginSet.has(event.sf_event_id),
    };
  });

  // Count pending: past events without a followup status
  const nowIso = now.toISOString();
  const pendingCount = rdvs.filter(
    (r) => r.start < nowIso && r.status === "a_venir",
  ).length;

  return new Response(JSON.stringify({ rdvs, pending_count: pendingCount }), { status: 200, headers });
}

/**
 * report_rdv — upsert local followup + write-back to SF Event.
 * Params: { sf_event_id, status, notes?, new_start?, duration_min? }
 */
async function handleReportRdv({ body, user, client, headers }) {
  const { sf_event_id, status, notes, new_start, duration_min } = body;

  if (typeof sf_event_id !== "string" || !sf_event_id) {
    return new Response(JSON.stringify({ error: "invalid_sf_event_id" }), { status: 400, headers });
  }
  if (!VALID_STATUSES.includes(status)) {
    return new Response(JSON.stringify({ error: "invalid_status" }), { status: 400, headers });
  }

  // Upsert local followup
  const { error: upsertError } = await client
    .from("rdv_followups")
    .upsert(
      {
        sf_event_id,
        status,
        notes: notes || null,
        reported_by: user.id,
        reported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sf_event_id" },
    );

  if (upsertError) {
    return new Response(
      JSON.stringify({ error: "followup_save_failed", message: upsertError.message }),
      { status: 500, headers },
    );
  }

  // Write-back to SF: RDV_Status__c + Description
  const tokenResult = await fetchSFToken({ client, userId: user.id });
  if (tokenResult.error) {
    // Local save succeeded, SF write failed — return partial success
    return new Response(
      JSON.stringify({ ok: true, sf_sync_failed: true, sf_error: tokenResult.error }),
      { status: 200, headers },
    );
  }

  const sfFields = { Id: sf_event_id };

  // Status write-back (only for non-default statuses)
  if (status !== "a_venir" && STATUS_TO_SF[status]) {
    sfFields.RDV_Status__c = STATUS_TO_SF[status];
  }

  // Notes → Description
  if (notes != null) {
    sfFields.Description = notes;
  }

  // Reschedule: new_start + duration_min → StartDateTime / EndDateTime
  if (new_start && typeof new_start === "string") {
    const start = new Date(new_start);
    if (!Number.isNaN(start.getTime())) {
      const duration = Number.isFinite(Number(duration_min)) && Number(duration_min) > 0
        ? Number(duration_min)
        : 60;
      sfFields.StartDateTime = start.toISOString();
      sfFields.EndDateTime = new Date(start.getTime() + duration * 60_000).toISOString();
    }
  }

  // Only write to SF if there's something beyond Id
  if (Object.keys(sfFields).length > 1) {
    const sfResult = await updateSObjects(tokenResult.accessToken, "Event", [sfFields]);
    if (sfResult.error) {
      return new Response(
        JSON.stringify({ ok: true, sf_sync_failed: true, sf_error: sfResult.error, message: sfResult.message }),
        { status: 200, headers },
      );
    }
  }

  // Journal
  void journalAction({
    actorId: user.id,
    actionType: "rdv_followup_report",
    changes: { sf_event_id, status, has_notes: Boolean(notes), rescheduled: Boolean(new_start) },
    targets: [{ id: sf_event_id, type: "Event" }],
    result: { success: true },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function handleRdvSuivi({ action, body, user, client, headers }) {
  if (action === "list_rdvs") return handleListRdvs({ body, user, client, headers });
  if (action === "report_rdv") return handleReportRdv({ body, user, client, headers });
  return null;
}
