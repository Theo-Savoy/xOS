import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPoolState, type PoolState } from '../domain/PoolState';
import { poolReducer } from './poolLogic';
import {
  createRtcClient,
  notifState,
  safeDisconnect,
  safeHangup,
  telnyxErrorMessage,
  telnyxPhase,
  type RtcCallHandle,
  type RtcClientHandle,
  type TelnyxNotification,
} from '../infrastructure/telnyx/rtcClient';
import {
  DialerApiError,
  blockedReasonMessage,
  callBlockedMessage,
  fetchPowerPoolStatus,
  fetchRtcToken,
  hangupPowerPool,
  startPowerPool,
} from '../dialerApi';

export type UseDialerPoolResult = {
  state: PoolState;
  /** contactIds : aligné 1:1 sur destinations (séance Combo). Ignoré pendant un cycle. */
  setQueue: (destinations: string[], contactIds?: number[]) => void;
  play: () => Promise<void>;
  skip: (slot: number) => void;
  hangupAll: () => void;
  redial: () => Promise<void>;
  isRunning: boolean;
  agentConnected: boolean;
  /** Contact de séance décroché par le pool — le runner focalise sa fiche. */
  winnerContactId: number | null;
  /** F-05 (audit 11.8) : true quand un raccrochage serveur a échoué et que
   * la session est encore à nettoyer — l'UI doit exposer un CTA de réessai. */
  hangupRetryable: boolean;
};

/** Même contrat que useRtcCall : pas de composition tant que telnyx.ready n'a pas fire. */
const AGENT_READY_TIMEOUT_MS = 20_000;
const AGENT_READY_TIMEOUT_MESSAGE =
  'Aucune réponse du serveur WebRTC après 20 s — token refusé ou réseau bloqué. Vérifie la console navigateur.';

/**
 * Lot 11.8: prospects are dialed by Voice API on the server. The browser only
 * registers one WebRTC agent endpoint and answers the unique winning human leg.
 */
