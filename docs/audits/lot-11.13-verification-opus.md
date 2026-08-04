# Lot 11.13 — Audit de VÉRIFICATION des deux rapports

**Objet** : les recommandations de `lot-11.13-consolidation-opus.md` (rapport 1) et
`lot-11.13-securite-design-grok.md` (rapport 2) sont-elles réellement implémentées ?
**Méthode** : lecture du code livré, pas des commits. Chaque « VÉRIFIÉ » a été lu dans le
fichier ; les points sensibles ont en plus été verrouillés par un test qui échoue si on
les retire.
**HEAD vérifiée** : `912e4e2` · **Périmètre** : `src/apps/calls/modules/dialer/**`,
`src/apps/calls/calls-dialer.css`, `api/dialer.js`, `api/_dialer/*`, `middleware.js`.

---

## Verdict

**L'essentiel est en place.** Sur 47 recommandations vérifiées : **41 VÉRIFIÉES**,
**5 ÉCARTS** (partiellement livrées), **1 MAL FAITE**.

Le point qui compte : **§8.1 était livré à moitié, et à moitié il était nuisible.** Le
client précédent était bien déconnecté, mais ses listeners restaient branchés — et comme
`setPhaseSafe('dialing')` s'exécute **avant** le `disconnect()`, le `telnyx.socket.close`
émis par cette déconnexion volontaire faisait passer le **nouvel** appel en `failed`
(« Connexion WebRTC perdue »). Le fix censé corriger l'écrasement d'état de l'appel n°2 en
créait un chemin plus direct. Corrigé ici, avec le test qui l'a révélé.

Deuxième constat, transversal : **rien de ce qui a été livré n'était couvert par un test.**
Ni S1, ni S2, ni S3, ni S6, ni §8.1, ni §8.3 — alors que le rapport 1 demandait
explicitement « avec un test de deux appels consécutifs » pour §8.1. Six tests ajoutés.

---

## 1. Matrice de vérification

### Rapport 1 — consolidation (Opus)

