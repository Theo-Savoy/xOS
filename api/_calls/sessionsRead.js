import { hydrateSessionContactsFromCrm } from "./hydrateContacts.js";
import { listPresets } from "./presets.js";
import mapping from "../_crm/mapping.js";
import { fetchContactContext, fetchSFToken } from "../_crm/salesforce.js";
import {
  assertSessionAccess,
  computeHubKpis,
  enrichSessionContacts,
  getParisDateRange,
  isClaimActive,
  isNotFoundError,
  listAccessibleSessionIds,
} from "./http.js";
import { handleProspectionCockpit } from "./prospectionCockpit.js";

async function loadMembersBySessionIds(client, sessionIds) {
  if (!sessionIds.length) return new Map();
  const { data: rows } = await client
    .from("call_session_members")
    .select("session_id, user_id")
    .in("session_id", sessionIds);
  const bySession = new Map();
  const userIds = new Set();
  for (const row of rows || []) {
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id).push(row.user_id);
    userIds.add(row.user_id);
  }
  const labels = new Map();
  if (userIds.size > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("id, full_name, email, sf_user_id")
      .in("id", [...userIds]);
    for (const profile of profiles || []) {
      labels.set(profile.id, {
        user_id: profile.id,
        label: profile.full_name || profile.email || profile.id,
        sf_user_id: profile.sf_user_id || null,
      });
    }
  }
  const result = new Map();
  for (const [sessionId, ids] of bySession) {
    result.set(
      sessionId,
      ids.map((id) => labels.get(id) || { user_id: id, label: id, sf_user_id: null }),
    );
  }
  return result;
}

