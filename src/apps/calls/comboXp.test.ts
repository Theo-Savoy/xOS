// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEvent, currentPalier, detectPaliers, loadXp, progressToNext, saveXp } from "./comboXp";
import type { ComboXp } from "./comboXp";

function installLocalStorage() {
  const store: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    },
  });
}

const USER = "u1";

describe("comboXp", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    window.localStorage?.clear();
  });

  it("defaults to empty xp when nothing stored", () => {
    expect(loadXp(USER)).toEqual({ vitesse: 0, impact: 0, regularite: 0, badges: [], lastSeen: "" });
  });

  it("persists xp via saveXp/loadXp", () => {
    const xp: ComboXp = { vitesse: 5, impact: 2, regularite: 1, badges: ["premier_pas"], lastSeen: "2026-07-18T00:00:00.000Z" };
    saveXp(USER, xp);
    expect(loadXp(USER)).toEqual(xp);
  });

  it("applyEvent shortcut increments vitesse only", () => {
    const result = applyEvent(USER, "shortcut");
    expect(result.previousXp.vitesse).toBe(0);
    expect(result.xp.vitesse).toBe(1);
    expect(result.xp.impact).toBe(0);
    expect(result.xp.regularite).toBe(0);
  });

  it("applyEvent rdv increments impact only", () => {
    const result = applyEvent(USER, "rdv");
    expect(result.xp.impact).toBe(1);
    expect(result.xp.vitesse).toBe(0);
  });

  it("applyEvent day-logged increments regularite only", () => {
    const result = applyEvent(USER, "day-logged");
    expect(result.xp.regularite).toBe(1);
    expect(result.xp.impact).toBe(0);
  });

  it("applyEvent accepts a qty greater than 1", () => {
    const result = applyEvent(USER, "rdv", 3);
    expect(result.xp.impact).toBe(3);
  });

  it("applyEvent persists across calls", () => {
    applyEvent(USER, "shortcut");
    const second = applyEvent(USER, "shortcut");
    expect(second.previousXp.vitesse).toBe(1);
    expect(second.xp.vitesse).toBe(2);
  });

  it("currentPalier returns null below bronze", () => {
    expect(currentPalier("vitesse", 5)).toBeNull();
  });

  it("currentPalier returns the highest palier reached", () => {
    expect(currentPalier("vitesse", 10)).toBe("bronze");
    expect(currentPalier("vitesse", 29)).toBe("bronze");
    expect(currentPalier("vitesse", 30)).toBe("argent");
    expect(currentPalier("vitesse", 500)).toBe("challenger");
    expect(currentPalier("vitesse", 9999)).toBe("challenger");
  });

  it("currentPalier uses per-axis thresholds", () => {
    expect(currentPalier("impact", 3)).toBe("bronze");
    expect(currentPalier("regularite", 14)).toBe("or");
  });

  it("detectPaliers finds a single palier crossed", () => {
    const previousXp: ComboXp = { vitesse: 9, impact: 0, regularite: 0, badges: [], lastSeen: "" };
    const newXp: ComboXp = { ...previousXp, vitesse: 10 };
    expect(detectPaliers(previousXp, newXp)).toEqual([{ axis: "vitesse", palier: "bronze" }]);
  });

  it("detectPaliers finds a double palier crossed at once", () => {
    const previousXp: ComboXp = { vitesse: 9, impact: 0, regularite: 0, badges: [], lastSeen: "" };
    const newXp: ComboXp = { ...previousXp, vitesse: 30 };
    expect(detectPaliers(previousXp, newXp)).toEqual([
      { axis: "vitesse", palier: "bronze" },
      { axis: "vitesse", palier: "argent" },
    ]);
  });

  it("detectPaliers finds crossings across multiple axes", () => {
    const previousXp: ComboXp = { vitesse: 9, impact: 2, regularite: 0, badges: [], lastSeen: "" };
    const newXp: ComboXp = { vitesse: 10, impact: 3, regularite: 0, badges: [], lastSeen: "" };
    expect(detectPaliers(previousXp, newXp)).toEqual([
      { axis: "vitesse", palier: "bronze" },
      { axis: "impact", palier: "bronze" },
    ]);
  });

  it("detectPaliers returns nothing when no threshold is crossed", () => {
    const previousXp: ComboXp = { vitesse: 15, impact: 0, regularite: 0, badges: [], lastSeen: "" };
    const newXp: ComboXp = { ...previousXp, vitesse: 20 };
    expect(detectPaliers(previousXp, newXp)).toEqual([]);
  });

  it("applyEvent reports paliersFranchis when a threshold is crossed", () => {
    saveXp(USER, { vitesse: 9, impact: 0, regularite: 0, badges: [], lastSeen: "" });
    const result = applyEvent(USER, "shortcut");
    expect(result.paliersFranchis).toEqual([{ axis: "vitesse", palier: "bronze" }]);
  });

  it("progressToNext before any palier", () => {
    const progress = progressToNext("vitesse", 5);
    expect(progress.current).toBeNull();
    expect(progress.next).toBe("bronze");
    expect(progress.valueToNext).toBe(5);
    expect(progress.pctToNext).toBeCloseTo(50);
  });

  it("progressToNext between two paliers", () => {
    const progress = progressToNext("vitesse", 20);
    expect(progress.current).toBe("bronze");
    expect(progress.next).toBe("argent");
    expect(progress.valueToNext).toBe(10);
  });

  it("progressToNext at the max palier", () => {
    const progress = progressToNext("vitesse", 700);
    expect(progress.current).toBe("challenger");
    expect(progress.next).toBeNull();
    expect(progress.pctToNext).toBe(100);
    expect(progress.valueToNext).toBe(0);
  });
});