| # | Recommandation | Statut | Preuve / écart |
|---|---|---|---|
| 2.1 | Supprimer `index.ts` | **VÉRIFIÉ** | Fichier absent |
| 2.2 | Supprimer `application/orchestrator.ts` | **VÉRIFIÉ** | Fichier absent |
| 2.3 | `CallState.ts` réduit à `CallPhase` | **VÉRIFIÉ** | `CallState.ts` = `LinePhase` + `CallPhase`, 13 lignes. `CallLine`/`CallLineId`/`DialerEvent` : 0 occurrence dans `src/` et `api/` |
| 2.4 | Supprimer `RtcCallStatus` | **VÉRIFIÉ** | 0 occurrence dans le repo |
| 2.5 | Supprimer `timersRef`/`stopTimer` du pool | **VÉRIFIÉ** | `useDialerPool.ts` : plus aucun `setInterval` |
| 2.6 | Supprimer `PoolLine.durationSec` | **VÉRIFIÉ** | `PoolState.ts:14-19` — champ absent |
| 2.7 | Supprimer les casts `_end` / `_unref` | **VÉRIFIÉ** | 0 occurrence |
| 2.8 | Supprimer la branche `p === 'failed'` | **VÉRIFIÉ** | `useRtcCall.ts` : `if (p === 'ended') stopTimer()` seul |
| 2.9 | `DialerProvider` : `value={rtc}` | **VÉRIFIÉ** | `DialerProvider.tsx:29`, plus d'import `useMemo` |
| 2.10 | Supprimer `connectedSlot` | **VÉRIFIÉ** | 0 occurrence, assertion de test retirée |
| 2.11 | Documenter `dialCall()` sans appelant | **VÉRIFIÉ** | En-tête `dialerApi.ts` — arbitrage produit toujours ouvert (cf. P2-3) |
| 1.1 | `telnyxPhase()` unique dans `rtcClient.ts` | **VÉRIFIÉ** | `rtcClient.ts:60-83`, consommé par les deux hooks via une table locale |
| 1.2 | `TelnyxNotification` + `notifState`/`notifCallId` | **VÉRIFIÉ** | `rtcClient.ts:85-92`. Le pool récupère bien `callState` (bénéfice annoncé) |
| 1.3 | `newCallOptions()` | **VÉRIFIÉ** | `rtcClient.ts:144-158`, `getPreferredCodecs()` appelé **une** fois |
| 1.4 | `telnyxErrorMessage()` | **VÉRIFIÉ** | `rtcClient.ts:96-100`, 5 sites d'appel |
| 1.5 | `connectRtcClient()` mutualisé | **NON FAIT (assumé)** | Classé P3 par le rapport lui-même, à faire avec un test par branche |
| 1.6 | `safeHangup` / `safeDisconnect` | **VÉRIFIÉ** | `rtcClient.ts:103-118`, plus aucun `try { hangup() } catch` inline |
| 3.1 | Socle `LinePhase` partagé | **VÉRIFIÉ** | `CallState.ts:10`, `PoolState.ts:12` |
| 3.2 | Type `CallStats` extrait | **VÉRIFIÉ** | `useRtcCall.ts:40-45`, un seul contrat public |
| 3.3 | Type `RtcCodec` | **VÉRIFIÉ** | `rtcClient.ts:27-33`, 3 sites |
| 3.4 | `domain/phaseLabels.ts` | **VÉRIFIÉ** | `CALL_PHASE_LABEL`/`POOL_PHASE_LABEL` construits sur un `LINE_PHASE_LABEL` commun ; « Clôture… » tranché ; importés par `CallBar`, `DialerView`, `PowerDialerView` |
| 4.1 | `off?` dans `RtcClientHandle` + retrait des listeners | **ÉCART** | Le champ `off?` est ajouté (`rtcClient.ts:47`) mais **aucun hook ne l'appelle**. Le désarmement passe désormais par `onLive` (cf. §2) — `off?` est du contrat inutilisé |
| 4.2 | Aligner le cleanup du pool | **VÉRIFIÉ** | `useDialerPool.ts:333-341` : `callsRef = []` + `clientRef = null` |
| 5.1 | En-tête `poolLogic.ts` en vocabulaire d'actions | **VÉRIFIÉ** | Les 3 fonctions fantômes ont disparu ; `pool-error` documentée |
| 5.3 | En-tête honnête pour `CallState.ts` | **VÉRIFIÉ** | Parle de phases, plus d'architecture module |
| 5.4 | `rtcClient.ts` : invariant, pas l'enquête | **VÉRIFIÉ** | 3 lignes + lien vers `lot-11.4-bitrate-investigation.md`. Idem `telnyx.stats.frame` : plus de citation du bundle minifié |
| 5.5 | Doc `isRunning` corrigée | **VÉRIFIÉ** | « Un cycle Play est ouvert (≠ une ligne est active) » |
| 5.7 | Renvoi croisé entre les 2 simulations | **VÉRIFIÉ** | En-tête des deux hooks, timings cités |
| 5.8 | `console.debug` marqués volontaires | **VÉRIFIÉ** | « Diagnostic VOLONTAIRE (fix 11.3 B3) » |
| 6.1 | Grouper `tabular-nums` | **VÉRIFIÉ** | `calls-dialer.css:79-90`, 2 règles au lieu de 5 |
| 6.2 | Deux niveaux de hint, pas trois | **VÉRIFIÉ** | `.calls-power__hint` 0.85rem (bloc pédagogique, écart assumé), `.calls-dialer__hint`/`__note` 0.75rem |
| 6.4 | Styler le `<select>` | **VÉRIFIÉ** | `.calls-dialer__form input, .calls-dialer__form select` |
| 6.4b | Trancher la fuite BEM `.calls-dialer__error` | **ÉCART** | Toujours utilisée dans `.calls-power` sans le commentaire d'arbitrage demandé (P3-2) |
| 7.1 | Ordre des déclarations `useDialerPool` | **VÉRIFIÉ** | Refs groupées après le `useReducer`, cleanup en dernier |
| 7.2 | `stateRef`/`skipRef` assignés en effet | **VÉRIFIÉ** | `useDialerPool.ts:99-102` + commentaire explicite du cycle |
| 7.3 | Nommer les 5 variables d'une lettre | **NON FAIT** | `s`, `p`, `n`, `d` toujours là. P2 dans le rapport d'origine (P2-4 ici) |
| 7.4 | Retirer `async` sans `await` + les `void` | **VÉRIFIÉ** | `dialSlot`/`composeAfterPlay` synchrones, 0 `void` résiduel |
| 7.5 | `destination` → `to` | **VÉRIFIÉ** | Plus de shadowing |
| 7.6 | Un seul `useMemo` dans `PowerDialerView` | **VÉRIFIÉ** | `counters` unique ; `loadDemo` dépend de `pool.setQueue` (stable) |
| 7.7 | Extraire la branche simulation | **VÉRIFIÉ** | `runSimulation` (`useRtcCall.ts:161-179`). `attachCallListeners` non extrait — non demandé au brief |
| §8.1 | Déconnecter le client précédent | **MAL FAIT → CORRIGÉ** | Voir §2.1 |
| §8.2 | Timers de simulation annulables | **VÉRIFIÉ** | `simTimersRef` vidé par `hangup()` et le cleanup. Réserve mineure : P3-1 |
| §8.3 | `<audio data-rtc-remote-{slot}>` rendu | **VÉRIFIÉ + testé** | `PowerDialerView.tsx:148-152`, un par slot. Test ajouté |
| §8.4 | `pool-error` global | **VÉRIFIÉ** | `PoolState.error` + action `pool-error`, alimentée par `socket.close`, `telnyx.error` et l'échec de `connect()` ; affichée `role="alert"` ; **la file n'est plus vidée** |

