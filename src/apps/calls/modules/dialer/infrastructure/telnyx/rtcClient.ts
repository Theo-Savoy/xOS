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
 */

export type RtcCallHandle = {
  hangup: (params?: unknown) => Promise<void> | void;
  /** Accès au RTCPeerConnection sous-jacent (lecture codec via getStats). */
  peer?: { instance?: RTCPeerConnection | null };
};

export type RtcClientHandle = {
  connect: () => Promise<void> | void;
  newCall: (opts: { destinationNumber: string; audio?: boolean | MediaTrackConstraints; remoteElement?: HTMLMediaElement | string; localElement?: HTMLMediaElement | string }) => RtcCallHandle;
  on: (event: string, cb: (data: unknown) => void) => void;
  disconnect: () => Promise<void> | void;
};

/** Constraints audio qualité (qualité 2026-08-04) : le SDK accepte un objet
 * MediaTrackConstraints au lieu de `audio: true` — on force le traitement
 * qualité du micro (annulation d'écho, suppression du bruit, AGC). */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Codec préféré G.722 (test 2026-08-04). Théo a raison sur le mécanisme :
 * si le navigateur parle G.722 avec Telnyx ET que l'opérateur du mobile
 * accepte G.722 sur l'interconnexion, il n'y a PAS de transcodage → la HD
 * (7 kHz) se propage jusqu'au mobile. En OPUS, Telnyx doit transcoder
 * OPUS→G.711 pour le PSTN → perte de large bande.
 * On part des codecs RÉELS du navigateur (objets valides pour
 * setCodecPreferences) et on réordonne : G722 d'abord, OPUS en fallback,
 * PCMU/PCMA en dernier recours.
 */
export function getPreferredCodecs(): Array<{ mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string }> | undefined {
  try {
    const caps = RTCRtpSender.getCapabilities?.('audio');
    const codecs = caps?.codecs?.filter((c) =>
      ['audio/g722', 'audio/opus', 'audio/pcmu', 'audio/pcma'].includes(c.mimeType.toLowerCase()),
    );
    if (!codecs || codecs.length === 0) return undefined;
    const order = ['audio/g722', 'audio/opus', 'audio/pcmu', 'audio/pcma'];
    const sorted = [...codecs].sort(
      (a, b) =>
        order.indexOf(a.mimeType.toLowerCase()) - order.indexOf(b.mimeType.toLowerCase()),
    );
    return sorted as Array<{ mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string }>;
  } catch {
    return undefined; // capabilities indisponibles : on laisse le défaut SDK
  }
}

export async function createRtcClient(token: string | null): Promise<RtcClientHandle | null> {
  if (!token) return null; // dry-run : le serveur n'a rien émis
  const { TelnyxRTC } = await import('@telnyx/webrtc');
  const client = new TelnyxRTC({ login_token: token });
  return client as unknown as RtcClientHandle;
}
