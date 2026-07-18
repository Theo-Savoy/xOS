/** Modèle XP + paliers Combo. Pas d'UI, pas de notifs — voir docs/specs/combo-gamification-v1.md §1. */

export type ComboXpAxis = "vitesse" | "impact" | "regularite";

export type PalierId = "bronze" | "argent" | "or" | "platine" | "diamant" | "challenger";

export type ComboXpEventType = "shortcut" | "rdv" | "day-logged";

export interface ComboXp {
  vitesse: number;
  impact: number;
  regularite: number;
  badges: string[];
  lastSeen: string;
}

export interface AxePalier {
  axis: ComboXpAxis;
  palier: PalierId;
}

export interface ApplyEventResult {
  xp: ComboXp;
  previousXp: ComboXp;
  paliersFranchis: AxePalier[];
}

export interface ProgressToNext {
  current: PalierId | null;
  next: PalierId | null;
  pctToNext: number;
  valueToNext: number;
}

export const PALIER_ORDER: PalierId[] = ["bronze", "argent", "or", "platine", "diamant", "challenger"];

export const PALIERS: Record<ComboXpAxis, Record<PalierId, number>> = {
  vitesse: { bronze: 10, argent: 30, or: 75, platine: 150, diamant: 300, challenger: 500 },
  impact: { bronze: 3, argent: 7, or: 15, platine: 30, diamant: 60, challenger: 100 },
  regularite: { bronze: 3, argent: 7, or: 14, platine: 30, diamant: 60, challenger: 100 },
};

const AXES: ComboXpAxis[] = ["vitesse", "impact", "regularite"];

const EVENT_AXIS: Record<ComboXpEventType, ComboXpAxis> = {
  shortcut: "vitesse",
  rdv: "impact",
  "day-logged": "regularite",
};

function xpStorageKey(userId: string): string {
  return `xos-combo-xp:${userId}`;
}

function emptyXp(): ComboXp {
  return { vitesse: 0, impact: 0, regularite: 0, badges: [], lastSeen: "" };
}

export function loadXp(userId: string): ComboXp {
  try {
    const raw = window.localStorage?.getItem(xpStorageKey(userId));
    if (!raw) return emptyXp();
    const parsed = JSON.parse(raw) as Partial<ComboXp>;
    return {
      vitesse: typeof parsed.vitesse === "number" ? parsed.vitesse : 0,
      impact: typeof parsed.impact === "number" ? parsed.impact : 0,
      regularite: typeof parsed.regularite === "number" ? parsed.regularite : 0,
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      lastSeen: typeof parsed.lastSeen === "string" ? parsed.lastSeen : "",
    };
  } catch {
    return emptyXp();
  }
}

export function saveXp(userId: string, xp: ComboXp): void {
  try {
    window.localStorage?.setItem(xpStorageKey(userId), JSON.stringify(xp));
  } catch {
    /* ignore */
  }
}

export function currentPalier(axis: ComboXpAxis, value: number): PalierId | null {
  let reached: PalierId | null = null;
  for (const palier of PALIER_ORDER) {
    if (value >= PALIERS[axis][palier]) reached = palier;
  }
  return reached;
}

export function progressToNext(axis: ComboXpAxis, value: number): ProgressToNext {
  const current = currentPalier(axis, value);
  const currentIndex = current ? PALIER_ORDER.indexOf(current) : -1;
  const next = currentIndex + 1 < PALIER_ORDER.length ? PALIER_ORDER[currentIndex + 1] : null;

  if (!next) {
    return { current, next: null, pctToNext: 100, valueToNext: 0 };
  }

  const previousThreshold = current ? PALIERS[axis][current] : 0;
  const nextThreshold = PALIERS[axis][next];
  const span = nextThreshold - previousThreshold;
  const pctToNext = span > 0 ? Math.max(0, Math.min(100, ((value - previousThreshold) / span) * 100)) : 100;

  return { current, next, pctToNext, valueToNext: Math.max(0, nextThreshold - value) };
}

export function detectPaliers(previousXp: ComboXp, newXp: ComboXp): AxePalier[] {
  const crossed: AxePalier[] = [];
  for (const axis of AXES) {
    for (const palier of PALIER_ORDER) {
      const threshold = PALIERS[axis][palier];
      if (previousXp[axis] < threshold && newXp[axis] >= threshold) {
        crossed.push({ axis, palier });
      }
    }
  }
  return crossed;
}

export function applyEvent(userId: string, event: ComboXpEventType, qty = 1): ApplyEventResult {
  const previousXp = loadXp(userId);
  const axis = EVENT_AXIS[event];
  const newXp: ComboXp = { ...previousXp, [axis]: previousXp[axis] + qty, lastSeen: new Date().toISOString() };

  const paliersFranchis = detectPaliers(previousXp, newXp);
  saveXp(userId, newXp);

  return { xp: newXp, previousXp, paliersFranchis };
}