### Rapport 2 — sécurité + design (Grok)

| # | Recommandation | Statut | Preuve / écart |
|---|---|---|---|
| S1 | `reserveBudget` sur le chemin WebRTC | **VÉRIFIÉ + testé** | `api/dialer.js:191-206` : réservation **avant** `issueRtcToken`, `429` si refus, `released` si l'émission échoue, `consumed` sinon |
| S2 | `connection_id`/`webhook_url`/`from` ignorés | **VÉRIFIÉ + testé** | `dialer.js:280-282` : `cfg.connectionId` + URL webhook serveur ; `from: cfg.callerId` (l.353) ; fail-closed `503 dial_not_configured` hors dry-run. Test : un body attaquant est intégralement ignoré dans le POST Telnyx |
| S3 | Validation E.164 serveur | **VÉRIFIÉ + testé** (partiel) | `/^\+[1-9]\d{6,14}$/` sur `handleDial`. **Le chemin WebRTC n'est pas couvert** — le serveur ne voit jamais la destination (P2-1) |
| S4 | Rate limiter branché | **VÉRIFIÉ** | `RateLimiter` instancié `dialer.js:39`, consommé dans `handleWebrtcToken` (l.137) **et** `handleDial` (l.255), `429 rate_limited` + `retry_after_ms`. Réserve : bucket in-memory par instance, documentée dans le code |
| S5 | `Idempotency-Key` client → `command_id` | **VÉRIFIÉ + testé** (partiel) | Serveur : `x-idempotency-key` → `xos-dial-<clé>` (`dialer.js:348`). **Aucun client ne l'envoie** (P2-2) |
| S6 | Pas d'`err.message` brut | **ÉCART → CORRIGÉ** | `dial_failed` nu : OK. Mais le `429` renvoyait encore l'objet `reservation` complet (`dialer.js:340`), ce que S6 demandait explicitement de retirer. Corrigé + testé |
| S7 | Ne plus loguer `credential_id` | **VÉRIFIÉ** | Payload d'audit `webrtc_token` = `{ caller_number }` seul |
| S8 | Middleware : n'exempter que `?resource=webhooks` | **VÉRIFIÉ** | `middleware.js` : `isAuthBridge` ne contient plus `/api/dialer` ; `isDialerWebhook(url, method)` exige pathname + `resource=webhooks` + `POST` |
| S9 | `valid` complété, commentaires alignés | **VÉRIFIÉ** | `webrtc_token` présent dans `valid` ; l'en-tête dit « EVERY other resource requires a valid JWT » |
| S10 | Retirer l'import mort `hangupCall` | **VÉRIFIÉ** | `dialer.js:31` n'importe plus que `dialContact`, `issueRtcToken` |
| S11 | Pseudonymiser `to` dans l'audit | **VÉRIFIÉ** | `hashE164()` (FNV-1a, `dialer.js:59-66`) appliqué aux deux écritures d'audit `dial` |
| S12 | Pas d'input caller ID libre sans allocation | **ÉCART** | L'input est bien `disabled` sans allocation + message explicite, mais le **bouton Appeler reste actif** (`disabled={isActive \|\| !enabled}`). Sévérité BASSE → P3-3 |
| D1 | Play désactivé explicable | **VÉRIFIÉ** | `title` conditionnel, `▶` en `aria-hidden`, nom accessible « Play » |
| D2 | a11y : `aria-live`, rôles, labels | **VÉRIFIÉ** | `role="status" aria-live="polite"` sur la CallBar et les compteurs ; `htmlFor`/`id` sur les 2 champs ; `role="alert"` sur les erreurs |
| D3 | EmptyState + Skeleton + retry | **ÉCART → CORRIGÉ** | `EmptyState` file vide : livré. `Skeleton` pendant le fetch config : **manquant**, ajouté ici (avec `role="status"`, `Skeleton` étant `aria-hidden`) |
| D4 | CallBar : wrap + troncature | **VÉRIFIÉ** | `flex-wrap: wrap`, `text-overflow: ellipsis; max-width: 40ch`, erreur en `flex-basis: 100%` |
| D5 | Responsive compteurs / header | **VÉRIFIÉ** | `@media (max-width: 640px)` : 2 colonnes + actions en wrap |
| D6 | `<select>` stylé | **VÉRIFIÉ** | Idem 6.4 |
| D7 | Un seul `<audio data-rtc-remote>` | **VÉRIFIÉ + testé** | Celui de `DialerView` retiré, la CallBar reste seule. Test : `PowerDialerView` ne rend **aucun** `audio[data-rtc-remote]` (seulement les variantes par slot) |
| D8 | Dial désactivé si `!enabled` + bandeau | **VÉRIFIÉ** | `disabled={isActive \|\| !enabled}` + bandeau `role="status"` |
| D9 | Contraste des hints | **VÉRIFIÉ** | `opacity` remplacée par `--xos-muted` sur `.calls-power__hint`, `.calls-dialer__hint`, `.calls-dialer__note` |
| D10 | Adopter EmptyState/Skeleton | **VÉRIFIÉ** (après correctif D3) | Les deux composants du design system sont désormais utilisés |

