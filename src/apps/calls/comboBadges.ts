/** Modèle badges one-timer Combo. Pas d'UI, pas de notifs — voir docs/specs/combo-gamification-v1.md §1.4. */

export type BadgeId =
  | "premier_pas"
  | "eclair"
  | "trois_banderilles"
  | "leve_tot"
  | "marathon"
  | "sang_froid"
  | "relais"
  | "mur_reussites";

export interface BadgeCheckInput {
  /** Nombre total de séances complétées par l'utilisateur. */
  sessionsCompletedCount: number;
  /** Raccourcis utilisés dans la journée calendaire en cours. */
  shortcutsUsedToday: number;
  /** RDV planifiés dans la séance en cours. */
  rdvInCurrentSession: number;
  /** La séance en cours (ou celle qui vient de démarrer) a démarré avant 9h Europe/Paris. */
  sessionStartedBeforeNineAm: boolean;
  /** Contacts terminés dans la séance en cours. */
  contactsCompletedInSession: number;
  /** NPA posées, cumul tous temps. */
  npaTotal: number;
  /** L'utilisateur a signé (opt-in) une réussite épinglée par un manager. */
  muraReussiteSigned: boolean;
}

const CRITERIA: Record<Exclude<BadgeId, "relais">, (state: BadgeCheckInput) => boolean> = {
  premier_pas: (state) => state.sessionsCompletedCount >= 1,
  eclair: (state) => state.shortcutsUsedToday >= 50,
  trois_banderilles: (state) => state.rdvInCurrentSession >= 3,
  leve_tot: (state) => state.sessionStartedBeforeNineAm,
  marathon: (state) => state.contactsCompletedInSession >= 50,
  sang_froid: (state) => state.npaTotal >= 10,
  mur_reussites: (state) => state.muraReussiteSigned,
};

export function checkBadges(state: BadgeCheckInput, currentBadges: string[]): BadgeId[] {
  const unlocked: BadgeId[] = [];
  for (const badgeId of Object.keys(CRITERIA) as Exclude<BadgeId, "relais">[]) {
    if (!currentBadges.includes(badgeId) && CRITERIA[badgeId](state)) {
      unlocked.push(badgeId);
    }
  }
  // ponytail: 'relais' est décerné par le moteur Arena (hors scope V1), jamais par Combo.
  return unlocked;
}
