// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  comboStreaksStorageKey,
  comboXpStorageKey,
  summarizeComboBadges,
  summarizeComboStreaks,
  summarizeComboXp,
} from "./useComboXp";

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

describe("useComboXp model", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    window.localStorage?.clear();
  });

  it("defaults to zeroed axes and no badge when storage is empty", () => {
    const summary = summarizeComboXp("user-1");
    expect(summary.axes).toEqual([
      { id: "vitesse", label: "Vitesse", count: 0, palier: null },
      { id: "impact", label: "Impact", count: 0, palier: null },
      { id: "regularite", label: "Régularité", count: 0, palier: null },
    ]);
    expect(summary.lastBadge).toBeNull();
  });

  it("computes the current palier per axis from cumulative counts", () => {
    window.localStorage.setItem(
      comboXpStorageKey("user-1"),
      JSON.stringify({ vitesse: 30, impact: 7, regularite: 14, badges: [], lastSeen: "" }),
    );
    const summary = summarizeComboXp("user-1");
    expect(summary.axes.find((a) => a.id === "vitesse")).toMatchObject({ count: 30, palier: "Argent" });
    expect(summary.axes.find((a) => a.id === "impact")).toMatchObject({ count: 7, palier: "Argent" });
    expect(summary.axes.find((a) => a.id === "regularite")).toMatchObject({ count: 14, palier: "Or" });
  });

  it("surfaces the most recently unlocked badge", () => {
    window.localStorage.setItem(
      comboXpStorageKey("user-1"),
      JSON.stringify({ vitesse: 1, impact: 0, regularite: 1, badges: ["premier_pas", "eclair"], lastSeen: "" }),
    );
    expect(summarizeComboXp("user-1").lastBadge).toEqual({ id: "eclair", label: "⚡ Éclair" });
  });

  it("lists unlocked badges most-recent-first", () => {
    window.localStorage.setItem(
      comboXpStorageKey("user-1"),
      JSON.stringify({ vitesse: 0, impact: 0, regularite: 0, badges: ["premier_pas", "eclair"], lastSeen: "" }),
    );
    expect(summarizeComboBadges("user-1")).toEqual([
      { id: "eclair", label: "⚡ Éclair" },
      { id: "premier_pas", label: "🐣 Premier pas" },
    ]);
  });

  it("reads streak counters independently per type", () => {
    window.localStorage.setItem(
      comboStreaksStorageKey("user-1"),
      JSON.stringify({ classique: 14, productif: 3, intense: 0 }),
    );
    const streaks = summarizeComboStreaks("user-1");
    expect(streaks.find((s) => s.id === "classique")).toMatchObject({ days: 14, palier: "Or" });
    expect(streaks.find((s) => s.id === "intense")).toMatchObject({ days: 0, palier: null });
  });

  it("keeps users isolated by storage key", () => {
    window.localStorage.setItem(
      comboXpStorageKey("user-a"),
      JSON.stringify({ vitesse: 500, impact: 0, regularite: 0, badges: [], lastSeen: "" }),
    );
    expect(summarizeComboXp("user-b").axes.find((a) => a.id === "vitesse")?.count).toBe(0);
  });
});