export async function handleSessionsRead({ url, user, client, headers }) {
  const sessionIdParam = url.searchParams.get("session_id");
  const statsParam = url.searchParams.get("stats");
  const resource = url.searchParams.get("resource");

  if (resource === "prospection_cockpit") {
    return handleProspectionCockpit({ url, user, client, headers });
  }

  if (resource === "presets") {
    const result = await listPresets(client, user.id);
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ presets: result.presets }), { status: 200, headers });
  }

  if (resource === "team") {
    // Union profiles (déjà connectés) + sf_user_map (commerciaux connus même sans login).
    const [profilesResult, mapResult] = await Promise.all([
      client.from("profiles").select("id, full_name, email, sf_user_id").not("sf_user_id", "is", null),
      client.from("sf_user_map").select("email, sf_user_id"),
    ]);
    if (profilesResult.error) {
      return new Response(JSON.stringify({ error: "team_lookup_failed" }), { status: 500, headers });
    }
    const bySfId = new Map();
    for (const profile of profilesResult.data || []) {
      if (!profile.sf_user_id) continue;
      bySfId.set(profile.sf_user_id, {
        user_id: profile.id,
        label: profile.full_name || profile.email || profile.sf_user_id,
        sf_user_id: profile.sf_user_id,
      });
    }
    // Map entries enrichissent la liste (Paul / Christophe même s'ils n'ont pas encore de profil).
    if (!mapResult.error) {
      for (const row of mapResult.data || []) {
        if (!row.sf_user_id || bySfId.has(row.sf_user_id)) continue;
        const local = String(row.email || "").split("@")[0] || row.sf_user_id;
        const label = local
          .split(/[._-]+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ") || row.sf_user_id;
        bySfId.set(row.sf_user_id, {
          user_id: `map:${row.email || row.sf_user_id}`,
          label,
          sf_user_id: row.sf_user_id,
        });
      }
    }
    const team = [...bySfId.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return new Response(JSON.stringify({ team }), { status: 200, headers });
  }

  if (resource === "recalls") {
    const accessible = await listAccessibleSessionIds(client, user.id);
    if (accessible.error) {
      return new Response(JSON.stringify({ error: accessible.error }), { status: 500, headers });
    }
    if (!accessible.ids.length) {
      return new Response(JSON.stringify({ recalls: [] }), { status: 200, headers });
    }
    const { data: ownedSessions, error: sessionsError } = await client
      .from("call_sessions")
      .select("id, name, status, scheduled_for")
      .in("id", accessible.ids);
    if (sessionsError) {
      return new Response(JSON.stringify({ error: "sessions_lookup_failed" }), { status: 500, headers });
    }
    const sessions = ownedSessions || [];
    if (!sessions.length) {
      return new Response(JSON.stringify({ recalls: [] }), { status: 200, headers });
    }
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const { data: rows, error: recallsError } = await client
      .from("call_session_contacts")
      .select("id, session_id, sf_contact_id, sf_account_id, contact_name, account_name, phone, email, title, linkedin_url, recall_at, outcome, attempt_count, status")
      .in("session_id", sessions.map((session) => session.id))
      .not("recall_at", "is", null)
      .order("recall_at", { ascending: true });
    if (recallsError) {
      return new Response(JSON.stringify({ error: "recalls_lookup_failed" }), { status: 500, headers });
    }
    const recalls = (rows || [])
      .filter((row) => row.status === "called" && row.recall_at)
      .map((row) => {
        const session = sessionById.get(row.session_id);
        return {
          id: row.id,
          session_id: row.session_id,
          session_name: session?.name ?? "Séance",
          session_status: session?.status ?? "active",
          sf_contact_id: row.sf_contact_id,
          sf_account_id: row.sf_account_id,
          contact_name: row.contact_name,
          account_name: row.account_name,
          phone: row.phone,
          email: row.email,
          title: row.title,
          linkedin_url: row.linkedin_url,
          recall_at: row.recall_at,
          outcome: row.outcome,
          attempt_count: row.attempt_count,
        };
      });
    return new Response(JSON.stringify({ recalls }), { status: 200, headers });
  }

  if (statsParam === "1") {
    const accessible = await listAccessibleSessionIds(client, user.id);
    if (accessible.error) {
      return new Response(JSON.stringify({ error: accessible.error }), { status: 500, headers });
    }
    const { data: userSessions, error: sessionsError } = accessible.ids.length
      ? await client.from("call_sessions").select("id, status").in("id", accessible.ids)
      : { data: [], error: null };

    if (sessionsError) {
      return new Response(JSON.stringify({ error: "sessions_lookup_failed" }), { status: 500, headers });
    }

    const sessionIds = (userSessions || []).map((session) => session.id);
    const { data: ownedOnly } = await client
      .from("call_sessions")
      .select("id, status")
      .eq("owner", user.id);
    const ownedIds = new Set((ownedOnly || []).map((row) => row.id));
    let sessionsActive = 0;
    let sessionsCompleted = 0;
    for (const session of ownedOnly || []) {
      if (session.status === "active") sessionsActive++;
      else if (session.status === "completed") sessionsCompleted++;
    }

    let callsToday = 0;
    let callsWeek = 0;
    let weekRows = [];
    let monthRows = [];

    if (sessionIds.length > 0) {
      const { data: calls, error: callsError } = await client
        .from("call_session_contacts")
        .select("status, outcome, called_at, marked_npa, logged_by, session_id")
        .in("session_id", sessionIds)
        .eq("status", "called")
        .not("called_at", "is", null);

      if (callsError) {
        return new Response(JSON.stringify({ error: "calls_lookup_failed" }), { status: 500, headers });
      }

      const { todayStart, weekStart, monthStart } = getParisDateRange();
      for (const call of calls || []) {
        const creditedToMe =
          call.logged_by === user.id
          || (!call.logged_by && ownedIds.has(call.session_id));
        if (!creditedToMe) continue;
        const called = new Date(call.called_at);
        if (called >= todayStart) callsToday++;
        if (called >= weekStart) {
          callsWeek++;
          weekRows.push(call);
        }
        if (called >= monthStart) monthRows.push(call);
      }
    }

    const week = computeHubKpis(weekRows);
    const month = computeHubKpis(monthRows);

    return new Response(
      JSON.stringify({
        stats: {
          calls_today: callsToday,
          calls_week: callsWeek,
          sessions_active: sessionsActive,
          sessions_completed: sessionsCompleted,
          week,
          month,
        },
      }),
      { status: 200, headers },
    );
  }

  if (sessionIdParam) {
    const sessionId = parseInt(sessionIdParam, 10);
    if (isNaN(sessionId) || sessionId < 1) {
      return new Response(JSON.stringify({ error: "invalid_session_id" }), { status: 400, headers });
    }

    const [
      { data: session, error: sessionError },
      { data: contactsRaw, error: contactsError },
    ] = await Promise.all([
      client
        .from("call_sessions")
        .select("id, owner, name, status, created_at, scheduled_for, session_type")
        .eq("id", sessionId)
        .maybeSingle(),
      client
        .from("call_session_contacts")
        .select("id, position, sf_contact_id, sf_account_id, contact_name, account_name, phone, email, title, linkedin_url, status, outcome, comments, sf_task_id, sf_event_id, called_at, recall_at, attempt_count, marked_npa, logged_by, claimed_by, claimed_at")
        .eq("session_id", sessionId)
        .order("position", { ascending: true }),
    ]);

    if (sessionError && !isNotFoundError(sessionError)) {
      return new Response(JSON.stringify({ error: "session_lookup_failed" }), { status: 500, headers });
    }
    if (!session) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
    }
    const access = await assertSessionAccess(client, sessionId, user.id);
    if (access.error) {
      return new Response(JSON.stringify({ error: access.error }), { status: access.status, headers });
    }

    if (contactsError) {
      return new Response(JSON.stringify({ error: "contacts_lookup_failed" }), { status: 500, headers });
    }

    let contacts = contactsRaw || [];
    if (contacts.some((contact) => !contact.email || !contact.title)) {
      const tokenResult = await fetchSFToken();
      if (!tokenResult.error) {
        contacts = await hydrateSessionContactsFromCrm(client, contacts, tokenResult.accessToken, mapping);
      }
    }

    const membersBySession = await loadMembersBySessionIds(client, [sessionId]);
    const members = membersBySession.get(sessionId) || [];
    const claimLabels = new Map();
    const claimerIds = [...new Set(contacts.map((c) => c.claimed_by).filter(Boolean))];
    if (claimerIds.length) {
      const { data: claimers } = await client
        .from("profiles")
        .select("id, full_name, email")
        .in("id", claimerIds);
      for (const profile of claimers || []) {
        claimLabels.set(profile.id, profile.full_name || profile.email || profile.id);
      }
    }

    const enriched = enrichSessionContacts(contacts).map((contact) => {
      const claimActive =
        contact.status === "pending"
        && contact.claimed_by
        && isClaimActive(contact.claimed_at);
      return {
        ...contact,
        claim_active: Boolean(claimActive),
        claimed_by_label:
          claimActive && contact.claimed_by !== user.id
            ? claimLabels.get(contact.claimed_by) || "Collègue"
            : null,
      };
    });

    const { owner, ...sessionData } = session;
    const contextContactId = url.searchParams.get("context_contact_id");
    let context = null;
    if (contextContactId) {
      const row = (contacts || []).find((c) => String(c.id) === String(contextContactId));
      if (!row) {
        return new Response(JSON.stringify({ error: "contact_not_in_session" }), { status: 404, headers });
      }
      const tokenResult = await fetchSFToken();
      if (tokenResult.error) {
        return new Response(JSON.stringify({ error: tokenResult.error }), { status: 502, headers });
      }
      const ctx = await fetchContactContext(
        tokenResult.accessToken,
        { contactId: row.sf_contact_id, accountId: row.sf_account_id },
        mapping,
      );
      if (ctx.error) {
        return new Response(JSON.stringify({ error: ctx.error }), { status: 502, headers });
      }
      context = ctx;
    }

    return new Response(
      JSON.stringify({
        session: {
          ...sessionData,
          is_owner: access.isOwner,
          owner_id: owner,
          members,
        },
        contacts: enriched,
        ...(context ? { context } : {}),
      }),
      { status: 200, headers },
    );
  }

  const accessibleList = await listAccessibleSessionIds(client, user.id);
  if (accessibleList.error) {
    return new Response(JSON.stringify({ error: accessibleList.error }), { status: 500, headers });
  }
  if (!accessibleList.ids.length) {
    return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers });
  }

  const { data: sessions, error: sessionsError } = await client
    .from("call_sessions")
    .select("id, owner, name, status, created_at, scheduled_for, session_type")
    .in("id", accessibleList.ids)
    .order("created_at", { ascending: false });

  if (sessionsError) {
    return new Response(JSON.stringify({ error: "sessions_lookup_failed" }), { status: 500, headers });
  }

  if (!sessions || sessions.length === 0) {
    return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers });
  }

  const allSessionIds = sessions.map((session) => session.id);
  const membersBySession = await loadMembersBySessionIds(client, allSessionIds);
  const { data: allContacts, error: contactsError } = await client
    .from("call_session_contacts")
    .select("session_id, status")
    .in("session_id", allSessionIds);

  if (contactsError) {
    return new Response(JSON.stringify({ error: "contacts_lookup_failed" }), { status: 500, headers });
  }

  const grouped = {};
  for (const contact of allContacts || []) {
    if (!grouped[contact.session_id]) {
      grouped[contact.session_id] = { total: 0, called: 0, skipped: 0, pending: 0 };
    }
    grouped[contact.session_id].total++;
    if (contact.status === "called") grouped[contact.session_id].called++;
    else if (contact.status === "skipped") grouped[contact.session_id].skipped++;
    else grouped[contact.session_id].pending++;
  }

  const result = sessions.map((session) => {
    const counts = grouped[session.id] || { total: 0, called: 0, skipped: 0, pending: 0 };
    const members = membersBySession.get(session.id) || [];
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      created_at: session.created_at,
      scheduled_for: session.scheduled_for ?? null,
      session_type: session.session_type ?? "prospection",
      is_owner: session.owner === user.id,
      shared: members.length > 0,
      member_count: members.length,
      members,
      ...counts,
    };
  });

  return new Response(JSON.stringify({ sessions: result }), { status: 200, headers });
}
