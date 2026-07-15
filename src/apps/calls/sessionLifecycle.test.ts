import { describe, expect, it } from "vitest";
import { isStaleSession, shouldShowPreSession, sessionDayKey } from "./sessionLifecycle";

describe("session lifecycle", () => {
  it("shows pre-session only when the session has never been engaged", () => {
    expect(shouldShowPreSession({ status: "active", rdv_goal: null, engaged_at: null })).toBe(true);
    expect(shouldShowPreSession({ status: "active", rdv_goal: 4, engaged_at: null })).toBe(true);
    expect(shouldShowPreSession({ status: "active", rdv_goal: null, engaged_at: "2026-07-15T10:00:00Z" })).toBe(false);
    expect(shouldShowPreSession({ status: "active", rdv_goal: 4, engaged_at: "2026-07-15T10:00:00Z" })).toBe(false);
  });

  it("uses the scheduled day, or the Paris creation day, for rollover", () => {
    expect(sessionDayKey({ scheduled_for: "2026-07-14", created_at: "2026-07-15T23:30:00Z" })).toBe("2026-07-14");
    expect(sessionDayKey({ scheduled_for: null, created_at: "2026-07-15T23:30:00Z" }, "Europe/Paris")).toBe("2026-07-16");
    expect(isStaleSession({ status: "active", scheduled_for: "2026-07-15", created_at: "2026-07-15T10:00:00Z" }, "2026-07-16")).toBe(true);
    expect(isStaleSession({ status: "completed", scheduled_for: "2026-07-15", created_at: "2026-07-15T10:00:00Z" }, "2026-07-16")).toBe(false);
  });
});
