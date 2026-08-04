/**
 * domain/PoolState.ts — types du pool de lignes (power dialing).
 *
 * Lot 11.5 (roadmap combo-power-dialing) : 3 lignes max en parallèle,
 * déclenchées par un clic humain (Play), skip sur non-réponse, connect sur
 * réponse humaine avec hangup des autres lignes, puis STOP (re-clic Play).
 */

import type { LinePhase } from './CallState';

/** Pool : + ligne abandonnée au profit d'une autre (skip / réponse ailleurs). */
export type PoolPhase = LinePhase | 'skipped';

export type PoolLine = {
  slot: number;
  phase: PoolPhase;
  destination: string;
  error: string | null;
};

export type PoolState = {
  /** Nombre de lignes du pool (défaut 3, configurable). */
  size: number;
  lines: PoolLine[];
  /** File d'attente (destinations à composer). */
  queue: string[];
  /** Un cycle est en cours (Play actif). */
  running: boolean;
  /** Erreur globale du pool (ex. socket perdu) — affichée en tête de vue. */
  error: string | null;
};

export function createPoolState(size: number, queue: string[]): PoolState {
  return {
    size,
    lines: Array.from({ length: size }, (_, slot) => ({
      slot,
      phase: 'idle',
      destination: '',
      error: null,
    })),
    queue,
    running: false,
    error: null,
  };
}
