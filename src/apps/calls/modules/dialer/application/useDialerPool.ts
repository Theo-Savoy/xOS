/**
 * application/useDialerPool.ts — hook pool power dialing (lot 11.5).
 *
 * Le navigateur EST le téléphone (WebRTC), sur 3 lignes max en parallèle.
 * Orchestration dans `poolLogic.ts` (réducteur pur, testé) — ici on enrobe le
 * SDK Telnyx : un client partagé, un call par ligne (id custom 'pool-slot-N'
 * pour router les notifications), un élément audio par ligne.
 *
 * Règles produit (roadmap combo-power-dialing) :
 * - Play() : déclenchement HUMAIN, compose min(size, restants)
 * - Skip() : abandonne une ligne, compose le suivant
 * - Réponse humaine → connected, les autres lignes sont coupées
 * - Fin d'appel → STOP (running=false), JAMAIS d'auto-next : re-clic Play
 * - Dry-run : token null → client null → simulation (aucun paquet réel)
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPoolState, type PoolState } from '../domain/PoolState';
import { poolReducer } from './poolLogic';
import {
  AUDIO_CONSTRAINTS,
  getPreferredCodecs,
  createRtcClient,
  type RtcClientHandle,
  type RtcCallHandle,
} from '../infrastructure/telnyx/rtcClient';
import { fetchRtcToken } from '../dialerApi';

type TelnyxNotification = {
  call?: { state?: string; callId?: string; id?: string };
  event?: string;
};

/** Mapping état SDK → PoolPhase (par ligne). */
function poolPhaseFromTelnyx(state?: string): PoolState['lines'][number]['phase'] | null {
  switch (state) {
    case 'new':
    case 'requesting':
    case 'trying':
      return 'dialing';
    case 'early':
    case 'ringing':
      return 'ringing';
    case 'active':
      return 'connected';
    case 'hangup':
    case 'destroy':
      return 'ended';
    default:
      return null;
  }
}

/** id custom passé à newCall : permet de router les notifications par slot. */
function callIdForSlot(slot: number): string {
  return `pool-slot-${slot}`;
}

export type UseDialerPoolResult = {
  state: PoolState;
  /** Initialise la file d'attente (depuis la session). */
  setQueue: (destinations: string[]) => void;
  /** Déclenchement humain : compose min(size, restants). */
  play: () => Promise<void>;
  /** Abandonne une ligne (non-réponse / répondeur), compose le suivant. */
  skip: (slot: number) => void;
  /** Raccroche tout (fin de session). */
  hangupAll: () => void;
  /** Ligne active (appel en cours sur au moins un slot). */
  isRunning: boolean;
};

