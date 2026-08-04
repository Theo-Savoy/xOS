/**
 * domain/PoolState.ts — types du pool de lignes (power dialing).
 *
 * Lot 11.5 (roadmap combo-power-dialing) : 3 lignes max en parallèle,
 * déclenchées par un clic humain (Play), skip sur non-réponse, connect sur
 * réponse humaine avec hangup des autres lignes, puis STOP (re-clic Play).
 */

export type PoolPhase =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'skipped'
  | 'failed'
  | 'ended';

export type PoolLine = {
  slot: number;
  phase: PoolPhase;
  destination: string;
  error: string | null;
  durationSec: number;
};

export type PoolState = {
  /** Nombre de lignes du pool (défaut 3, configurable). */
  size: number;
  lines: PoolLine[];
  /** File d'attente (destinations à composer). */
  queue: string[];
  /** Slot actuellement connecté (réponse humaine), sinon null. */
  connectedSlot: number | null;
  /** Un cycle est en cours (Play actif). */
  running: boolean;
};

export function createPoolState(size: number, queue: string[]): PoolState {
  return {
    size,
    lines: Array.from({ length: size }, (_, slot) => ({
      slot,
      phase: 'idle',
      destination: '',
      error: null,
      durationSec: 0,
    })),
    queue,
    connectedSlot: null,
    running: false,
  };
}
