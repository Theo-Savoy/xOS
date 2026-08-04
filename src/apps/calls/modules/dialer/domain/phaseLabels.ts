/**
 * domain/phaseLabels.ts — libellés produit des phases d'appel.
 *
 * Une seule définition par vocabulaire : les vues importent d'ici, plus de
 * copier-coller divergent (fix audit 11.13 §3.4 — « Clôture… » vs
 * « Fermeture… » tranché : « Clôture… »).
 */

import type { CallPhase, LinePhase } from './CallState';
import type { PoolPhase } from './PoolState';

const LINE_PHASE_LABEL: Record<LinePhase, string> = {
  idle: 'Prêt',
  dialing: 'Composition…',
  ringing: 'Sonnerie…',
  connected: 'En communication',
  ended: 'Terminé',
  failed: 'Échec',
};

export const CALL_PHASE_LABEL: Record<CallPhase, string> = {
  ...LINE_PHASE_LABEL,
  on_hold: 'En attente',
  wrapping: 'Clôture…',
};

export const POOL_PHASE_LABEL: Record<PoolPhase, string> = {
  ...LINE_PHASE_LABEL,
  skipped: 'Abandonné',
};
