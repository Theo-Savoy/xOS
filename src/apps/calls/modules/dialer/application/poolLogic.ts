/**
 * application/poolLogic.ts — logique pure du DialerPool (testable, sans SDK).
 *
 * Lot 11.5 : l'orchestrateur du power dialing côté client. Règles :
 * - Play() : compose min(size, restants) depuis la file — déclenchement humain.
 * - skipLine() : abandonne une ligne (non-réponse / répondeur manuel), la
 *   libère pour composer le suivant.
 * - onAnswered() : réponse humaine sur une ligne → elle devient connected,
 *   TOUTES les autres lignes sont coupées (hangup). Le cycle s'arrête.
 * - onLineEnded() : la ligne connectée se termine → running=false (STOP).
 *   JAMAIS d'enchaînement auto : l'humain re-clique Play.
 *
 * Retourne un nouvel état immuable — le hook React l'utilise via useReducer.
 */

import { createPoolState, type PoolLine, type PoolState } from '../domain/PoolState';

export type PoolAction =
  | { type: 'play' }
  | { type: 'skip'; slot: number }
  | { type: 'answered'; slot: number }
  | { type: 'line-ended'; slot: number }
  | { type: 'line-dialing'; slot: number }
  | { type: 'line-ringing'; slot: number }
  | { type: 'line-error'; slot: number; error: string }
  | { type: 'reset'; queue: string[] };

function idleLine(slot: number): PoolLine {
  return { slot, phase: 'idle', destination: '', error: null, durationSec: 0 };
}

export function poolReducer(state: PoolState, action: PoolAction): PoolState {
  switch (action.type) {
    case 'play': {
      // Déclenchement humain : compose min(size, restants) depuis la file.
      if (state.running) return state; // un cycle déjà actif
      const toCompose = state.queue.slice(0, state.size);
      const rest = state.queue.slice(state.size);
      const lines = state.lines.map((line, i) => {
        const dest = toCompose[i];
        return dest !== undefined
          ? { ...idleLine(line.slot), phase: 'dialing' as const, destination: dest }
          : idleLine(line.slot);
      });
      return {
        ...state,
        lines,
        queue: rest,
        connectedSlot: null,
        running: true,
      };
    }

    case 'skip': {
      // Non-réponse : abandonne la ligne, compose le suivant si disponible.
      const line = state.lines[action.slot];
      if (!line || line.phase === 'connected') return state;
      const nextDest = state.queue[0];
      const rest = state.queue.slice(1);
      const lines = state.lines.map((l) =>
        l.slot === action.slot
          ? nextDest !== undefined
            ? { ...idleLine(l.slot), phase: 'dialing' as const, destination: nextDest }
            : { ...idleLine(l.slot), phase: 'skipped' as const }
          : l,
      );
      return { ...state, lines, queue: rest };
    }

    case 'answered': {
      // Réponse humaine : cette ligne devient connected, les autres coupées.
      const lines = state.lines.map((l) =>
        l.slot === action.slot
          ? { ...l, phase: 'connected' as const }
          : l.phase === 'idle'
            ? l
            : { ...l, phase: 'skipped' as const },
      );
      return { ...state, lines, connectedSlot: action.slot };
    }

    case 'line-ended': {
      // La ligne connectée se termine → STOP. Pas d'auto-next (ARCEP).
      const lines = state.lines.map((l) =>
        l.slot === action.slot ? { ...l, phase: 'ended' as const } : l,
      );
      return { ...state, lines, running: false };
    }

    case 'line-dialing':
      return patchLine(state, action.slot, { phase: 'dialing' });

    case 'line-ringing':
      return patchLine(state, action.slot, { phase: 'ringing' });

    case 'line-error':
      return patchLine(state, action.slot, {
        phase: 'failed',
        error: action.error,
      });

    case 'reset':
      return createPoolState(state.size, action.queue);

    default:
      return state;
  }
}

function patchLine(
  state: PoolState,
  slot: number,
  patch: Partial<PoolLine>,
): PoolState {
  return {
    ...state,
    lines: state.lines.map((l) => (l.slot === slot ? { ...l, ...patch } : l)),
  };
}
