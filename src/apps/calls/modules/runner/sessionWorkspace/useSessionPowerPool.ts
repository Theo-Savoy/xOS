import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionContact } from '../../../types';
import { useDialerPool } from '../../dialer/application/useDialerPool';
import { fetchDialerConfig, type DialerConfig } from '../../dialer/dialerApi';
import type { PoolLine } from '../../dialer/domain/PoolState';
import { playComboSound } from '../../gamification/comboSounds';
import { readSoundsEnabled } from '../../gamification/comboKeyboard';
import { derivePowerViewModel, projectPowerQueue } from './powerUiState';
import type { PowerViewModel, ProjectedPowerQueue } from './types';

const LAUNCH_MS = 900;

export interface UseSessionPowerPoolOptions {
  token?: string | null;
  sessionId: number;
  contacts: SessionContact[];
  currentUserId?: string | null;
  canPowerDialer?: boolean;
  onFocusContact: (contactId: number) => void;
  onBack: () => void;
  /** Optionnel : surcharge pour tests unitaires */
  initialPowerOn?: boolean;
}

export interface UseSessionPowerPoolResult {
  isPowerActive: boolean;
  powerOn: boolean;
  setPowerOn: (on: boolean) => void;
  togglePower: () => void;
  powerViewModel: PowerViewModel;
  projectedQueue: ProjectedPowerQueue;
  parallelism: number;
  setParallelism: (p: number) => void;
  callerNumber: string;
  setCallerNumber: (num: string) => void;
  callerNumbers: Array<{ e164: string; label?: string | null }>;
  quota: {
    used: number;
    limit: number | null;
    remaining: number | null;
    blocked: boolean;
    constrained: boolean;
  };
  lines: PoolLine[];
  byPhone: Map<string, SessionContact>;
  error: string | null;
  agentConnected: boolean;
  launching: boolean;
  hasAttempted: boolean;
  onLaunch: () => Promise<void>;
  onHangupAll: () => void;
  onSkip: (slot: number) => void;
  onRetryHangup: () => void;
  notifyLogged: () => void;
  requestExit: () => void;
  isPendingExit: boolean;
}

