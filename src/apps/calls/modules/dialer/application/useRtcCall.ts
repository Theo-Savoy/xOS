/**
 * application/useRtcCall.ts — hook WebRTC : le navigateur devient le téléphone.
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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallPhase } from '../domain/CallState';
import { createRtcClient, type RtcClientHandle, type RtcCallHandle } from '../infrastructure/telnyx/rtcClient';
import { fetchRtcToken } from '../dialerApi';

export type RtcCallStatus = {
  phase: CallPhase;
  error: string | null;
  durationSec: number;
};

type TelnyxNotification = {
  call?: { state?: string; callId?: string; callState?: string };
  event?: string;
};

function phaseFromTelnyx(state?: string): CallPhase {
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
    case 'held':
      return 'on_hold';
    case 'hangup':
    case 'destroy':
      return 'ended';
    default:
      return 'idle';
  }
}

export function useRtcCall({ token, dryRun }: { token: string; dryRun: boolean }) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const clientRef = useRef<RtcClientHandle | null>(null);
  const callRef = useRef<RtcCallHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<CallPhase>('idle');

  const setPhaseSafe = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDurationSec(0);
  }, []);

  // Nettoyage à la sortie de la vue : raccrocher + fermer le socket.
  useEffect(() => {
    return () => {
      stopTimer();
      try {
        callRef.current?.hangup();
      } catch {
        /* déjà raccroché */
      }
      try {
        clientRef.current?.disconnect();
      } catch {
        /* socket déjà fermé */
      }
      clientRef.current = null;
      callRef.current = null;
    };
  }, [stopTimer]);

  /**
   * Lance un appel. C'est le SEUL point d'entrée d'un appel (humain, explicite).
   * Retourne true si l'appel est parti, false si bloqué avant (micro refusé…).
   * callerNumber : identifiant appelant affiché (sélecteur Phase A).
   */
  const startCall = useCallback(
    async (destination: string, callerNumber?: string): Promise<boolean> => {
      if (phaseRef.current === 'dialing' || phaseRef.current === 'connected') {
        return false; // garde synchrone anti-double-dial
      }
      setError(null);
      setPhaseSafe('dialing');

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
          setError(e instanceof Error ? e.message : 'Token WebRTC indisponible.');
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
      }

      // 3. Client — null en dry-run ⇒ simulation sans réseau (G2).
      const client = await createRtcClient(rtcToken);
      clientRef.current = client;

      if (!client) {
        // Mode simulation : machine à états sur timers, aucun média réel.
        setPhaseSafe('ringing');
        const sim = setTimeout(() => setPhaseSafe('connected'), 1500);
        timerRef.current = setInterval(() => {
          setDurationSec((s) => s + 1);
        }, 1000);
        // Raccrochage simulé au bout de 30 s max (démo) — jamais automatique
        // en dessous, et surtout JAMAIS d'appel suivant.
        const end = setTimeout(() => {
          setPhaseSafe('wrapping');
          clearInterval(timerRef.current as unknown as number);
          timerRef.current = null;
          setTimeout(() => setPhaseSafe('idle'), 2000);
        }, 30000);
        // On garde la référence pour le bouton Raccrocher.
        (sim as unknown as { _end?: ReturnType<typeof setTimeout> })._end = end;
        stream.getTracks().forEach((t) => t.stop());
        return true;
      }

      // 4. Réel : brancher le micro, écouter les événements, composer.
      // B1 (audit 11.3) : le constructeur NE connecte PAS — sans connect()
      // le socket n'ouvre jamais, telnyx.ready ne fire pas, l'appel ne part
      // pas. On enregistre les listeners PUIS on connecte.
      client.on('telnyx.ready', () => {
        try {
          // callerNumber = caller ID choisi dans le sélecteur (peut être le
          // mobile vérifié — Telnyx l'autorise pour un dial sortant humain).
          // remoteElement : élément <audio> où le SDK attache le flux distant —
          // SANS lui, l'appel part mais on n'entend RIEN côté navigateur.
          const audioEl = document.querySelector<HTMLAudioElement>('audio[data-rtc-remote]');
          const call = client.newCall({
            destinationNumber: destination,
            audio: true,
            ...(callerNumber ? { callerNumber } : {}),
            ...(audioEl ? { remoteElement: audioEl } : {}),
          });
          callRef.current = call;
        } catch (e) {
          setPhaseSafe('failed');
          setError(e instanceof Error ? e.message : 'Échec du dial WebRTC.');
        }
      });
      client.on('telnyx.notification', (data) => {
        const n = data as TelnyxNotification;
        const s = n?.call?.state ?? n?.call?.callState;
        // B3 (audit 11.3) : les notifications sans état d'appel (vertoClientReady,
        // userMediaError, peerConnectionFailureError…) ne doivent PAS toucher la
        // machine à états — sinon l'UI bascule en « Terminé » dès la connexion.
        if (!s) return;
        const p = phaseFromTelnyx(s);
        if (p === 'connected') {
          timerRef.current = setInterval(() => {
            setDurationSec((sec) => sec + 1);
          }, 1000);
        }
        if (p === 'ended' || p === 'failed') {
          stopTimer();
        }
        setPhaseSafe(p === 'idle' ? 'ended' : p);
      });
      client.on('telnyx.socket.close', () => {
        stopTimer();
        if (phaseRef.current === 'connected' || phaseRef.current === 'dialing') {
          setPhaseSafe('ended');
        }
      });
      client.on('telnyx.error', (e) => {
        const msg = e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Erreur WebRTC Telnyx.';
        setError(msg);
        setPhaseSafe('failed');
      });

      // B4 (audit 11.3) : stopper le stream de pré-vol — le SDK gère son propre
      // getUserMedia via audio:true. Évite la double capture et le voyant micro
      // qui reste allumé après raccrochage.
      stream.getTracks().forEach((t) => t.stop());

      // B1 : connecter APRÈS l'enregistrement des listeners.
      try {
        await client.connect();
      } catch (e) {
        setPhaseSafe('failed');
        setError(e instanceof Error ? e.message : 'Connexion WebRTC refusée.');
        return false;
      }
      return true;
    },
    [token, dryRun, setPhaseSafe, stopTimer],
  );

  /** Raccrochage explicite (bouton Raccrocher — demande Théo). */
  const hangup = useCallback(() => {
    stopTimer();
    try {
      callRef.current?.hangup();
    } catch {
      /* déjà raccroché */
    }
    try {
      clientRef.current?.disconnect();
    } catch {
      /* socket déjà fermé */
    }
    setPhaseSafe('wrapping');
    // Pas d'auto-next : on reste en wrapping, l'humain décide la suite.
    const wrap = setTimeout(() => setPhaseSafe('idle'), 1500);
    (wrap as unknown as { _unref?: () => void })._unref?.();
  }, [setPhaseSafe, stopTimer]);

  return {
    phase,
    error,
    durationSec,
    startCall,
    hangup,
    isActive: phase === 'dialing' || phase === 'ringing' || phase === 'connected' || phase === 'on_hold',
  };
}
