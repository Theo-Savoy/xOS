import { describe, expect, it } from "vitest";
import {
  goalNotificationDedupeKey,
  newlyAddedSessionMemberIds,
  sessionShareNotification,
} from "./notificationHelpers.js";

describe("notification helpers", () => {
  it("builds a stable goal-hit dedupe key", () => {
    expect(goalNotificationDedupeKey(12, 3, "user-1")).toBe("goal:12:3:user-1");
  });

  it("returns only newly added recipients and excludes the sharer", () => {
    expect(newlyAddedSessionMemberIds(
      ["user-2", "user-3"],
      ["user-1", "user-2", "user-4", "user-4"],
      "user-1",
    )).toEqual(["user-4"]);
  });

  it("builds a session share notification with a calls deep-link", () => {
    expect(sessionShareNotification({
      sessionId: 12,
      sessionName: "Prospection Lyon",
      actorId: "user-1",
      actorLabel: "Ada",
    })).toEqual(expect.objectContaining({
      kind: "session_shared",
      body: "Ada a partagé la séance « Prospection Lyon » avec vous",
      payload: {
        session_id: 12,
        session_name: "Prospection Lyon",
        actor_id: "user-1",
        action: "open_session",
        app_id: "calls",
        params: { view: "runner", session_id: "12" },
      },
    }));
  });
});
