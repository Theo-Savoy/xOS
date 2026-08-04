/**
 * application/useRtcCall.ts — hook WebRTC mono-ligne : le navigateur devient
 * le téléphone.
 *
 * Audit 11.2 B.3/B.4/B.5 :
 * - Ordre : micro D'ABORD (sur le geste utilisateur), puis token, puis dial.
 *   On ne compose JAMAIS avant d'avoir le micro — le prospect ne sonne pas
 *   pendant qu'une popup de permission bloque l'agent.
 * - Dry-run = token null ⇒ client null ⇒ simulation (aucun paquet vers
 *   rtc.telnyx.com, impossible à transformer en vrai appel — G2).
 * - CONFORMITÉ ARCEP (B.6) : PAS d'enchaînement automatique après hangup.
 *   La machine va en 'wrapping' puis 'idle'. Elle ne compose JAMAIS le contact
 *   suivant. Un humain déclenche chaque appel explicitement (2022-1583 §7.1.3).
 * - Le SDK pilote l'UI ; les webhooks piloteront le registre (Phase B).
 *
 * Simulation mono-ligne (démo). Le pool a sa propre simulation, voir
 * useDialerPool.startDemoSimulation — les timings diffèrent volontairement
 * (1,5s/30s ici, 300ms/2s/10s là-bas).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallPhase } from '../domain/CallState';
import {
  newCallOptions,
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

/** Qualité de l'appel en cours. mos/jitter/rtt : telnyx.stats.frame.
 *  codec : lu via pc.getStats() (absent du frame SDK). rttMs alimenté mais
 *  jamais affiché — conservé pour diagnostic console. */
export type CallStats = {
  mos: number;
  codec?: string;
  jitterMs?: number;
  rttMs?: number;
};

export type UseRtcCallResult = {
  phase: CallPhase;
  error: string | null;
  durationSec: number;
  destination: string;
  callStats: CallStats | null;
  startCall: (to: string, callerNumber?: string) => Promise<boolean>;
  hangup: () => void;
  isActive: boolean;
};

/** Mapping telnyxPhase (SDK) → CallPhase (produit mono-ligne). Le contrat
 *  « inconnu ⇒ null ⇒ ne pas bouger » est défini dans telnyxPhase (fix
 *  audit 11.3 B3). */
const PHASE_FROM_TELNYX: Record<string, CallPhase> = {
  dialing: 'dialing',
  ringing: 'ringing',
  connected: 'connected',
  held: 'on_hold',
  ended: 'ended',
};

/**
 * Lit le codec audio ACTIF depuis RTCPeerConnection.getStats() — la source de
 * vérité WebRTC (le stats.frame du SDK ne contient pas le codec). Appelé quand
 * l'appel devient connected. (Diagnostic qualité 2026-08-04.)
 */
function readCodecFromPeer(call: RtcCallHandle | null, onCodec: (codec: string) => void): void {
  try {
    const pc = call?.peer?.instance;
    if (!pc) return;
    void pc.getStats().then((stats) => {
      let codecName: string | null = null;
      stats.forEach((report) => {
        if (report.type === 'codec' && report.mimeType?.toLowerCase().includes('audio/')) {
          codecName = String(report.mimeType);
        }
      });
      if (codecName) onCodec(codecName);
    }).catch(() => {
      /* lecture stats facultative */
    });
  } catch {
    /* peer non accessible : on garde le défaut */
  }
}

