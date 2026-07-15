export function goalNotificationDedupeKey(sessionId, goal, actorId) {
  return `goal:${sessionId}:${goal}:${actorId}`;
}

export function newlyAddedSessionMemberIds(existingIds, requestedIds, sharerId) {
  const existing = new Set(Array.isArray(existingIds) ? existingIds : []);
  const seen = new Set();
  return (Array.isArray(requestedIds) ? requestedIds : []).filter((id) => {
    if (!id || id === sharerId || existing.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function sessionShareNotification({ sessionId, sessionName, actorId, actorLabel }) {
  return {
    kind: "session_shared",
    title: "Nouvelle séance partagée",
    body: `${actorLabel} a partagé la séance « ${sessionName} » avec vous`,
    payload: {
      session_id: sessionId,
      session_name: sessionName,
      actor_id: actorId,
      action: "open_session",
      app_id: "calls",
      params: { view: "runner", session_id: String(sessionId) },
    },
  };
}