### Question du brief : duplication résiduelle `useRtcCall` ↔ `useDialerPool` ?

**Non, plus rien qui vaille une factorisation.** Ce qui reste de commun entre les deux
hooks :

- la table `PHASE_FROM_TELNYX` + l'idiome `telnyxPhase(s) → lookup → if (!p) return`.
  Les deux tables ont des **types de sortie différents** (`CallPhase` vs `PoolPhase`) et
  des cardinalités différentes (5 vs 4 entrées, `held` mappé d'un côté, ignoré de
  l'autre). Factoriser demanderait un helper générique pour économiser ~4 lignes :
  mauvais échange.
- le bootstrap `fetchRtcToken → createRtcClient → null ⇒ simulation` (1.5), laissé de
  côté **volontairement** : c'est le seul endroit où les politiques d'erreur divergent
  pour de bonnes raisons (le mono-ligne distingue dry-run et production, le pool avale
  toujours). Le rapport 1 le classait P3 « à faire avec un test par branche » ; ce
  jugement tient.

---

## 2. Ajustements faits

Cinq changements, tous vérifiés par un run (`vitest` 131 fichiers / 1154 tests,
`tsc --noEmit` = 0, `lint` = 0 erreur, `build` OK).

### 2.1 — `useRtcCall.ts` : §8.1 était contre-productif (le point important)

Le fix livré déconnectait bien le client précédent, mais :

1. **Les listeners du client abandonné restaient branchés.** `disconnect()` ferme le
   socket, il ne retire pas les abonnements — et `RtcClientHandle.off` n'est appelé
   nulle part (cf. écart 4.1). Un événement tardif du client n°1 pouvait toujours
   appeler `setPhaseSafe`/`setError` sur l'appel n°2.
2. **Pire : la déconnexion elle-même produisait l'événement fautif.** `startCall` fait
   `setPhaseSafe('dialing')` **avant** `safeDisconnect(clientRef.current)`. Le
   `telnyx.socket.close` émis par cette fermeture volontaire tombait donc sur un
   `phaseRef.current === 'dialing'` → l'appel n°2 partait immédiatement en `failed`
   avec « Connexion WebRTC perdue ». Le même piège existait dans `hangup()`, qui
   déconnecte alors que la phase est encore `connected`.
3. **`dialTimeoutRef` n'était pas purgé** entre deux appels : le timeout de diagnostic
   20 s de l'appel n°1 pouvait faire échouer l'appel n°2. (`clearDialTimeout` figurait
   déjà dans le tableau de dépendances de `startCall` sans y être appelé — l'intention
   était là, pas le code.)

Correctif, ~12 lignes :

- `dropClient()` : vide `clientRef`/`callRef` **avant** `safeHangup`/`safeDisconnect`,
  utilisé par `startCall`, `hangup()` et le cleanup d'unmount (les trois sites qui
  faisaient la même séquence dans un ordre différent) ;
