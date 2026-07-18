import { describe, expect, it } from "vitest";
import { computeIntenseStreak, computeProductifStreak, computeStreak } from "./comboStreaks";

describe("computeStreak", () => {
  it("counts today when today is logged", () => {
    const result = computeStreak(["2026-07-16", "2026-07-17", "2026-07-18"], "2026-07-18");
    expect(result.currentDays).toBe(3);
  });

  it("still counts the streak when yesterday was logged but today is not yet", () => {
    const result = computeStreak(["2026-07-16", "2026-07-17"], "2026-07-18");
    expect(result.currentDays).toBe(2);
  });

  it("breaks the streak when a day is missing", () => {
    const result = computeStreak(["2026-07-14", "2026-07-15", "2026-07-17", "2026-07-18"], "2026-07-18");
    expect(result.currentDays).toBe(2);
  });

  it("returns 0 when neither today nor yesterday is logged", () => {
    const result = computeStreak(["2026-07-10"], "2026-07-18");
    expect(result.currentDays).toBe(0);
  });

  it("returns 0 for an empty history", () => {
    const result = computeStreak([], "2026-07-18");
    expect(result.currentDays).toBe(0);
    expect(result.bestEver).toBe(0);
  });

  it("tracks bestEver independently of the current streak", () => {
    const result = computeStreak(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-17"], "2026-07-18");
    expect(result.bestEver).toBe(4);
    // 17 est hier, donc la streak courante est 1 — le test original demandait 0
    // ("today pas loggué"), mais la spec §2.4 dit explicitement "aujourd'hui compte,
    // hier compte" → si hier est loggué, streak courante = 1.
    expect(result.currentDays).toBe(1);
  });

  it("does not double count duplicate dates", () => {
    const result = computeStreak(["2026-07-18", "2026-07-18"], "2026-07-18");
    expect(result.currentDays).toBe(1);
  });

  it("does not except a missing weekend day — the commercial decides", () => {
    // Saturday 2026-07-18 not logged, Friday 2026-07-17 was: streak still alive off yesterday.
    const alive = computeStreak(["2026-07-17"], "2026-07-18");
    expect(alive.currentDays).toBe(1);
    // Two days missing in a row: broken regardless of weekend.
    const broken = computeStreak(["2026-07-16"], "2026-07-18");
    expect(broken.currentDays).toBe(0);
  });
});

describe("computeProductifStreak", () => {
  it("counts trailing sessions with at least 3 rdv", () => {
    expect(computeProductifStreak([3, 4, 5]).currentSessions).toBe(3);
  });

  it("stops counting at the first session below threshold, scanning from the end", () => {
    expect(computeProductifStreak([5, 1, 4, 3]).currentSessions).toBe(2);
  });

  it("returns 0 when the most recent session is below threshold", () => {
    expect(computeProductifStreak([5, 5, 2]).currentSessions).toBe(0);
  });

  it("returns 0 for no sessions", () => {
    expect(computeProductifStreak([]).currentSessions).toBe(0);
  });
});

describe("computeIntenseStreak", () => {
  it("counts trailing sessions at or above the threshold", () => {
    expect(computeIntenseStreak([20, 25, 30], 20).currentSessions).toBe(3);
  });

  it("breaks on the first session below threshold from the end", () => {
    expect(computeIntenseStreak([30, 10, 25, 20], 20).currentSessions).toBe(2);
  });

  it("defaults the threshold to 20", () => {
    expect(computeIntenseStreak([19, 20]).currentSessions).toBe(1);
  });
});
