// ponytail: temporary local duplicate of the XP/badges/streaks model (spec
// combo-gamification-v1.md §1) pending the feat-gam-a-models merge. Reads the
// same localStorage shapes the eventual model owns, so swapping this file out
// later is a no-op for CommandBar/MyTrophies consumers.

export type ComboAxisId = "vitesse" | "impact" | "regularite";

export type ComboXpState = {
  vitesse: number;
  impact: number;
  regularite: number;
  badges: string[];
  lastSeen: string;
};

export type ComboStreakId = "classique" | "productif" | "intense";

export type ComboStreaksState = Record<ComboStreakId, number>;

const EMPTY_XP_STATE: ComboXpState = { vitesse: 0, impact: 0, regularite: 0, badges: [], lastSeen: "" };
const EMPTY_STREAKS_STATE: ComboStreaksState = { classique: 0, productif: 0, intense: 0 };

export const AXIS_LABELS: Record<ComboAxisId, string> = {
  vitesse: "Vitesse",
  impact: "Impact",
  regularite: "Régularité",
};

export const STREAK_LABELS: Record<ComboStreakId, string> = {
  classique: "🔥 Streak classique",
  productif: "🎯 Streak productif",
  intense: "⚡ Streak intense",
};

// Paliers par axe — spec §1.3. Les streaks composites (productif/intense)
// n'ont pas de seuils dédiés dans la spec : on réutilise ceux de régularité.
const PALIER_THRESHOLDS: Record<ComboAxisId, { name: string; threshold: number }[]> = {
  vitesse: [
    { name: "Bronze", threshold: 10 },
    { name: "Argent", threshold: 30 },
    { name: "Or", threshold: 75 },
    { name: "Platine", threshold: 150 },
    { name: "Diamant", threshold: 300 },
    { name: "Challenger", threshold: 500 },
  ],
  impact: [
    { name: "Bronze", threshold: 3 },
    { name: "Argent", threshold: 7 },
    { name: "Or", threshold: 15 },
    { name: "Platine", threshold: 30 },
    { name: "Diamant", threshold: 60 },
    { name: "Challenger", threshold: 100 },
  ],
  regularite: [
    { name: "Bronze", threshold: 3 },
    { name: "Argent", threshold: 7 },
    { name: "Or", threshold: 14 },
    { name: "Platine", threshold: 30 },
    { name: "Diamant", threshold: 60 },
    { name: "Challenger", threshold: 100 },
  ],
};

const BADGE_LABELS: Record<string, string> = {
  premier_pas: "🐣 Premier pas",
  eclair: "⚡ Éclair",
  trois_banderilles: "🎯 Trois banderilles",
  leve_tot: "🌅 Lève-tôt",
  marathon: "🏁 Marathon",
  sang_froid: "🧊 Sang-froid",
  relais: "🤝 Relais",
  mur_reussites: "🏆 Mur des réussites",
};

export function comboXpStorageKey(userId: string): string {
  return `xos-combo-xp:${userId}`;
}

export function comboStreaksStorageKey(userId: string): string {
  return `xos-combo-streaks:${userId}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function readComboXpState(userId: string): ComboXpState {
  const state = readJson(comboXpStorageKey(userId), EMPTY_XP_STATE);
  return { ...state, badges: Array.isArray(state.badges) ? state.badges : [] };
}

export function readComboStreaksState(userId: string): ComboStreaksState {
  return readJson(comboStreaksStorageKey(userId), EMPTY_STREAKS_STATE);
}

export function palierForCount(axis: ComboAxisId, count: number): string | null {
  let current: string | null = null;
  for (const tier of PALIER_THRESHOLDS[axis]) {
    if (count >= tier.threshold) current = tier.name;
  }
  return current;
}

export function badgeLabel(badgeId: string): string {
  return BADGE_LABELS[badgeId] ?? badgeId;
}

export type ComboAxisSummary = { id: ComboAxisId; label: string; count: number; palier: string | null };
export type ComboBadgeSummary = { id: string; label: string };
export type ComboStreakSummary = { id: ComboStreakId; label: string; days: number; palier: string | null };

export type ComboXpSummary = {
  axes: ComboAxisSummary[];
  currentPalier: string | null;
  lastBadge: ComboBadgeSummary | null;
};

export function summarizeComboXp(userId: string): ComboXpSummary {
  const state = readComboXpState(userId);
  const axes: ComboAxisSummary[] = (Object.keys(AXIS_LABELS) as ComboAxisId[]).map((id) => ({
    id,
    label: AXIS_LABELS[id],
    count: state[id],
    palier: palierForCount(id, state[id]),
  }));
  const lastBadgeId = state.badges.length > 0 ? state.badges[state.badges.length - 1] : null;
  const lastBadge = lastBadgeId ? { id: lastBadgeId, label: badgeLabel(lastBadgeId) } : null;
  const currentPalier = axes.find((axis) => axis.palier)?.palier ?? null;
  return { axes, currentPalier, lastBadge };
}

export function summarizeComboBadges(userId: string): ComboBadgeSummary[] {
  const state = readComboXpState(userId);
  return [...state.badges].reverse().map((id) => ({ id, label: badgeLabel(id) }));
}

export function summarizeComboStreaks(userId: string): ComboStreakSummary[] {
  const state = readComboStreaksState(userId);
  return (Object.keys(STREAK_LABELS) as ComboStreakId[]).map((id) => ({
    id,
    label: STREAK_LABELS[id],
    days: state[id],
    palier: palierForCount("regularite", state[id]),
  }));
}

/** Progression XP de l'utilisateur — command bar + mur des réussites. */
export function useComboXp(userId: string): ComboXpSummary {
  return summarizeComboXp(userId);
}