export function useSessionPowerPool({
  token,
  sessionId,
  contacts,
  currentUserId = null,
  canPowerDialer = false,
  onFocusContact,
  onBack,
  initialPowerOn = false,
}: UseSessionPowerPoolOptions): UseSessionPowerPoolResult {
  const [powerOn, setPowerOn] = useState(initialPowerOn);
  const [parallelism, setParallelism] = useState(3);
  const [callerNumber, setCallerNumber] = useState('');
  const [config, setConfig] = useState<DialerConfig | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchTimer = useRef<number | null>(null);

  const powerAvailable = Boolean(canPowerDialer && token);

  // Chargement de la configuration dialer (numéros sortants, quotas)
  const loadConfig = useCallback(async () => {
    if (!token || !canPowerDialer) return;
    try {
      const dialerConfig = await fetchDialerConfig(token);
      setConfig(dialerConfig);
    } catch {
      setConfig(null);
    }
  }, [token, canPowerDialer]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const callerNumbers = useMemo(() => config?.caller_numbers ?? [], [config]);

  // Numéro par défaut : le premier alloué si aucun choix explicite n'a été fait
  useEffect(() => {
    const first = callerNumbers[0]?.e164;
    if (first) {
      setCallerNumber((curr) => curr || first);
    }
  }, [callerNumbers]);

  // Instanciation unique du moteur de dialer pool
  const pool = useDialerPool({
    token: token ?? '',
    size: parallelism,
    callSessionId: sessionId,
    callerNumber: callerNumber || null,
  });

  // Projection unique de la file (Plan §2 & I9)
  const projectedQueue = useMemo(() => {
    return projectPowerQueue(contacts, currentUserId);
  }, [contacts, currentUserId]);

  const { setQueue, winnerContactId, isRunning: poolRunning } = pool;

  // Synchronisation de la file projetée avec le pool
  useEffect(() => {
    setQueue(projectedQueue.queue, projectedQueue.contactIds);
  }, [setQueue, projectedQueue.queue, projectedQueue.contactIds]);

  // Basculement automatique sur le contact décroché (winner)
  useEffect(() => {
    if (winnerContactId != null) {
      onFocusContact(winnerContactId);
    }
  }, [winnerContactId, onFocusContact]);

  // Recharger le quota restant dès qu'un cycle de vague se termine
  useEffect(() => {
    if (!poolRunning) {
      void loadConfig();
    }
  }, [poolRunning, loadConfig]);

  useEffect(() => {
    return () => {
      clearTimeout(launchTimer.current ?? undefined);
    };
  }, []);

  // Dérivation des lignes et de l'état opérationnel du pool
  const isConnected = useMemo(() => {
    return pool.state.lines.some((line) => line.phase === 'connected');
  }, [pool.state.lines]);

  const isWaveActive = useMemo(() => {
    return (
      pool.isRunning ||
      pool.state.lines.some(
        (line) => !['idle', 'ended', 'skipped', 'failed'].includes(line.phase),
      )
    );
  }, [pool.isRunning, pool.state.lines]);

  const hasAttempted = useMemo(() => {
    return pool.state.lines.some((line) =>
      ['ended', 'skipped', 'failed'].includes(line.phase),
    );
  }, [pool.state.lines]);

  // Gestion du cycle de vie ACW (After-Call Work)
  // Transition : conversation -> fin de ligne -> acw -> consigné (notifyLogged) -> ready
  const hadConnectedRef = useRef(false);
  const [isAcw, setIsAcw] = useState(false);

  useEffect(() => {
    if (isConnected) {
      hadConnectedRef.current = true;
      setIsAcw(false);
    } else if (hadConnectedRef.current) {
      // Ligne raccrochée après avoir été connectée : bascule en ACW
      hadConnectedRef.current = false;
      setIsAcw(true);
    }
  }, [isConnected]);

  // Quand une vague redémarre ou que le mode Power est coupé, quitter l'ACW
  useEffect(() => {
    if (isWaveActive || !powerOn) {
      setIsAcw(false);
      hadConnectedRef.current = false;
    }
  }, [isWaveActive, powerOn]);

  const notifyLogged = useCallback(() => {
    setIsAcw(false);
    hadConnectedRef.current = false;
  }, []);

  // Vue modèle pure dérivée sur les VRAIS booléens du pool (Grok note c : pas d'assert au render)
  const powerViewModel = useMemo(() => {
    return derivePowerViewModel(
      {
        powerOn,
        powerAvailable,
        hasConnectedLine: isConnected,
        isAcw,
        isRunning: isWaveActive,
        hangupRetryable: pool.hangupRetryable,
      },
      {
        hasPriorWave: hasAttempted,
        readyCount: projectedQueue.readyCount,
      },
    );
  }, [
    powerOn,
    powerAvailable,
    isConnected,
    isAcw,
    isWaveActive,
    pool.hangupRetryable,
    hasAttempted,
    projectedQueue.readyCount,
  ]);

  // Sortie transactionnelle I10 : intercepte Quitter pendant une vague
  const [isPendingExit, setIsPendingExit] = useState(false);
  const pendingExitRef = useRef(false);

  const requestExit = useCallback(() => {
    // I10 correctif B2 Opus : ne JAMAIS quitter si un raccrochage serveur est en échec connu
    if (pool.hangupRetryable) {
      setIsPendingExit(false);
      return;
    }
    if (isWaveActive || pool.state.running) {
      pendingExitRef.current = true;
      setIsPendingExit(true);
      pool.hangupAll();
      return;
    }
    onBack();
  }, [isWaveActive, pool, onBack]);

  // Surveillance de la séquence hangup pour la sortie transactionnelle
  useEffect(() => {
    if (!pendingExitRef.current) return;

    if (pool.hangupRetryable) {
      // Échec du raccrochage (confirmé serveur) : la sortie est bloquée, l'UI montre l'écran retry
      pendingExitRef.current = false;
      setIsPendingExit(false);
      return;
    }

    // La confirmation 200 est OBSERVÉE (le pool a terminé l'échange serveur et réinitialisé)
    // et non inférée : on exige l'absence d'erreur de raccrochage + arrêt réel du pool.
    const hangupFailed = Boolean(
      pool.state.error &&
        /raccrochage|hangup|raccrocher/i.test(String(pool.state.error)),
    );
    if (!isWaveActive && !pool.state.running && !hangupFailed) {
      // Raccrochage confirmé et propre : la sortie est sécurisée
      pendingExitRef.current = false;
      setIsPendingExit(false);
      onBack();
    }
  }, [isWaveActive, pool.state.running, pool.state.error, pool.hangupRetryable, onBack]);

  // Calcul du quota
  const limit = config?.entitlement.calls_day_limit ?? null;
  const used = config?.entitlement.calls_today ?? 0;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const quotaBlocked = remaining !== null && remaining === 0;
  const quotaConstrained =
    remaining !== null && (remaining < 8 || quotaBlocked);

  const quota = useMemo(
    () => ({
      used,
      limit,
      remaining,
      blocked: quotaBlocked,
      constrained: quotaConstrained,
    }),
    [used, limit, remaining, quotaBlocked, quotaConstrained],
  );

  // Actions utilisateur Power
  const onLaunch = useCallback(async () => {
    playComboSound('power-launch', { master: readSoundsEnabled() });
    setLaunching(true);
    clearTimeout(launchTimer.current ?? undefined);
    launchTimer.current = window.setTimeout(() => setLaunching(false), LAUNCH_MS);
    setIsAcw(false);
    hadConnectedRef.current = false;
    if (hasAttempted) {
      await pool.redial();
    } else {
      await pool.play();
    }
  }, [hasAttempted, pool]);

  const onHangupAll = pool.hangupAll;
  const onSkip = pool.skip;
  const onRetryHangup = pool.hangupAll;
  const togglePower = useCallback(() => {
    // Interdire la désactivation brutale en plein milieu d'une vague active
    if (powerOn && isWaveActive) return;
    setPowerOn((prev) => !prev);
  }, [powerOn, isWaveActive]);
  return {
    isPowerActive: powerViewModel.state !== 'off',
    powerOn,
    setPowerOn,
    togglePower,
    powerViewModel,
    projectedQueue,
    parallelism,
    setParallelism,
    callerNumber,
    setCallerNumber,
    callerNumbers,
    quota,
    lines: pool.state.lines,
    byPhone: projectedQueue.byPhone,
    error: pool.state.error,
    agentConnected: pool.agentConnected,
    launching,
    hasAttempted,
    onLaunch,
    onHangupAll,
    onSkip,
    onRetryHangup,
    notifyLogged,
    requestExit,
    isPendingExit,
  };
}