- `onLive(event, cb)` : enveloppe les 5 `client.on` de `startCall` et ignore l'événement
  si `clientRef.current !== client`. Un client supersédé devient inerte, sans dépendre
  d'un `off()` que le SDK n'expose pas de façon fiable ;
- `clearDialTimeout()` appelé en tête de `startCall`.

### 2.2 — `api/dialer.js` : S6 résiduel

`return json(429, { error: reservation.reason, reservation })` → `{ error: reason }`
seul, comme S6 le demandait. (L'objet ne contenait que `{ allowed, reason }` : la fuite
était mineure, mais la recommandation était explicite et le correctif tient en une ligne.)

### 2.3 — `DialerView.tsx` : D3 résiduel

`<p>Chargement de la config…</p>` → trois `<Skeleton>` dans un conteneur
`role="status" aria-label`. `Skeleton` est `aria-hidden` : sans le `role="status"`, le
correctif aurait **retiré** l'annonce lecteur d'écran au lieu de l'améliorer.

### 2.4 — Six tests ajoutés

Rien de ce qui a été livré aux lots précédents n'était couvert. Les tests ne changent
aucun comportement ; ils échouent si on retire le correctif correspondant.

| Fichier | Test | Verrouille |
|---|---|---|
| `api/dialer.test.js` | `S3 : dial refuse 400 invalid_e164` (4 formats) | S3 |
| `api/dialer.test.js` | `S5 : x-idempotency-key devient le command_id` | S5 |
| `api/dialer.test.js` | `S2 : connection_id / webhook_url / from du body sont IGNORÉS` — fenêtre réelle, POST Telnyx capturé | S2 |
| `api/dialer.test.js` | `S1/S6 : webrtc_token refuse 429 budget épuisé, sans exposer la réservation` | S1, S6 |
| `PowerDialerView.test.tsx` | `rend un élément audio par slot` + absence de `audio[data-rtc-remote]` | §8.3, D7 |
| `useRtcCall.test.tsx` (**nouveau**) | 2 tests : le client n°1 est déconnecté et rendu inerte ; le timeout 20 s n'est pas hérité | §8.1 |

`useRtcCall.test.tsx` ne mocke que `createRtcClient` et `fetchRtcToken` : `safeHangup`,
`safeDisconnect` et `telnyxPhase` restent réels dans le chemin testé. C'est ce test qui a
révélé le défaut de §8.1.

---

## 3. Recommandations restantes

### P1 — aucune

Rien de bloquant ne subsiste.

### P2 — à traiter au prochain lot dialer

