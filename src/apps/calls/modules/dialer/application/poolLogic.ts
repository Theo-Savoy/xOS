/**
 * application/poolLogic.ts — réducteur pur du DialerPool (testable, sans SDK).
 *
 * Lot 11.5 : l'orchestrateur du power dialing côté client. Aucun SDK, aucun
 * React — pur état immuable piloté par actions.
 *
 * Actions :
 *   play         déclenchement HUMAIN d'un cycle. Relance les lignes skipped
 *                (tentées puis abandonnées — pas de vrai contact), remplace
 *                les ended/failed/idle par les prochains de la file.
 *                no-op si un cycle est déjà actif.
 *   skip         abandonne une ligne (non-réponse / répondeur manuel), la
 *                libère pour composer le suivant.
 *   answered     réponse humaine sur une ligne → connected, TOUTES les autres
 *                lignes en cours sont coupées (skipped).
 *   line-ended   fin de la ligne connectée → running=false (STOP). JAMAIS
 *                d'enchaînement auto : l'humain re-clique Play (ARCEP §7.1.3).
 *   stop         fin de cycle sans ligne terminée (aucune réponse) →
 *                running=false. `running` est la SEULE source de vérité du
 *                « un cycle est ouvert » (pas de useState miroir dans le hook).
 *   pool-error   erreur globale (socket perdu, …) → running=false, l'erreur
 *                est exposée à l'UI. La file n'est PAS vidée.
 */

import { createPoolState, type PoolLine, type PoolState } from '../domain/PoolState';

export type PoolAction =
  | { type: 'play' }
  | { type: 'skip'; slot: number }
  | { type: 'remote-terminal'; slot: number; phase: 'skipped' | 'failed'; error?: string }
  | { type: 'answered'; slot: number }
  | { type: 'line-ended'; slot: number }
  | { type: 'stop' }
  | { type: 'line-dialing'; slot: number }
  | { type: 'line-ringing'; slot: number }
  | { type: 'line-error'; slot: number; error: string }
  | { type: 'pool-error'; error: string }
  | { type: 'reset'; queue: string[] }
  | { type: 'resize'; size: number };

function idleLine(slot: number): PoolLine {
  return { slot, phase: 'idle', destination: '', error: null };
}

export function poolReducer(state: PoolState, action: PoolAction): PoolState {
  switch (action.type) {
    case 'play': {
      // Déclenchement humain : un nouveau cycle.
      // RÈGLE (Théo 2026-08-04) :
      // - les lignes SKIPPED (tentées puis abandonnées car un autre a
      //   décroché) sont RELANCÉES — elles n'ont pas eu de vrai contact
      // - les lignes ended/failed/idle sont remplacées par les prochains
      //   numéros de la file
      // - la ligne connectée (ended) SORT du flux : jamais recomposée
      if (state.running) return state;
      const nextQueue = [...state.queue];
      const lines = state.lines.map((line) => {
        if (line.phase === 'skipped') {
          // Tenté puis abandonné : on relance le même numéro.
          return { ...line, phase: 'dialing' as const, error: null };
        }
        if (line.phase === 'idle' || line.phase === 'ended' || line.phase === 'failed') {
          // Slot libre : on compose le prochain de la file (s'il y en a).
          const dest = nextQueue.shift();
          return dest !== undefined
            ? { ...idleLine(line.slot), phase: 'dialing' as const, destination: dest }
            : idleLine(line.slot);
        }
        return line; // dialing/ringing/connected : ne pas toucher
      });
      return {
        ...state,
        lines,
        queue: nextQueue,
        running: true,
        error: null,
      };
    }

    case 'skip': {
      // Le serveur ne compose pas automatiquement un remplaçant. Conserver la
      // destination et la file évite d'afficher un appel qui n'existe pas ; une
      // relance explicite reprendra cette ligne plus tard.
      const line = state.lines[action.slot];
      if (!line || line.phase === 'connected') return state;
      const lines = state.lines.map((l) =>
        l.slot === action.slot ? { ...l, phase: 'skipped' as const, error: null } : l,
      );
      return { ...state, lines };
    }

    case 'remote-terminal':
      return patchLine(state, action.slot, {
        phase: action.phase,
        ...(action.error ? { error: action.error } : {}),
      });

    case 'answered': {
      // Réponse humaine : cette ligne devient connected, les autres coupées.
      const lines = state.lines.map((l) =>
        l.slot === action.slot
          ? { ...l, phase: 'connected' as const }
          : l.phase === 'idle'
            ? l
            : { ...l, phase: 'skipped' as const },
      );
      return { ...state, lines };
    }

    case 'line-ended': {
      // La ligne connectée se termine → STOP. Pas d'auto-next (ARCEP).
      const lines = state.lines.map((l) =>
        l.slot === action.slot ? { ...l, phase: 'ended' as const } : l,
      );
      return { ...state, lines, running: false };
    }

    case 'stop':
      // Fin de cycle sans ligne terminée (aucune réponse, socket coupé…) :
      // le bouton repasse en Play, la file et les lignes restent en place.
      return state.running ? { ...state, running: false } : state;

    case 'line-dialing':
      return patchLine(state, action.slot, { phase: 'dialing' });

    case 'line-ringing':
      return patchLine(state, action.slot, { phase: 'ringing' });

    case 'line-error':
      return patchLine(state, action.slot, {
        phase: 'failed',
        error: action.error,
      });

    case 'pool-error':
      return { ...state, running: false, error: action.error };

    case 'reset':
      return createPoolState(state.size, action.queue);

    case 'resize': {
      const size = Math.min(5, Math.max(1, action.size));
      if (size === state.size || state.running) return state;
      const retained = state.lines.slice(0, size);
      const overflow = state.lines.slice(size)
        .filter((line) => line.destination && line.phase !== 'ended')
        .map((line) => line.destination);
      const lines = [...retained];
      while (lines.length < size) lines.push(idleLine(lines.length));
      return { ...state, size, lines, queue: [...overflow, ...state.queue] };
    }

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
