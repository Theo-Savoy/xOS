# Lot 11.4 — Enquête « bitrate audio très bas » (Telnyx WebRTC)

Source : `GET /v2/voice_sdk_call_reports/{call_id}`, 2 appels réels du 2026-08-03.
Analyse : 65 + 46 snapshots, champs `audio.inbound/outbound.bitrateAvg`, `ice`, `codec`.

## Verdict en une ligne

**Le « 13 kbps » n'existe pas.** C'est une erreur de calcul. Le bitrate entrant réel est
**63,8 kbps (G.722)** et **31 kbps médian / 53 kbps en pointe (OPUS)**. Le vrai problème de
qualité est **la latence** (RTT 470–500 ms) et **la boucle acoustique de l'auto-appel**.

## 1. L'artefact des 13 kbps — démonté

`summary.clientSummary.callReports.intervalMs = 5000` est l'intervalle de **flush** du SDK,
pas le pas des snapshots. Les `intervalStartUtc` réels sont espacés de **1,003 s**.

| Calcul | G.722 | OPUS |
|---|---|---|
| delta `bytesReceived` ÷ **5 s** (faux) | 12,8 kbps | 6,2 kbps |
| delta `bytesReceived` ÷ **1 s** (juste) | 64,0 kbps | 31,0 kbps |
| `bitrateAvg` rapporté par Telnyx | 63,8 kbps | 30,9 kbps |

12,8 ≈ 13 : la division par 5 explique exactement l'écart. Le champ `bitrateAvg` était déjà
présent dans les snapshots, il n'y avait pas besoin de le recalculer.

## 2. Bitrate réel, parole vs silence

**G.722** (appel 31d7c1bd, 23:00) : `inBitrate` = 63,8 kbps médian, min 58,7 / max 70,6 sur
les 65 snapshots. **Plat, aucune modulation** — G.722 est CBR sans VAD/DTX côté Telnyx.
Émission symétrique : 63,8 kbps, `targetBitrate = 64000`.

**OPUS** (appel fa3acff4, 22:33) : `inBitrate` module clairement avec la parole —
11,8 kbps en silence (`audioLevelAvg ≈ 0.0000`) → 47–53 kbps sur les fenêtres de parole
(t = 15–27 s, `audioLevelAvg` 0,08–0,51). Médiane 30,9 kbps. Émission : 23,5 kbps médian,
`targetBitrate = 32000` (défaut Chromium). Comportement normal.

**Zéro perte** sur les deux appels : `packetsLost = 0`, `packetsDiscarded = 0`.
Concealment = 1,07 % (G.722) / 1,18 % (OPUS) des échantillons — négligeable.

→ **Aucun plafonnement de bitrate.** Hypothèses (b) et (d) écartées.

## 3. fmtp négocié

OPUS entrant **et** sortant : `sdpFmtpLine = "minptime=10;useinbandfec=1"`, `channels: 2`,
`clockRate: 48000`. **Pas de `maxaveragebitrate`, pas de `stereo=1`** — cohérent avec le
revert de 0542174 par 2b61c1c. `useinbandfec=1` est actif (jusqu'à 907 paquets FEC reçus).

Poser `maxaveragebitrate` ne servirait à rien : la source est une jambe **PSTN en 8 kHz**.
Encoder du 8 kHz à 128 kbps ne crée pas d'information. Hypothèse (b) définitivement écartée.

## 4. Transport ICE

Paire sélectionnée identique sur les deux appels : **local `srflx` (88.188.9.8, wifi) ↔
remote `host` (185.246.41.185/190, Telnyx fr5-prod)**, UDP, `state: succeeded`,
`selectedCandidatePairChanges = 1`. **Pas de TURN relay.** Chemin média direct, optimal.
Hypothèse (d) écartée.

## 5. Ce qui dégrade réellement la qualité

**a) Latence réseau — le vrai coupable.**

| | G.722 | OPUS |
|---|---|---|
| RTT ICE début d'appel | **31 ms** | 118 ms |
| RTT ICE médian | 473 ms | 282 ms |
| RTT ICE max | 505 ms | 514 ms |

Sur l'appel G.722, le RTT est à 31–63 ms jusqu'à t = 21 s, puis **saute à 501 ms à t = 22 s
et n'en redescend jamais**. Ce n'est pas Telnyx (le serveur média est en France, 31 ms au
départ le prouve) : c'est le lien Wi-Fi/FAI qui se sature en cours d'appel — bufferbloat.

**b) Jitter buffer qui explose (appel OPUS).** `jitterBufferTargetDelay` monte de 57 ms à
**238 ms** et y reste. Additionné au RTT, la latence bouche-à-oreille dépasse largement
500 ms : chevauchement de parole, effet « talkie-walkie ». Sur l'appel G.722 le buffer reste
sain (39 ms max, `jitterAvg` 1 ms) — G.722 est bien meilleur sur ce point.

**c) Boucle acoustique de l'auto-appel.** `echoReturnLoss` descend à **−30 dB** et passe
**29 % du temps sous 0 dB** sur l'appel OPUS (3 % sur G.722) : l'écho revenant dans le micro
est *plus fort* que la voix directe. Normal quand on appelle son propre mobile posé à côté du
Mac — l'AEC de Chromium n'est pas conçu pour ça. Hypothèse (a) **confirmée** : une grande
partie du « mauvais son » perçu est un artefact du protocole de test.

**d) Hypothèse (c) — mobile qui émet faible : écartée.** L'`audioLevelAvg` instantané à
0,0003 est un échantillon ponctuel pris pendant un silence. Le niveau RMS dérivé
(`√(totalAudioEnergy / totalSamplesDuration)`) est de **0,31 sur G.722** — niveau tout à fait
normal. C'est un piège de lecture, pas un signal faible.

## 6. Actions recommandées

1. **Corriger le commentaire faux** dans `src/apps/calls/modules/dialer/infrastructure/telnyx/rtcClient.ts:43`
   (« bitrate entrant 13kbps ») — il grave une conclusion erronée qui a déjà motivé deux
   commits de va-et-vient sur les codecs. *(non fait ici : périmètre = investigation seule)*
2. **Refaire un appel de test propre** : vers un **autre** numéro, **casque filaire**, Mac en
   **Ethernet**. Sans ça, tout jugement qualité est confondu par l'écho et le Wi-Fi.
3. **Ne pas toucher au fmtp / `maxaveragebitrate`.** Le plafond est la jambe PSTN 8 kHz.
4. **Reconsidérer G.722 en tête** si le test propre confirme : sur ces données G.722 a un
   jitter 9× plus faible (1 ms vs 9 ms) et un jitter buffer 6× plus court (39 ms vs 238 ms).
   Le comparatif de 2b61c1c s'appuyait sur le chiffre de 13 kbps, donc sur rien.
5. **Instrumenter le RTT** côté dialer (`currentRoundTripTime` via `getStats`) et avertir
   l'agent au-delà de ~200 ms : c'est le seul indicateur qui a bougé quand la qualité a chuté.