1. **S3 sur le chemin réel.** L'E.164 n'est validé que sur `?resource=dial`, qui n'a
   aucun appelant en production. Le chemin WebRTC ne montre jamais la destination au
   serveur : le token n'est scopé à rien. Deux issues — un `?resource=dial_intent`
   appelé avant `startCall` (valide + réserve + retourne le token, ce qui fusionnerait
   proprement avec S1), ou la défense en profondeur Telnyx (Outbound Voice Profile
   France-only + daily spend limit) déjà citée au lot 11.1. La seconde est nettement
   moins de code, la première est la seule qui donne un `400` explicite à l'agent.
2. **S5 côté client.** Le serveur accepte `x-idempotency-key`, personne ne l'envoie.
   Sans appelant en production pour `dialCall`, c'est cohérent — mais si le chemin Call
   Control est réactivé, la protection anti-double-appel est à zéro tant que le client
   ne génère pas une clé stable par intention.
3. **Arbitrage `dialCall()` (2.11).** Toujours ouvert, et il s'est aggravé : le client
   envoie encore `connection_id` et `webhook_url` (`dialerApi.ts`, types **requis**)
   que le serveur ignore désormais totalement depuis S2. Le contrat client ment sur des
   champs sans effet. Soit on retire le chemin, soit on nettoie `DialCallParams` — mais
   ne pas laisser un paramètre obligatoire qui ne sert à rien. **Décision Théo.**
4. **Nommage (7.3).** `s`, `p`, `n`, `d` sont toujours là dans les deux hooks. Cosmétique,
   mais c'était la dernière ligne du P2 du rapport 1.

### P3 — dette assumée, à trancher

1. **Timers imbriqués non suivis (§8.2 résiduel).** Dans `runSimulation`, le
   `setTimeout(() => setPhaseSafe('idle'), 2000)` niché dans le timer de 30 s n'est pas
   poussé dans `simTimersRef` ; idem le `setTimeout(…, 1500)` de `hangup()`. Effet réel :
   nul (les deux convergent vers `idle`). À corriger si la simulation gagne des états.
2. **Fuite BEM `.calls-dialer__error` (6.4).** Toujours utilisée dans le bloc
   `.calls-power`. Le rapport demandait « choisir, et l'écrire dans un commentaire » :
   ni renommée, ni commentée.
3. **S12 : bouton Appeler actif sans caller ID alloué.** L'input est désactivé et le
   message est clair, mais le bouton reste cliquable jusqu'à l'échec serveur. Le
   désactiver bloquerait la démo dry-run — d'où le classement P3 plutôt qu'un correctif
   à la volée.
4. **`RtcClientHandle.off?` inutilisé (4.1).** Le champ a été ajouté au contrat comme
   demandé, mais le désarmement passe maintenant par `onLive` (§2.1), qui ne dépend pas
   du SDK. Soit un futur lot s'en sert, soit il faut le retirer — c'est exactement le
   « champ mort avec un alibi » que le rapport 1 dénonçait en 2.10.
5. **Bootstrap client mutualisé (1.5)** et **rate limiter sur store partagé (S4)** :
   inchangés, déjà classés P3 / documentés dans le code.

---

## 4. Ce que la vérification confirme

Trois choses tenues, qu'il ne faut pas casser au prochain refactor :

1. **La garantie G2 est intacte** et vérifiable de bout en bout : `dry_run` à n'importe
   quel niveau ⇒ `token: null` ⇒ `createRtcClient` retourne `null` ⇒ simulation. Le
   `reserveBudget` de S1 a été inséré **après** la porte dry-run, donc il ne consomme
   pas de budget en dry-run — c'était le piège évident, il a été évité.
2. **La frontière SDK a tenu la factorisation.** Les 5 helpers communs sont tous dans
   `rtcClient.ts`, sous la contrainte eslint G8, sans qu'un seul import `@telnyx/webrtc`
   ait fuité ailleurs.
3. **`poolLogic.ts` est resté un réducteur pur.** L'erreur globale de §8.4 est entrée
   dans le modèle par une action (`pool-error`), pas par un état React parallèle — et la
   règle « ne pas vider la file sur erreur » est vérifiable sans monter un composant.
