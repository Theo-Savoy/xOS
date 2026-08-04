/**
 * infrastructure/telnyx/rtcClient.ts — client WebRTC Telnyx (browser = phone).
 *
 * Audit 11.2 B.5 (G2) : le dry-run est appliqué CÔTÉ SERVEUR en n'émettant
 * pas de token. Ici, token null ⇒ client null ⇒ la vue reste en mode
 * simulation : zéro paquet ne part vers rtc.telnyx.com, et il est impossible
 * de transformer la simulation en vrai appel depuis le navigateur.
 *
 * Import dynamique : @telnyx/webrtc n'est chargé que lorsqu'un vrai token
 * existe. (eslint restreint l'import à ce dossier — G8.)
 *
 * API SDK 2.27.8 : le hangup vit sur le Call retourné par newCall(), pas sur
 * le client. Le client expose on('telnyx.notification'|'telnyx.error') et
 * disconnect().
 *
 * Ce fichier est la SEULE frontière SDK du module (eslint G8) : les helpers
 * partagés entre useRtcCall (mono-ligne) et useDialerPool (multi-lignes)
 * vivent ici — mapping d'états, extraction d'erreurs, raccrochage sûr.
 */

export type RtcCallHandle = {
  hangup: (params?: unknown) => Promise<void> | void;
  /** Accès au RTCPeerConnection sous-jacent (lecture codec via getStats). */
  peer?: { instance?: RTCPeerConnection | null };
};

type RtcCodec = {
  mimeType: string;
  clockRate: number;
  channels?: number;
  payloadType?: number;
  sdpFmtpLine?: string;
};

export type RtcClientHandle = {
  connect: () => Promise<void> | void;
  newCall: (opts: {
    id?: string;
    destinationNumber: string;
    callerNumber?: string;
    audio?: boolean | MediaTrackConstraints;
    remoteElement?: HTMLMediaElement | string;
    localElement?: HTMLMediaElement | string;
    preferred_codecs?: RtcCodec[];
  }) => RtcCallHandle;
  on: (event: string, cb: (data: unknown) => void) => void;
  // Pas de `off` : le SDK n'en expose pas de fiable selon les versions/mocks.
  // Les listeners d'un client abandonné sont neutralisés par la garde
  // d'identité `onLive` (useRtcCall §8.1), pas par un désabonnement.
  disconnect: () => Promise<void> | void;
};

/** Constraints audio qualité (2026-08-04) : le SDK accepte un objet
 * MediaTrackConstraints au lieu de `audio: true` — on force le traitement
 * qualité du micro (annulation d'écho, suppression du bruit, AGC). */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/** États SDK Telnyx 2.27.8 → vocabulaire commun. null = état inconnu :
 *  l'appelant NE DOIT PAS toucher sa machine à états (fix audit 11.3 B3). */
export type TelnyxPhase = 'dialing' | 'ringing' | 'connected' | 'held' | 'ended';

export function telnyxPhase(state?: string): TelnyxPhase | null {
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
      return 'held';
    case 'hangup':
    case 'destroy':
      return 'ended';
    default:
      return null; // état inconnu : ne pas toucher à la phase
  }
}

/** Payload des notifications SDK (union des champs observés sur les deux
 *  hooks). event? n'est jamais lu — retiré. */
export type TelnyxNotification = {
  call?: { state?: string; callState?: string; callId?: string; id?: string };
};

export const notifState = (n: TelnyxNotification) => n.call?.state ?? n.call?.callState;
export const notifCallId = (n: TelnyxNotification) => n.call?.callId ?? n.call?.id;

/** Message utilisateur à partir d'une erreur SDK (extraction identique dans
 *  les deux hooks). */
export function telnyxErrorMessage(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e
    ? String((e as { message: unknown }).message)
    : 'Erreur WebRTC Telnyx.';
}

/** Raccroche sans jamais throw (les deux hooks ×6 copies). */
export function safeHangup(call: RtcCallHandle | null | undefined): void {
  try {
    call?.hangup();
  } catch {
    /* déjà raccroché */
  }
}

/** Déconnecte sans jamais throw. */
export function safeDisconnect(client: RtcClientHandle | null | undefined): void {
  try {
    client?.disconnect();
  } catch {
    /* socket déjà fermé */
  }
}

/** Codecs préférés : G.722 d'abord (pas de transcodage vers le PSTN → HD
 *  jusqu'au mobile), OPUS en fallback. Verdict lot 11.4 :
 *  docs/audits/lot-11.4-bitrate-investigation.md */
function getPreferredCodecs(): RtcCodec[] | undefined {
  try {
    const caps = RTCRtpSender.getCapabilities?.('audio');
    const codecs = caps?.codecs?.filter((c) =>
      ['audio/g722', 'audio/opus', 'audio/pcmu', 'audio/pcma'].includes(c.mimeType.toLowerCase()),
    );
    if (!codecs || codecs.length === 0) return undefined;
    const order = ['audio/g722', 'audio/opus', 'audio/pcmu', 'audio/pcma'];
    return [...codecs].sort(
      (a, b) =>
        order.indexOf(a.mimeType.toLowerCase()) - order.indexOf(b.mimeType.toLowerCase()),
    ) as RtcCodec[];
  } catch {
    return undefined; // capabilities indisponibles : on laisse le défaut SDK
  }
}

/** Options newCall communes (qualité audio + codec préféré + sortie audio).
 *  `remoteSelector` : sélecteur de l'élément <audio> où le SDK attache le
 *  flux distant — sans lui l'appel part mais on n'entend rien (fix B2 audit
 *  11.3). */
export function newCallOptions(
  destinationNumber: string,
  remoteSelector: string,
  extra?: Partial<Parameters<RtcClientHandle['newCall']>[0]>,
): Parameters<RtcClientHandle['newCall']>[0] {
  const codecs = getPreferredCodecs(); // un seul appel
  const audioEl = document.querySelector<HTMLAudioElement>(remoteSelector);
  return {
    destinationNumber,
    audio: AUDIO_CONSTRAINTS,
    ...(codecs ? { preferred_codecs: codecs } : {}),
    ...(audioEl ? { remoteElement: audioEl } : {}),
    ...extra,
  };
}

export async function createRtcClient(token: string | null): Promise<RtcClientHandle | null> {
  if (!token) return null; // dry-run : le serveur n'a rien émis
  const { TelnyxRTC } = await import('@telnyx/webrtc');
  const client = new TelnyxRTC({ login_token: token });
  return client as unknown as RtcClientHandle;
}
