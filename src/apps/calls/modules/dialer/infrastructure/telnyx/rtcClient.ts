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
 * Codec OPUS bitrate haut (2026-08-04). OPUS par défaut peut négocier en bas
 * débit (32 kbps). On part des codecs RÉELS du navigateur (setCodecPreferences
 * exige des objets valides : mimeType+clockRate+payloadType doivent matcher)
 * et on réécrit le sdpFmtpLine OPUS avec maxaveragebitrate=128000 + stéréo.
 * NOTE : ce levier agit sur le leg navigateur→Telnyx. L'audio final côté PSTN
 * (téléphone) reste plafonné G.711 8kHz — c'est la limite du réseau télécom.
 */
export function getHighBitrateCodecs(): Array<{ mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string }> | undefined {
  try {
    const caps = RTCRtpSender.getCapabilities?.('audio');
    const codecs = caps?.codecs?.filter((c) =>
      c.mimeType.toLowerCase() === 'audio/opus' ||
      c.mimeType.toLowerCase() === 'audio/pcmu' ||
      c.mimeType.toLowerCase() === 'audio/pcma',
    );
    if (!codecs || codecs.length === 0) return undefined;
    return codecs.map((c) => {
      if (c.mimeType.toLowerCase() === 'audio/opus') {
        // maxaveragebitrate=128000 + stéréo + FEC (résilience pertes)
        const base = c.sdpFmtpLine ?? 'minptime=10;useinbandfec=1';
        const fmtp = base.includes('maxaveragebitrate')
          ? base.replace(/maxaveragebitrate=\d+/, 'maxaveragebitrate=128000')
          : `${base};maxaveragebitrate=128000`;
        const withStereo = fmtp.includes('stereo') ? fmtp : `${fmtp};stereo=1`;
        return { ...c, sdpFmtpLine: withStereo };
      }
      return c;
    }) as Array<{ mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string }>;
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
