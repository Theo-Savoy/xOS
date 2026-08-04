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
 *
 * Simulation pool (démo) : startDemoSimulation — timings volontairement
 * différents de la simulation mono-ligne (useRtcCall).
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createPoolState, type PoolState } from '../domain/PoolState';
import { poolReducer } from './poolLogic';
import {
  newCallOptions,
  notifCallId,
  notifState,
  safeDisconnect,
  safeHangup,
  telnyxErrorMessage,
  telnyxPhase,
  createRtcClient,
  type RtcClientHandle,
  type RtcCallHandle,
  type TelnyxNotification,
} from '../infrastructure/telnyx/rtcClient';
import { fetchRtcToken } from '../dialerApi';
import type { PoolPhase } from '../domain/PoolState';

/** Mapping telnyxPhase (SDK) → PoolPhase. held ignoré (pas de on_hold pool). */
const PHASE_FROM_TELNYX: Record<string, PoolPhase> = {
  dialing: 'dialing',
  ringing: 'ringing',
  connected: 'connected',
  ended: 'ended',
};

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
  /** Un cycle Play est ouvert (≠ « une ligne est active ») : pilote la
   *  bascule Play ↔ Tout raccrocher. */
  isRunning: boolean;
};

export function useDialerPool({
  token,
  size = 3,
  simulate = false,
  simulateNoAnswer = false,
}: {
  token: string;
  size?: number;
  /** Mode démo : JAMAIS de réseau réel, phases simulées (G2). */
  simulate?: boolean;
  /** Démo : aucune ligne ne décroche — le timeout non-réponse skippe. */
  simulateNoAnswer?: boolean;
}): UseDialerPoolResult {
  const [state, dispatch] = useReducer(
    poolReducer,
    undefined,
    () => createPoolState(size, []),
  );
  const clientRef = useRef<RtcClientHandle | null>(null);
  const callsRef = useRef<(RtcCallHandle | null)[]>([]);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Timeouts non-réponse 20s, un par slot (R3 lot-11.14) : les purger dans
  // `demoTimersRef` cassait l'auto-skip des AUTRES lignes (skip() purgeait
  // tout). Séparés : skip ne tue que le sien.
  const noAnswerTimersRef = useRef<(ReturnType<typeof setTimeout> | null)[]>([]);
  const stateRef = useRef(state);
  /** Réf vers skip : dialSlot arme un timeout non-réponse qui appelle skip ;
   *  skip rappelle dialSlot pour composer le suivant. Cycle assumé, cassé par
   *  une ref (pas de closure circulaire possible avec useCallback). */
  const skipRef = useRef<(slot: number) => void>(() => {});

  // Refs de synchronisation : les listeners SDK et les timers sont créés une
  // fois et ne doivent PAS capturer un state périmé. Assignation en effet (et
  // pas pendant le render) — React interdit les effets de bord de render.
  useEffect(() => {
    stateRef.current = state;
    skipRef.current = skip;
  });

  const clearDemoTimers = useCallback(() => {
    demoTimersRef.current.forEach((t) => clearTimeout(t));
    demoTimersRef.current = [];
  }, []);

  /** Purge le timeout non-réponse d'UN slot (le sien). */
  const clearNoAnswerTimer = useCallback((slot: number) => {
    const t = noAnswerTimersRef.current[slot];
    if (t) {
      clearTimeout(t);
      noAnswerTimersRef.current[slot] = null;
    }
  }, []);

  /** Purge tous les timeouts non-réponse (arrêt global). */
  const clearAllNoAnswerTimers = useCallback(() => {
    noAnswerTimersRef.current.forEach((t) => t && clearTimeout(t));
    noAnswerTimersRef.current = [];
  }, []);

  /** Composition réelle d'une ligne (après dispatch play/skip). */
  const dialSlot = useCallback(
    (slot: number, destination: string) => {
      const client = clientRef.current;
      if (!client) return; // simulation : le réducteur gère déjà l'état
      try {
        const call = client.newCall(
          newCallOptions(destination, `audio[data-rtc-remote-${slot}]`, {
            id: callIdForSlot(slot),
          }),
        );
        callsRef.current[slot] = call;
        // PLACEHOLDER DÉMO (lot 11.5/11.6) : timeout non-réponse 20s pour
        // éviter le figement en dry-run. Le comportement PRODUCTION (lot 11.8)
        // est l'AMD premium : skip immédiat sur répondeur / filtre Apple,
        // seul un décroché HUMAIN atteint le commercial (webhooks
        // call.machine.detection.ended, bloqué compte paid Telnyx).
        const t = setTimeout(() => {
          const line = stateRef.current.lines[slot];
          if (line && (line.phase === 'dialing' || line.phase === 'ringing')) {
            skipRef.current(slot);
          }
        }, 20000);
        noAnswerTimersRef.current[slot] = t; // R3 : par slot, pas global
      } catch (e) {
        dispatch({ type: 'line-error', slot, error: telnyxErrorMessage(e) });
      }
    },
    [],
  );

  /** Compose réellement les lignes dispatchées en 'dialing'. */
  const composeAfterPlay = useCallback(() => {
    const current = stateRef.current;
    current.lines.forEach((line, slot) => {
      if (line.phase === 'dialing' && line.destination) {
        dialSlot(slot, line.destination);
      }
    });
  }, [dialSlot]);

  /**
   * Simulation démo (mode dry-run / aucun réseau) : fait tourner les phases
   * pour tester l'UI power. Aucun paquet réel ne part (G2).
   *
   * Scénario réponse humaine (défaut) :
   * - t+300ms : toutes les lignes passent ringing
   * - t+2s   : la ligne 0 « décroche » → answered (les autres coupées)
   * - t+10s  : la ligne 0 se termine → ended → running=false (STOP)
   *
   * Scénario AUCUNE réponse (simulateNoAnswer) :
   * - t+300ms : toutes les lignes passent ringing
   * - t+3s   : le timeout non-réponse skippe la ligne 0 (compose le suivant)
   * - t+6s   : skip ligne 1
   * - t+9s   : skip ligne 2
   * - la file avance à chaque skip (comportement power dialing réel)
   */
  const startDemoSimulation = useCallback(() => {
    clearDemoTimers();
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        stateRef.current.lines.forEach((line, slot) => {
          if (line.phase !== 'idle') dispatch({ type: 'line-ringing', slot });
        });
      }, 300),
    );
    if (simulateNoAnswer) {
      // Aucune réponse : le timeout non-réponse skippe chaque ligne, la
      // file avance (comme le ferait le timeout réel du lot 11.5).
      const skipAt = [3000, 6000, 9000];
      skipAt.forEach((ms, i) => {
        timers.push(
          setTimeout(() => {
            const line = stateRef.current.lines[i];
            if (line && line.phase !== 'connected') {
              dispatch({ type: 'skip', slot: i });
            }
          }, ms),
        );
      });
      // Fin de la démo sans réponse : on stoppe (les slots sont skipped
      // ou en dialing avec les suivants — l'utilisateur re-clique Play).
      timers.push(setTimeout(() => dispatch({ type: 'stop' }), 10000));
    } else {
      timers.push(
        setTimeout(() => {
          dispatch({ type: 'answered', slot: 0 });
        }, 2000),
        setTimeout(() => dispatch({ type: 'line-ended', slot: 0 }), 10000),
      );
    }
    demoTimersRef.current.push(...timers);
  }, [clearDemoTimers, simulateNoAnswer]);

  const play = useCallback(async () => {
    // Déclenchement HUMAIN : l'état UI passe immédiatement en cours.
    dispatch({ type: 'play' });

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
        composeAfterPlay();
      });
      client.on('telnyx.notification', (data) => {
        const n = data as TelnyxNotification;
        const callId = notifCallId(n);
        const s = notifState(n);
        if (!callId || !s) return;
        const match = /^pool-slot-(\d+)$/.exec(callId);
        if (!match) return; // notification hors pool
        const slot = Number(match[1]);
        const telnyxPhaseValue = telnyxPhase(s);
        const p = telnyxPhaseValue ? PHASE_FROM_TELNYX[telnyxPhaseValue] : undefined;
        if (!p) return;
        if (p === 'dialing') dispatch({ type: 'line-dialing', slot });
        if (p === 'ringing') dispatch({ type: 'line-ringing', slot });
        if (p === 'connected') {
          dispatch({ type: 'answered', slot });
          // Coupe les autres lignes (le réducteur les passe à skipped,
          // ici on hangup réellement les calls des autres slots).
          callsRef.current.forEach((c, i) => {
            if (i !== slot) {
              safeHangup(c);
              callsRef.current[i] = null;
            }
          });
        }
        if (p === 'ended') {
          dispatch({ type: 'line-ended', slot });
        }
      });
      client.on('telnyx.socket.close', () => {
        // Erreur globale : on expose le message à l'UI, on NE VIDE PAS la
        // file (les numéros restants sont précieux — pire moment pour les
        // perdre).
        dispatch({ type: 'pool-error', error: 'Connexion WebRTC perdue (socket fermé).' });
      });
      client.on('telnyx.error', (e) => {
        dispatch({ type: 'pool-error', error: telnyxErrorMessage(e) });
      });

      try {
        await client.connect();
      } catch (e) {
        dispatch({ type: 'pool-error', error: telnyxErrorMessage(e) });
        return;
      }
    }
    // Si le client existait déjà, composer les lignes dispatchées.
    composeAfterPlay();
  }, [token, composeAfterPlay, simulate, startDemoSimulation]);

  const skip = useCallback(
    (slot: number) => {
      const line = stateRef.current.lines[slot];
      if (!line || line.phase === 'connected') return;
      clearDemoTimers();
      clearNoAnswerTimer(slot); // R3 : ne tue QUE le timeout de cette ligne
      safeHangup(callsRef.current[slot]);
      callsRef.current[slot] = null;
      dispatch({ type: 'skip', slot });
      // Compose le suivant si la file a avancé.
      const next = stateRef.current.queue[0];
      if (next !== undefined) {
        dialSlot(slot, next);
      }
    },
    [clearDemoTimers, clearNoAnswerTimer, dialSlot],
  );

  const hangupAll = useCallback(() => {
    clearDemoTimers();
    clearAllNoAnswerTimers();
    callsRef.current.forEach((c, i) => {
      safeHangup(c);
      callsRef.current[i] = null;
    });
    dispatch({ type: 'reset', queue: [] });
  }, [clearDemoTimers, clearAllNoAnswerTimers]);

  const setQueue = useCallback((destinations: string[]) => {
    dispatch({ type: 'reset', queue: destinations });
  }, []);

  // Nettoyage à la sortie de la vue : raccrocher tout + fermer le socket.
  useEffect(() => {
    return () => {
      clearDemoTimers();
      clearAllNoAnswerTimers();
      callsRef.current.forEach((c) => safeHangup(c));
      callsRef.current = [];
      safeDisconnect(clientRef.current);
      clientRef.current = null;
    };
  }, [clearDemoTimers, clearAllNoAnswerTimers]);

  return {
    state,
    setQueue,
    play,
    skip,
    hangupAll,
    // Source de vérité unique : le réducteur. (Un useState miroir vivait ici
    // et divergeait de state.running sur la fin de démo sans réponse.)
    isRunning: state.running,
  };
}