export function useRtcCall({ token, dryRun }: { token: string; dryRun: boolean }) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [destination, setDestination] = useState('');
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const clientRef = useRef<RtcClientHandle | null>(null);
  const callRef = useRef<RtcCallHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<CallPhase>('idle');

  const setPhaseSafe = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearDialTimeout = useCallback(() => {
    if (dialTimeoutRef.current) {
      clearTimeout(dialTimeoutRef.current);
      dialTimeoutRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDurationSec(0);
  }, []);

  const clearSimTimers = useCallback(() => {
    simTimersRef.current.forEach((t) => clearTimeout(t));
    simTimersRef.current = [];
  }, []);

  /**
   * Abandonne le client courant. Les refs sont vidées AVANT le disconnect :
   * le SDK émet `telnyx.socket.close` en fermant, et ce handler ferait passer
   * l'appel en 'failed' alors qu'on ferme volontairement. Les listeners du
   * client abandonné se désarment tout seuls (cf. `onLive` dans startCall) —
   * le SDK n'expose pas de `off()` fiable côté mocks/versions.
   */
  const dropClient = useCallback(() => {
    const client = clientRef.current;
    const call = callRef.current;
    clientRef.current = null;
    callRef.current = null;
    safeHangup(call);
    safeDisconnect(client);
  }, []);

  // Nettoyage à la sortie de la vue : raccrocher + fermer le socket.
  useEffect(() => {
    return () => {
      clearDialTimeout();
      clearSimTimers();
      stopTimer();
      dropClient();
    };
  }, [clearDialTimeout, clearSimTimers, stopTimer, dropClient]);

  /** Branche simulation (dry-run, client null) : machine à états sur timers,
   *  aucun média réel, aucun paquet réseau (G2). Raccrochage simulé à 30s max
   *  (démo) — jamais automatique en dessous, JAMAIS d'appel suivant. */
  const runSimulation = useCallback((stream: MediaStream): boolean => {
    clearSimTimers();
    setPhaseSafe('ringing');
    simTimersRef.current.push(
      setTimeout(() => setPhaseSafe('connected'), 1500),
    );
    timerRef.current = setInterval(() => {
      setDurationSec((s) => s + 1);
    }, 1000);
    simTimersRef.current.push(
      setTimeout(() => {
        setPhaseSafe('wrapping');
        stopTimer();
        simTimersRef.current.push(setTimeout(() => setPhaseSafe('idle'), 2000));
      }, 30000),
    );
    stream.getTracks().forEach((t) => t.stop());
    return true;
  }, [clearSimTimers, setPhaseSafe, stopTimer]);

  /**
   * Câble les événements du SDK sur la machine à états. Sorti de startCall
   * (qui garde ainsi une lecture linéaire : garde → micro → token → client →
   * écoute → connect). Aucun changement de comportement : même ordre, même
   * garde onLive.
   */
  const attachSdkListeners = useCallback(
    (client: RtcClientHandle, to: string, callerNumber?: string) => {
      const onLive = (event: string, cb: (data: unknown) => void) => {
        client.on(event, (data) => {
          if (clientRef.current === client) cb(data);
        });
      };

      onLive('telnyx.ready', () => {
        try {
          // callerNumber = caller ID choisi dans le sélecteur (peut être le
          // mobile vérifié — Telnyx l'autorise pour un dial sortant humain).
          const call = client.newCall(
            newCallOptions(to, 'audio[data-rtc-remote]', {
              ...(callerNumber ? { callerNumber } : {}),
            }),
          );
          callRef.current = call;
        } catch (e) {
          setPhaseSafe('failed');
          setError(telnyxErrorMessage(e));
        }
      });
      onLive('telnyx.notification', (data) => {
        const n = data as TelnyxNotification;
        const s = notifState(n);
        // B3 (audit 11.3) : les notifications sans état d'appel (vertoClientReady,
        // userMediaError, peerConnectionFailureError…) ne doivent PAS toucher la
        // machine à états — sinon l'UI bascule en « Terminé » dès la connexion.
        if (!s) {
          // Diagnostic VOLONTAIRE (fix 11.3 B3) : trace les notifications sans
          // état pour comprendre ce que le SDK envoie réellement.
          console.debug('[rtc] notification sans état:', n);
          return;
        }
        const telnyxPhaseValue = telnyxPhase(s);
        const p = telnyxPhaseValue ? PHASE_FROM_TELNYX[telnyxPhaseValue] : undefined;
        if (!p) {
          // État SDK non reconnu : ne pas prétendre que l'appel est fini.
          console.debug('[rtc] état SDK non mappé:', s, n);
          return;
        }
        if (p === 'connected') {
          timerRef.current = setInterval(() => {
            setDurationSec((sec) => sec + 1);
          }, 1000);
          // Lecture du codec actif (source de vérité : getStats du peer).
          // Le stats.frame du SDK ne contient pas le codec — on le lit ici.
          void readCodecFromPeer(callRef.current, (codec) => {
            setCallStats((prev) => ({ ...(prev ?? { mos: 0 }), codec }));
          });
        }
        if (p === 'ended') {
          stopTimer();
        }
        setPhaseSafe(p);
      });
      onLive('telnyx.socket.close', () => {
        stopTimer();
        if (phaseRef.current === 'connected' || phaseRef.current === 'dialing') {
          // Le socket s'est fermé pendant un appel/composition : c'est un échec
          // réseau (token refusé, session expirée, coupure). On le dit — pas de
          // silence.
          setError('Connexion WebRTC perdue (socket fermé) — vérifie le token et réessaie.');
          setPhaseSafe('failed');
        }
      });
      onLive('telnyx.error', (e) => {
        setError(telnyxErrorMessage(e));
        setPhaseSafe('failed');
      });

      // Stats qualité (diagnostic 2026-08-04) : le SDK émet telnyx.stats.frame
      // avec MOS/jitter/RTT. Le frame est ENVELOPPÉ dans { data: payload } et
      // NE CONTIENT PAS le codec — celui-ci est lu via pc.getStats()
      // (readCodecFromPeer).
      onLive('telnyx.stats.frame', (raw) => {
        try {
          const frame = raw as {
            data?: {
              jitter?: number; rtt?: number; mos?: number; quality?: string;
              inboundAudio?: { codec?: string; codecName?: string };
              remoteInboundAudio?: { codec?: string; codecName?: string };
            };
          };
          const d = frame.data ?? (frame as { jitter?: number; rtt?: number; mos?: number });
          if (d && (typeof d.jitter === 'number' || typeof d.mos === 'number')) {
            setCallStats((prev) => ({
              mos: typeof d.mos === 'number' ? d.mos : (prev?.mos ?? 0),
              codec: prev?.codec,
              jitterMs: typeof d.jitter === 'number' ? d.jitter : prev?.jitterMs,
              rttMs: typeof d.rtt === 'number' ? d.rtt : prev?.rttMs,
            }));
          }
        } catch {
          /* stats facultatives : ne pas casser l'appel */
        }
      });
    },
    [setPhaseSafe, stopTimer],
  );

  /**
   * Lance un appel. C'est le SEUL point d'entrée d'un appel (humain, explicite).
   * Retourne true si l'appel est parti, false si bloqué avant (micro refusé…).
   * callerNumber : identifiant appelant affiché (sélecteur Phase A).
   */
  const startCall = useCallback(
    async (to: string, callerNumber?: string): Promise<boolean> => {
      if (phaseRef.current === 'dialing' || phaseRef.current === 'connected') {
        return false; // garde synchrone anti-double-dial
      }
      setError(null);
      setPhaseSafe('dialing');
      setDestination(to);

      // §8.1 (audit 11.13) : un appel précédent peut avoir laissé un client
      // connecté (le prospect a raccroché sans passer par hangup()). On le
      // déconnecte AVANT d'en créer un nouveau — sinon le client n°1 reste
      // abonné et ses handlers peuvent écraser l'état de l'appel n°2.
      // Même famille : le timeout de diagnostic 20 s de l'appel précédent
      // ferait passer CET appel en failed s'il est encore armé — et les timers
      // de simulation / de sortie de wrapping (retour à 'idle' à 1,5 s / 2 s)
      // écraseraient sa phase. On purge les deux.
      clearDialTimeout();
      clearSimTimers();
      dropClient();

      // 1. Micro D'ABORD, sur le geste utilisateur (B.4).
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setPhaseSafe('failed');
        setError('Micro refusé — impossible d’appeler sans micro.');
        return false;
      }

      // 2. Token WebRTC (le serveur n'en émet pas en dry-run — G2).
      // B7 : on transmet le caller_number choisi pour validation serveur.
      let rtcToken: string | null = null;
      try {
        const res = await fetchRtcToken(token, callerNumber);
        rtcToken = res.token;
      } catch (e) {
        // Pas de token : si on est en dry-run c'est normal (simulation),
        // sinon c'est une erreur.
        if (!dryRun) {
          setPhaseSafe('failed');
          setError(telnyxErrorMessage(e));
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
      }

      // 3. Client — null en dry-run ⇒ simulation sans réseau (G2).
      const client = await createRtcClient(rtcToken);
      clientRef.current = client;

      if (!client) {
        return runSimulation(stream);
      }

      // 4. Réel : brancher le micro, écouter les événements, composer.
      // B1 (audit 11.3) : le constructeur NE connecte PAS — sans connect()
      // le socket n'ouvre jamais, telnyx.ready ne fire pas, l'appel ne part
      // pas. On enregistre les listeners PUIS on connecte.
      //
      // §8.1 (audit 11.13) : tout listener passe par onLive. Dès que ce client
      // n'est plus LE client courant (appel suivant, hangup, unmount), ses
      // événements sont ignorés — sinon un socket.close tardif du client
      // abandonné fait échouer l'appel en cours.
      attachSdkListeners(client, to, callerNumber);

      // B4 (audit 11.3) : stopper le stream de pré-vol — le SDK gère son propre
      // getUserMedia via audio:true. Évite la double capture et le voyant micro
      // qui reste allumé après raccrochage.
      stream.getTracks().forEach((t) => t.stop());

      // B1 : connecter APRÈS l'enregistrement des listeners.
      try {
        await client.connect();
      } catch (e) {
        setPhaseSafe('failed');
        setError(telnyxErrorMessage(e));
        return false;
      }

      // Timeout de diagnostic : si après 20 s on est toujours en dialing sans
      // ringing/connected (telnyx.ready n'a pas fire, newCall pas exécuté), on
      // le dit au lieu de rester bloqué silencieusement sur « Composition… ».
      dialTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'dialing') {
          setError(
            'Aucune réponse du serveur WebRTC après 20 s — token refusé ou réseau bloqué. Vérifie la console navigateur.',
          );
          setPhaseSafe('failed');
        }
      }, 20000);
      return true;
    },
    [token, dryRun, setPhaseSafe, clearDialTimeout, clearSimTimers, runSimulation, dropClient, attachSdkListeners],
  );

  /** Raccrochage explicite (bouton Raccrocher — demande Théo). */
  const hangup = useCallback(() => {
    clearDialTimeout();
    clearSimTimers();
    stopTimer();
    dropClient();
    setPhaseSafe('wrapping');
    // Pas d'auto-next : on reste en wrapping, l'humain décide la suite.
    simTimersRef.current.push(setTimeout(() => setPhaseSafe('idle'), 1500));
  }, [setPhaseSafe, stopTimer, clearDialTimeout, clearSimTimers, dropClient]);

  return {
    phase,
    error,
    durationSec,
    destination,
    callStats,
    startCall,
    hangup,
    isActive:
      phase === 'dialing' || phase === 'ringing' || phase === 'connected' || phase === 'on_hold',
  };
}