export function useDialerPool({
  token,
  size = 3,
  simulate = false,
}: {
  token: string;
  size?: number;
  /** Mode démo : JAMAIS de réseau réel, phases simulées (G2). */
  simulate?: boolean;
}): UseDialerPoolResult {
  const [state, dispatch] = useReducer(
    poolReducer,
    undefined,
    () => createPoolState(size, []),
  );
  const clientRef = useRef<RtcClientHandle | null>(null);
  const callsRef = useRef<(RtcCallHandle | null)[]>([]);
  const timersRef = useRef<(ReturnType<typeof setInterval> | null)[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Nettoyage : raccrocher tout + fermer le socket.
  useEffect(() => {
    return () => {
      callsRef.current.forEach((c) => {
        try {
          c?.hangup();
        } catch {
          /* déjà raccroché */
        }
      });
      try {
        clientRef.current?.disconnect();
      } catch {
        /* socket déjà fermé */
      }
      timersRef.current.forEach((t) => {
        if (t) clearInterval(t);
      });
      demoTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  /** Arrête le chrono d'une ligne. */
  const stopTimer = useCallback((slot: number) => {
    if (timersRef.current[slot]) {
      clearInterval(timersRef.current[slot]!);
      timersRef.current[slot] = null;
    }
  }, []);

  /** Composition réelle d'une ligne (après dispatch play/skip). */
  const dialSlot = useCallback(
    async (slot: number, destination: string) => {
      const client = clientRef.current;
      if (!client) return; // simulation : le réducteur gère déjà l'état
      try {
        const audioEl = document.querySelector<HTMLAudioElement>(
          `audio[data-rtc-remote-${slot}]`,
        );
        const call = client.newCall({
          id: callIdForSlot(slot),
          destinationNumber: destination,
          audio: AUDIO_CONSTRAINTS,
          ...(getPreferredCodecs() ? { preferred_codecs: getPreferredCodecs() } : {}),
          ...(audioEl ? { remoteElement: audioEl } : {}),
        });
        callsRef.current[slot] = call;
        // Timeout non-réponse (power dialing) : si la ligne sonne encore
        // après 20s, elle est skippée et on compose le suivant.
        const t = setTimeout(() => {
          const line = stateRef.current.lines[slot];
          if (line && (line.phase === 'dialing' || line.phase === 'ringing')) {
            skipRef.current(slot);
          }
        }, 20000);
        demoTimersRef.current.push(t); // nettoyé par hangupAll/skip
      } catch (e) {
        dispatch({ type: 'line-error', slot, error: e instanceof Error ? e.message : 'Échec dial.' });
      }
    },
    [],
  );

  /** Référence vers l'état courant pour les listeners (éviter les closures). */
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Référence vers skip (permet à dialSlot de l'appeler sans closure circulaire). */
  const skipRef = useRef<(slot: number) => void>(() => {});

  /** Compose réellement les lignes dispatchées en 'dialing'. */
  const composeAfterPlay = useCallback(async () => {
    const s = stateRef.current;
    s.lines.forEach((line, slot) => {
      if (line.phase === 'dialing' && line.destination) {
        void dialSlot(slot, line.destination);
      }
    });
  }, [dialSlot]);

  /** Timers de la simulation démo (dry-run) — nettoyés par hangupAll/skip. */
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearDemoTimers = useCallback(() => {
    demoTimersRef.current.forEach((t) => clearTimeout(t));
    demoTimersRef.current = [];
  }, []);

  /**
   * Simulation démo (mode dry-run / aucun réseau) : fait tourner les phases
   * pour tester l'UI power. Comportement démo :
   * - t+300ms : toutes les lignes passent ringing
   * - t+2s   : la ligne 0 « décroche » → answered (les autres coupées)
   * - t+10s  : la ligne 0 se termine → ended → running=false (STOP)
   */
  const startDemoSimulation = useCallback(() => {
    clearDemoTimers();
    demoTimersRef.current.push(
      setTimeout(() => {
        stateRef.current.lines.forEach((line, slot) => {
          if (line.phase !== 'idle') dispatch({ type: 'line-ringing', slot });
        });
      }, 300),
      setTimeout(() => {
        dispatch({ type: 'answered', slot: 0 });
      }, 2000),
      setTimeout(() => {
        dispatch({ type: 'line-ended', slot: 0 });
        setIsRunning(false);
      }, 10000),
    );
  }, [clearDemoTimers]);

  const play = useCallback(async () => {
    // Déclenchement HUMAIN : l'état UI passe immédiatement en cours.
    dispatch({ type: 'play' });
    setIsRunning(true);

    // Mode démo : JAMAIS de réseau réel, même si le token est émis (G2).
    // La file factice ne doit jamais composer de vrais appels.
    if (simulate) {
      startDemoSimulation();
      return;
    }

    // Le client est créé au premier Play (comme startCall mono-ligne).
    if (!clientRef.current) {
      let rtcToken: string | null = null;
      try {
        const res = await fetchRtcToken(token);
        rtcToken = res.token;
      } catch {
        rtcToken = null; // dry-run : simulation
      }
      const client = await createRtcClient(rtcToken);
      if (!client) {
        // Simulation démo (dry-run) : le réducteur a déjà mis les lignes en
        // dialing. On fait tourner les phases avec des timers pour que l'UI
        // power soit testable sans réseau réel. Aucun paquet ne part (G2).
        startDemoSimulation();
        return;
      }
      clientRef.current = client;

      // Listeners partagés, routés par callId → slot.
      client.on('telnyx.ready', () => {
        // Après connexion du socket : compose réellement les lignes déjà
        // dispatchées en 'dialing' par play().
        void composeAfterPlay();
      });
      client.on('telnyx.notification', (data) => {
        const n = data as TelnyxNotification;
        const callId = n?.call?.callId ?? n?.call?.id;
        const s = n?.call?.state;
        if (!callId || !s) return;
        const match = /^pool-slot-(\d+)$/.exec(callId);
        if (!match) return; // notification hors pool
        const slot = Number(match[1]);
        const p = poolPhaseFromTelnyx(s);
        if (!p) return;
        if (p === 'dialing') dispatch({ type: 'line-dialing', slot });
        if (p === 'ringing') dispatch({ type: 'line-ringing', slot });
        if (p === 'connected') {
          dispatch({ type: 'answered', slot });
          stopTimer(slot);
          // Coupe les autres lignes (le réducteur les passe à skipped,
          // ici on hangup réellement les calls des autres slots).
          callsRef.current.forEach((c, i) => {
            if (i !== slot) {
              try {
                c?.hangup();
              } catch {
                /* déjà raccroché */
              }
              callsRef.current[i] = null;
            }
          });
          timersRef.current[slot] = setInterval(() => {
            // durée de la ligne connectée (à afficher)
          }, 1000);
        }
        if (p === 'ended') {
          dispatch({ type: 'line-ended', slot });
          stopTimer(slot);
          setIsRunning(false);
        }
      });
      client.on('telnyx.socket.close', () => {
        setIsRunning(false);
        dispatch({ type: 'reset', queue: [] });
      });
      client.on('telnyx.error', (e) => {
        const msg = e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Erreur WebRTC Telnyx.';
        // Erreur générale : on coupe tout.
        setIsRunning(false);
        dispatch({ type: 'reset', queue: [] });
        console.error('[dialer.pool]', msg);
      });

      try {
        await client.connect();
      } catch {
        setIsRunning(false);
        return;
      }
    }
    // Si le client existait déjà, composer les lignes dispatchées.
    void composeAfterPlay();
  }, [token, composeAfterPlay, simulate, startDemoSimulation, stopTimer]);

  const skip = useCallback(
    (slot: number) => {
      const line = stateRef.current.lines[slot];
      if (!line || line.phase === 'connected') return;
      clearDemoTimers();
      try {
        callsRef.current[slot]?.hangup();
      } catch {
        /* déjà raccroché */
      }
      callsRef.current[slot] = null;
      stopTimer(slot);
      dispatch({ type: 'skip', slot });
      // Compose le suivant si la file a avancé.
      const next = stateRef.current.queue[0];
      if (next !== undefined) {
        void dialSlot(slot, next);
      }
    },
    [clearDemoTimers, dialSlot, stopTimer],
  );

  // Met à jour la réf vers skip (dialSlot l'utilise sans closure circulaire).
  skipRef.current = skip;

  const hangupAll = useCallback(() => {
    clearDemoTimers();
    callsRef.current.forEach((c, i) => {
      try {
        c?.hangup();
      } catch {
        /* déjà raccroché */
      }
      callsRef.current[i] = null;
      stopTimer(i);
    });
    dispatch({ type: 'reset', queue: [] });
    setIsRunning(false);
  }, [clearDemoTimers, stopTimer]);

  const setQueue = useCallback((destinations: string[]) => {
    dispatch({ type: 'reset', queue: destinations });
  }, []);

  return {
    state,
    setQueue,
    play,
    skip,
    hangupAll,
    isRunning,
  };
}