export function useDialerPool({
  token,
  size = 3,
  simulate = false,
  simulateNoAnswer = false,
  callSessionId = null,
  callerNumber = null,
}: {
  token: string;
  size?: number;
  simulate?: boolean;
  simulateNoAnswer?: boolean;
  /** Séance Combo dont la file alimente le pool (null : dialer autonome). */
  callSessionId?: number | null;
  /** Numéro sortant choisi (null : caller ID par défaut du serveur). */
  callerNumber?: string | null;
}): UseDialerPoolResult {
  const [state, dispatch] = useReducer(poolReducer, undefined, () => createPoolState(size, []));
  const [agentConnected, setAgentConnected] = useState(false);
  const [winnerContactId, setWinnerContactId] = useState<number | null>(null);
  const [hangupRetryable, setHangupRetryable] = useState(false);
  const stateRef = useRef(state);
  const clientRef = useRef<RtcClientHandle | null>(null);
  const agentCallRef = useRef<RtcCallHandle | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastQueueRef = useRef<string[]>([]);
  const contactIdByDestinationRef = useRef(new Map<string, number>());
  const winnerDestinationRef = useRef<string | null>(null);
  const appliedTerminalCallsRef = useRef(new Set<number>());
  const pollInFlightRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const hangupGenerationRef = useRef(0);
  const agentReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readySettlerRef = useRef<{
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    if (!stateRef.current.running && stateRef.current.size !== size) {
      const resized = poolReducer(stateRef.current, { type: 'resize', size });
      stateRef.current = resized;
      dispatch({ type: 'resize', size });
    }
  }, [size]);

  const clearTimers = useCallback(() => {
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const setAgentAudio = useCallback((enabled: boolean) => {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-rtc-agent]');
    if (audio) audio.muted = !enabled;
    if (enabled) agentCallRef.current?.unmuteAudio?.();
    else agentCallRef.current?.muteAudio?.();
    setAgentConnected(enabled);
  }, []);

  const startDemo = useCallback(() => {
    clearTimers();
    demoTimersRef.current.push(setTimeout(() => {
      stateRef.current.lines.forEach((line, slot) => {
        if (line.phase !== 'idle') dispatch({ type: 'line-ringing', slot });
      });
    }, 300));
    if (simulateNoAnswer) {
      stateRef.current.lines.forEach((_, slot) => {
        demoTimersRef.current.push(setTimeout(() => dispatch({ type: 'skip', slot }), 3000 * (slot + 1)));
      });
      demoTimersRef.current.push(setTimeout(() => dispatch({ type: 'stop' }), 3000 * size + 1000));
    } else {
      demoTimersRef.current.push(
        setTimeout(() => { dispatch({ type: 'answered', slot: 0 }); setAgentAudio(true); }, 2000),
        setTimeout(() => { dispatch({ type: 'line-ended', slot: 0 }); setAgentAudio(false); }, 10000),
      );
    }
  }, [clearTimers, setAgentAudio, simulateNoAnswer, size]);

  const applyServerStatus = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const epoch = sessionEpochRef.current;
    if (!sessionId || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const remote = await fetchPowerPoolStatus(token, sessionId);
      if (sessionIdRef.current !== sessionId || sessionEpochRef.current !== epoch) return;
      remote.calls.forEach((call) => {
        const slot = call.pool_slot;
        const localPhase = stateRef.current.lines[slot]?.phase;
        const isWinner = remote.winner_call_id != null && call.id === remote.winner_call_id;
        if (isWinner) {
          const destination = stateRef.current.lines[slot]?.destination;
          if (destination) winnerDestinationRef.current = destination;
          if (call.contact_id != null) setWinnerContactId(call.contact_id);
        }
        const terminalAlreadyApplied = ['skipped', 'failed', 'ended'].includes(localPhase ?? '');
        const terminalCall = appliedTerminalCallsRef.current.has(call.id);
        if (!terminalCall && call.status === 'dialing') dispatch({ type: 'line-dialing', slot });
        if (!terminalCall && (call.status === 'ringing' || call.status === 'answered')) dispatch({ type: 'line-ringing', slot });
        if (call.status === 'bridged') {
          winnerDestinationRef.current = stateRef.current.lines[slot]?.destination ?? winnerDestinationRef.current;
          dispatch({ type: 'answered', slot });
        }
        const terminal = call.status === 'ended' || ['voicemail', 'no_answer', 'busy', 'failed'].includes(call.status);
        if (isWinner && call.status === 'ended' && !appliedTerminalCallsRef.current.has(call.id)) {
          appliedTerminalCallsRef.current.add(call.id);
          dispatch({ type: 'line-ended', slot });
          setAgentAudio(false);
        } else if (terminal && !terminalAlreadyApplied && !appliedTerminalCallsRef.current.has(call.id)) {
          appliedTerminalCallsRef.current.add(call.id);
          dispatch({
            type: 'remote-terminal', slot,
            phase: call.status === 'failed' ? 'failed' : 'skipped',
            ...(call.status === 'failed' ? { error: 'Appel échoué.' } : {}),
          });
        }
        if (
          call.status === 'ended'
          && stateRef.current.lines[slot]?.phase === 'connected'
          && !appliedTerminalCallsRef.current.has(call.id)
        ) {
          appliedTerminalCallsRef.current.add(call.id);
          dispatch({ type: 'line-ended', slot });
          setAgentAudio(false);
        }
      });
      if (['completed', 'cancelled', 'failed'].includes(remote.status)) {
        dispatch({ type: 'stop' });
        clearTimers();
      }
    } catch (error) {
      if (sessionIdRef.current !== sessionId || sessionEpochRef.current !== epoch) return;
      dispatch({ type: 'pool-error', error: `Synchronisation du pool impossible (${String((error as Error)?.message ?? error)}).` });
      clearTimers();
    } finally {
      pollInFlightRef.current = false;
    }
  }, [clearTimers, setAgentAudio, token]);

  const abortAgentReadyWait = useCallback((reason: unknown) => {
    const settler = readySettlerRef.current;
    readySettlerRef.current = null;
    if (readyTimeoutRef.current != null) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    settler?.reject(reason instanceof Error ? reason : new Error(telnyxErrorMessage(reason)));
  }, []);

  const ensureAgentRegistered = useCallback(async () => {
    if (clientRef.current && agentReadyRef.current) return true;

    const waitForReadyProof = () => new Promise<void>((resolve, reject) => {
      if (!mountedRef.current) {
        reject(new Error('unmounted'));
        return;
      }
      if (agentReadyRef.current) { resolve(); return; }
      abortAgentReadyWait(new Error('agent-ready-superseded'));
      readyTimeoutRef.current = setTimeout(() => {
        readyTimeoutRef.current = null;
        const settler = readySettlerRef.current;
        readySettlerRef.current = null;
        settler?.reject(new Error(AGENT_READY_TIMEOUT_MESSAGE));
      }, AGENT_READY_TIMEOUT_MS);
      readySettlerRef.current = {
        resolve: () => {
          if (readyTimeoutRef.current != null) {
            clearTimeout(readyTimeoutRef.current);
            readyTimeoutRef.current = null;
          }
          resolve();
        },
        reject: (error) => {
          if (readyTimeoutRef.current != null) {
            clearTimeout(readyTimeoutRef.current);
            readyTimeoutRef.current = null;
          }
          reject(error instanceof Error ? error : new Error(telnyxErrorMessage(error)));
        },
      };
    });

    if (!clientRef.current) {
      const tokenResult = await fetchRtcToken(token);
      if (!mountedRef.current) return false;
      const client = await createRtcClient(tokenResult.token);
      if (!mountedRef.current) return false;
      if (!client) return false;
      clientRef.current = client;
      client.on('telnyx.notification', (data) => {
        const notification = data as TelnyxNotification;
        const call = notification.call;
        const phase = telnyxPhase(notifState(notification));
        if (!call || !phase) return;
        // F-01 (audit 11.8) : le SDK @telnyx/webrtc range l'état d'invite dans
        // call.options.clientState (m.client_state → options du constructeur),
        // JAMAIS sur l'instance. Fallback call.clientState pour compat tests
        // legacy. Sans ce fix le poste n'accepte jamais le leg agent.
        const inviteState = (call as { options?: { clientState?: string }; clientState?: string }).options?.clientState
          ?? (call as { clientState?: string }).clientState;
        let inviteSessionId: string | null = null;
        let inviteKind: string | null = null;
        try {
          const parsed = inviteState ? JSON.parse(atob(inviteState)) : null;
          inviteSessionId = parsed?.poolSessionId ?? null;
          inviteKind = parsed?.kind ?? null;
        } catch { inviteSessionId = null; inviteKind = null; }
        if (
          (call as { direction?: string }).direction === 'inbound' &&
          inviteSessionId === sessionIdRef.current &&
          inviteKind === 'agent' &&
          !agentCallRef.current
        ) {
          agentCallRef.current = call;
          call.muteAudio?.();
          const audio = document.querySelector<HTMLAudioElement>('audio[data-rtc-agent]');
          void call.answer?.(audio ? { remoteElement: audio } : undefined);
        }
        if (call === agentCallRef.current && phase === 'connected') setAgentAudio(true);
        if (call === agentCallRef.current && phase === 'ended') {
          setAgentAudio(false);
          agentCallRef.current = null;
          const winner = stateRef.current.lines.find((line) => line.phase === 'connected');
          if (winner) dispatch({ type: 'line-ended', slot: winner.slot });
        }
      });
      client.on('telnyx.ready', () => {
        agentReadyRef.current = true;
        const settler = readySettlerRef.current;
        readySettlerRef.current = null;
        if (readyTimeoutRef.current != null) {
          clearTimeout(readyTimeoutRef.current);
          readyTimeoutRef.current = null;
        }
        settler?.resolve();
      });
      client.on('telnyx.error', (error) => {
        const settler = readySettlerRef.current;
        if (settler && !agentReadyRef.current) {
          abortAgentReadyWait(error instanceof Error ? error : new Error(telnyxErrorMessage(error)));
          return;
        }
        if (!mountedRef.current) return;
        dispatch({ type: 'pool-error', error: telnyxErrorMessage(error) });
      });
      await client.connect();
      if (!mountedRef.current) return false;
    }

    if (!mountedRef.current) return false;
    if (agentReadyRef.current) return true;
    await waitForReadyProof();
    return mountedRef.current;
  }, [abortAgentReadyWait, setAgentAudio, token]);

  const play = useCallback(async () => {
    if (stateRef.current.running) return;
    // Compose les destinations AVANT le dispatch : le reducer play consomme la
    // file (nextQueue.shift), et stateRef n'est resynchronisé qu'au prochain
    // render. Après l'attente ready (token + connect + telnyx.ready), lire
    // stateRef.current donnerait une file vidée → le pool ne composerait
    // jamais (test readiness lot-11.8).
    const before = stateRef.current;
    const retry = before.lines
      .filter((line) => line.phase === 'skipped' && line.destination)
      .map((line) => line.destination);
    const destinations = [...retry, ...before.queue].slice(0, size);
    setWinnerContactId(null);
    dispatch({ type: 'play' });
    if (simulate) { startDemo(); return; }
    if (destinations.length === 0) {
      dispatch({ type: 'stop' });
      return;
    }
    hangupGenerationRef.current += 1;
    // Remet la file et les lignes dans l'état d'avant Play : le pool n'a pas
    // démarré, l'agent doit pouvoir recliquer sans perdre ses contacts.
    const rollback = () => {
      const queue = [
        ...before.lines.filter((line) => line.phase === 'skipped' && line.destination).map((line) => line.destination),
        ...before.queue,
      ];
      stateRef.current = createPoolState(size, queue);
      dispatch({ type: 'reset', queue });
    };
    try {
      const registered = await ensureAgentRegistered();
      if (!mountedRef.current) return;
      if (!registered) {
        // F-04 (audit 11.8) : rollback de l'état play (lignes + file) — le
        // pool n'a jamais démarré. Sans cela les lignes restent 'dialing',
        // la file reste consommée et Play redevient un no-op cliquable.
        rollback();
        dispatch({ type: 'pool-error', error: 'Poste WebRTC indisponible — impossible de lancer le pool.' });
        return;
      }
      lastQueueRef.current = destinations;
      // Les contact_ids ne partent que si CHAQUE destination du cycle est
      // rattachée à une fiche : un lot partiel ferait échouer la validation
      // serveur (alignement 1:1) alors que la composition, elle, est valide.
      const contactIds = destinations.map((destination) => contactIdByDestinationRef.current.get(destination));
      const linked = callSessionId != null
        && contactIds.every((contactId): contactId is number => typeof contactId === 'number');
      const started = await startPowerPool(token, {
        destinations,
        parallelism: size,
        ...(callerNumber ? { callerNumber } : {}),
        ...(linked ? { sessionId: callSessionId, contactIds } : {}),
      });
      if (!mountedRef.current) return;
      if (started.dry_run || !started.session_id) {
        // F-03 (audit 11.8) : hors simulate, un pool_start dry_run / sans
        // session_id ne doit JAMAIS basculer silencieusement en démo — le
        // poste RTC réel est déjà enregistré et l'utilisateur croirait avoir
        // lancé un cycle réel. Erreur explicite, zéro timer démo.
        dispatch({ type: 'pool-error', error: 'Session power refusée par le serveur (dry-run actif ou session non créée).' });
        return;
      }
      // Quota/budget épuisé : aucun slot ne compose et la session serveur est
      // déjà close. Sans ce message, les lignes resteraient figées sans motif.
      if (!started.calls.some((call) => call.status === 'dialing')) {
        const refused = started.calls.find((call) => call.error);
        rollback();
        dispatch({
          type: 'pool-error',
          error: refused?.error
            ? blockedReasonMessage(refused.error)
            : 'Aucune ligne n’a pu être composée.',
        });
        return;
      }
      sessionIdRef.current = started.session_id;
      sessionEpochRef.current += 1;
      appliedTerminalCallsRef.current.clear();
      clearTimers();
      await applyServerStatus();
      pollRef.current = setInterval(() => { void applyServerStatus(); }, 1000);
    } catch (error) {
      if (!mountedRef.current) return;
      // F-04 (audit 11.8) : timeout/erreur avant démarrage → rollback de
      // l'état play (le pool n'a jamais eu de session_id). Si une session
      // existe déjà, l'erreur vient d'après le démarrage : on garde l'état.
      if (!sessionIdRef.current) rollback();
      // Un refus serveur (quota, session power déjà ouverte, entitlement) a un
      // message métier ; seul le reste relève du transport WebRTC.
      dispatch({
        type: 'pool-error',
        error: error instanceof DialerApiError
          ? callBlockedMessage(error)
          : telnyxErrorMessage(error),
      });
    }
  }, [applyServerStatus, callSessionId, callerNumber, ensureAgentRegistered, simulate, size, startDemo, token]);

  const skip = useCallback((slot: number) => {
    const sessionId = sessionIdRef.current;
    const line = stateRef.current.lines[slot];
    if (!line || line.phase === 'connected') return;
    dispatch({ type: 'skip', slot });
    if (sessionId) {
      void fetchPowerPoolStatus(token, sessionId).then((status) => {
        const call = status.calls.find((item) => item.pool_slot === slot);
        if (call) return hangupPowerPool(token, sessionId, call.id);
      }).catch((error) => console.error('[powerPool] line hangup failed:', error));
    }
  }, [token]);

  const hangupAll = useCallback(() => {
    clearTimers();
    setAgentAudio(false);
    safeHangup(agentCallRef.current);
    agentCallRef.current = null;
    const sessionId = sessionIdRef.current;
    const generation = ++hangupGenerationRef.current;
    sessionEpochRef.current += 1;
    setHangupRetryable(false);
    if (!sessionId) {
      dispatch({ type: 'reset', queue: [] });
      return;
    }
    // F-05 (audit 11.8) : ne PAS reset visuel avant confirmation serveur —
    // en cas d'échec, l'UI doit garder un CTA de réessai. 'stop' suffit pour
    // sortir du mode running sans effacer les lignes/file.
    dispatch({ type: 'stop' });
    void hangupPowerPool(token, sessionId)
      .then(() => {
        if (hangupGenerationRef.current !== generation) return;
        if (sessionIdRef.current !== sessionId) return;
        sessionIdRef.current = null;
        dispatch({ type: 'reset', queue: [] });
      })
      .catch((error) => {
        if (hangupGenerationRef.current !== generation) return;
        if (sessionIdRef.current !== sessionId) return;
        setHangupRetryable(true);
        dispatch({
          type: 'pool-error',
          error: `Raccrochage serveur impossible (${telnyxErrorMessage(error)}). Réessaie.`,
        });
      });
  }, [clearTimers, setAgentAudio, token]);

  const redial = useCallback(async () => {
    if (stateRef.current.running) return;
    const explicitRetryable = [
      ...stateRef.current.lines
        .filter((line) => ['skipped', 'failed'].includes(line.phase) && line.destination)
        .map((line) => line.destination),
      ...stateRef.current.queue,
    ];
    const retryable = (explicitRetryable.length > 0 ? explicitRetryable : lastQueueRef.current)
      .filter((destination) => destination !== winnerDestinationRef.current);
    if (retryable.length === 0) return;
    const reset = createPoolState(size, retryable);
    stateRef.current = reset;
    dispatch({ type: 'reset', queue: retryable });
    await play();
  }, [play, size]);

  const setQueue = useCallback((destinations: string[], contactIds?: number[]) => {
    // Un cycle en cours possède ses lignes : recharger la file les effacerait.
    // Le garde vit ici, pas chez chaque appelant (le runner republie sa file à
    // chaque changement de contacts, y compris pendant la composition).
    if (stateRef.current.running) return;
    lastQueueRef.current = destinations;
    contactIdByDestinationRef.current = new Map(
      contactIds?.length === destinations.length
        ? destinations.map((destination, index) => [destination, contactIds[index]] as const)
        : [],
    );
    dispatch({ type: 'reset', queue: destinations });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortAgentReadyWait(new Error('unmounted'));
      clearTimers();
      safeHangup(agentCallRef.current);
      safeDisconnect(clientRef.current);
      const sessionId = sessionIdRef.current;
      if (sessionId) void hangupPowerPool(token, sessionId).catch((error) => console.error('[powerPool] cleanup failed:', error));
    };
  }, [abortAgentReadyWait, clearTimers, token]);

  return {
    state, setQueue, play, skip, hangupAll, redial,
    isRunning: state.running, agentConnected, winnerContactId, hangupRetryable,
  };
}
