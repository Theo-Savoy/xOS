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
};

export type RtcClientHandle = {
  connect: () => Promise<void> | void;
  newCall: (opts: { destinationNumber: string; audio?: boolean | MediaTrackConstraints; remoteElement?: HTMLMediaElement | string; localElement?: HTMLMediaElement | string; preferred_codecs?: Array<{ mimeType: string }> }) => RtcCallHandle;
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

/** Codecs préférés : OPUS en premier (qualité 2026-08-04). Le SDK 2.27.8
 * expose `preferred_codecs?: RTCRtpCodecCapability[]` dans ICallOptions — on
 * force la négociation sur OPUS (adaptatif, tolérant aux pertes) au lieu de
 * retomber sur G.711 (64 kbps fixe, qualité téléphone). */
export const PREFERRED_CODECS: Array<{ mimeType: string }> = [
  { mimeType: 'audio/opus' },
  { mimeType: 'audio/PCMU' },
  { mimeType: 'audio/PCMA' },
];

export async function createRtcClient(token: string | null): Promise<RtcClientHandle | null> {
  if (!token) return null; // dry-run : le serveur n'a rien émis
  const { TelnyxRTC } = await import('@telnyx/webrtc');
  const client = new TelnyxRTC({ login_token: token });
  return client as unknown as RtcClientHandle;
}
