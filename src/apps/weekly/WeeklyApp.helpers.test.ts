import { describe, expect, it } from "vitest";

import { aggregateMonthlyIndicative, type Quarter } from "./WeeklyApp.helpers";

function withRaw(raw: number): Quarter[] {
  return [
    {
      sf_user_id: "u1",
      quarter: "2026-Q1",
      signed_to_date: 0,
      weighted_open: 0,
      forecast: 0,
      custom_pipe: 0,
      target: null,
      monthly_indicative: [{ month: "2026-01", label: "Jan", weight: 1, raw, indicative: 0 }],
    },
  ];
}

function indicativeFor(raw: number): number {
  return aggregateMonthlyIndicative(withRaw(raw))[0].indicative;
}

describe("aggregateMonthlyIndicative rounding", () => {
  it("never deviates from raw by more than 10%", () => {
    for (const raw of [39900, 93000, 126000, 12000, 999999, 1, 250000, 4200000]) {
      const indicative = indicativeFor(raw);
      expect(Math.abs(indicative - raw) / raw).toBeLessThanOrEqual(0.1);
    }
  });

  it("never rounds below raw for values >= 100k", () => {
    for (const raw of [100000, 126000, 250000, 999999, 4200000]) {
      expect(indicativeFor(raw)).toBeGreaterThanOrEqual(raw);
    }
  });

  it("matches expected indicative values", () => {
    expect(indicativeFor(39900)).toBe(40000);
    expect(indicativeFor(93000)).toBeLessThanOrEqual(100000);
    expect(indicativeFor(93000)).toBeGreaterThanOrEqual(93000);
    expect(indicativeFor(126000)).toBe(130000);
    expect(indicativeFor(126000)).not.toBe(100000);
    expect(indicativeFor(12000)).toBe(12000);
    expect(indicativeFor(999999)).toBe(1000000);
  });

  it("handles near-zero and zero raw values", () => {
    expect(indicativeFor(1)).toBeLessThanOrEqual(1);
    expect(indicativeFor(1)).toBeGreaterThanOrEqual(0);
    expect(aggregateMonthlyIndicative(withRaw(0))[0].indicative).toBe(0);
  });
});
