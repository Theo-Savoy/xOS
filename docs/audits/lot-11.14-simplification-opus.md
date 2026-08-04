# Lot 11.14 — Passe de simplification / anti-over-engineering (module dialer)

**Date** : 2026-08-04 · **Base** : `183d111` · **Périmètre** :
`src/apps/calls/modules/dialer/**`, `api/dialer.js`, `api/_dialer/*.js`.

Objectif : rendre le module maintenable et propre. Ce n'est pas une
vérification de recommandations — c'est une recherche active de complexité
inutile, d'abstraction prématurée et d'indirection qui ne paie pas.

**Vérifications** (après modifications) :

| Contrôle | Résultat |
| --- | --- |
| `npm run test` (suite complète) | **1155 tests / 131 fichiers — verts** (1154 avant : +1 test de non-régression ajouté) |
| `tsc --noEmit` | **0 erreur** |
| `npm run build` | **OK** |
| `npm run lint` | **0 erreur** (36 warnings pré-existants, aucun dans le dialer) |

---

## 1. Diagnostic par fichier — complexité NÉCESSAIRE vs OVER-ENGINEERING

### 1.1 `application/useRtcCall.ts` (397 → 413 l.)

La question centrale du brief : *le `useCallback` + `useRef` + `useEffect` pour
chaque setter est-il de la sur-ingénierie ?*

**Réponse : non, c'est load-bearing — mais pour une raison qui n'est écrite
nulle part.** L'effet de démontage a pour dépendances
`[clearDialTimeout, clearSimTimers, stopTimer, dropClient]`. Ces quatre
fonctions ne sont mémoïsées que pour que ce tableau soit stable. Si on les
transformait en fonctions simples, le tableau changerait à chaque render,
l'effet se re-souscrirait, **et son cleanup (`dropClient`) raccrocherait
l'appel en cours à chaque render**. La mémoïsation en cascade qui remonte
jusqu'à `startCall` découle de là, plus du fait que `startCall`/`hangup` sont
exposés par contexte (`DialerProvider`) à trois consommateurs — leur identité
est un contrat.

Verdict par élément :

| Élément | Verdict |
| --- | --- |
| `phaseRef` + `setPhaseSafe` | **NÉCESSAIRE.** `setPhase` est asynchrone ; la garde anti-double-dial en tête de `startCall` doit être synchrone, sinon un double-clic lance deux appels. 2 lignes — c'est la forme la plus simple du problème. |
| `clientRef` / `callRef` | **NÉCESSAIRE.** Les listeners SDK sont enregistrés une fois et ne doivent pas capturer un state périmé ; `clientRef` porte en plus la garde d'identité `onLive` (§8.1). |
| 3 refs de timers + 3 fonctions de purge | **NÉCESSAIRE**, mais les cycles de vie diffèrent réellement (interval de chrono, timeout de diagnostic 20 s, timers de simulation) — les fusionner en un `Set` unique coûterait plus qu'il ne rapporte. |
| `runSimulation` / `dropClient` / `hangup` | **NÉCESSAIRES.** Un seul appelant chacun, mais chacun nomme une décision produit non triviale (G2, §8.1, ARCEP). Les inliner rendrait `startCall` illisible. |
| `startCall` à 185 lignes | **OVER-ENGINEERING de forme** : cinq responsabilités dans un seul corps (garde, micro, token, câblage SDK, dial). → **corrigé**, cf. §2.3. |
| Chaîne de `useCallback` | **NÉCESSAIRE en l'état** ; supprimable seulement au prix d'un effet `[]` avec `eslint-disable` + identité instable de `startCall`. Gain ~20 l., risque de boucle de rendu chez un consommateur → **non fait**, cf. §3 (P3). |

### 1.2 `application/useDialerPool.ts` (351 → 338 l.)

| Élément | Verdict |
| --- | --- |
| `isRunning` (`useState`) | **OVER-ENGINEERING avéré** : doublon de `state.running`, déjà géré par le réducteur. Deux sources de vérité, 8 sites d'écriture, et une **divergence réelle** — en fin de démo « aucune réponse », `isRunning` passait à `false` sans que `state.running` suive, si bien qu'un re-clic sur Play retombait sur le `if (state.running) return state` du réducteur (Play sans effet). → **corrigé**, cf. §2.2. |
| `stateRef` | **NÉCESSAIRE.** Les listeners SDK et les timeouts non-réponse sont créés une fois ; sans ref, ils liraient un state figé au moment du `play()`. |
| `skipRef` | **NÉCESSAIRE.** `dialSlot` arme un timeout qui appelle `skip`, et `skip` rappelle `dialSlot` : cycle réel, non contournable avec deux `useCallback` (TDZ). La ref est la solution la plus simple, pas la plus astucieuse. |
| `demoTimersRef` / `clearDemoTimers` | **NÉCESSAIRE**, mais **trop grossier** : `skip()` purge *tous* les timers, y compris les timeouts non-réponse 20 s des autres lignes → cf. §3 (P2, bug). |
| `dialSlot`, `composeAfterPlay` | **NÉCESSAIRES** (2 appelants chacun, règle de 3 respectée sur l'esprit : factorisation constatée, pas anticipée). |
| `play()` (~75 l.) | **Acceptable.** Un chemin linéaire : dispatch → démo ? → client → listeners → connect → compose. Contrairement à `startCall`, aucun bloc n'est extractible sans casser la lecture. |

### 1.3 `application/poolLogic.ts` (142 → 151 l.)

**Sain.** Réducteur pur, immuable, chaque action correspond à un événement
métier réel (pas d'action « setter » générique). Le seul helper (`patchLine`)
a 3 usages. Le `default: return state` est inatteignable (union discriminée)
mais reste un garde-fou runtime bon marché : conservé.

Une action ajoutée : `stop` (fin de cycle sans ligne terminée) — c'est
exactement le niveau des autres actions, cf. §2.2.

### 1.4 `infrastructure/telnyx/rtcClient.ts` (165 → 166 l.)

Les 5 helpers partagés ont **tous ≥ 2 appelants** (`notifState`,
`telnyxPhase`, `telnyxErrorMessage`, `safeHangup`, `safeDisconnect`,
`newCallOptions`, `createRtcClient`) : factorisation constatée, pas anticipée.
Deux exceptions traitées : `AUDIO_CONSTRAINTS` et `getPreferredCodecs` étaient
exportés alors qu'ils n'ont **qu'un appelant interne** (`newCallOptions`), et
le type `RtcClientHandle` déclarait un `off?` **jamais appelé**. → §2.5.

Fichier restant très lisible ; c'est aussi la frontière eslint G8 —
**préservée** (aucun import `@telnyx/webrtc` ajouté ou déplacé).

### 1.5 `DialerView.tsx` (284 → 280 l.) / `PowerDialerView.tsx` (230 → 226 l.) / `CallBar.tsx` (50 l.)

- `DialerView` : `formatError` (table code serveur → message FR) est
  **nécessaire** — c'est le seul endroit qui traduit le contrat d'erreur. Le
  triple calcul de `dryRunActive` **est** justifié (il reflète les trois
  niveaux serveur ; le commentaire le dit). L'état `result` en revanche était
  **dérivable de `phase`** → §2.6.
- `PowerDialerView` : `useMemo` sur une boucle de **3 éléments** et
  `useCallback` sur un handler passé à un `<Button>` non mémoïsé =
  **mémoïsation cargo-cult** → §2.4. Les états `demo`/`noAnswer` sont du
  pilotage de démo, nécessaires.
- `CallBar` : 50 lignes, une garde de rendu, zéro état local. **Exemplaire, ne
  pas toucher.**

### 1.6 `api/dialer.js` (467 → 454 l.)

**Duplication résiduelle avérée et corrigée** : le routeur faisait déjà
`verifyJWT` → `getServiceClient()` → `loadDialerFlags()` → `if (!flags.enabled)
return 503`, puis `handleDial` **et** `handleWebrtcToken` refaisaient les trois
en entier. Coût : un `SELECT settings` **de trop par requête**, sur le chemin
chaud (un token WebRTC est demandé à chaque appel) — et une double vérité sur
le 503. → §2.1.

Ce qui **reste** dupliqué (entitlements → `isDryRun` → `reserveBudget` →
try/audit/release) : les deux handlers divergent sur la moitié du corps
(validation E.164 + kill switch d'un côté, validation caller ID + TTL de
l'autre) et renvoient des formes différentes. Un `withBudget(handler)` serait
une abstraction à 2 usages pour ~15 lignes économisées et une indirection sur
le chemin le plus sensible du module. **Règle de 3 non atteinte → non fait.**

Les gates elles-mêmes (`flags → rate → entitlement → budget`) sont dans le bon
ordre et lisibles séquentiellement : c'est du code de sécurité, la lecture
linéaire vaut mieux qu'un pipeline générique.

### 1.7 Tests

**Globalement à la bonne couche** :

- `poolLogic.test.ts` teste le réducteur en pur (`@vitest-environment node`) —
  aucun DOM, aucun mock : la bonne façon.
- `useRtcCall.test.tsx` ne mocke **que** `createRtcClient` et `fetchRtcToken` ;
  les helpers réels (`safeHangup`, `telnyxPhase`…) restent dans le chemin
  testé. Mock minimal, comportement observé (« l'appel n°2 ne doit pas
  échouer »). Bon.
- Les tests de vues passent par rôles/textes visibles, pas par structure DOM.

**Écarts constatés** :

1. `dialerApi.test.ts` couvre `dialCall()`, qui **n'a aucun appelant** : on
   teste un chemin mort (cf. §3, P1).
2. `PowerDialerView.test.tsx` vérifie littéralement le sélecteur
   `audio[data-rtc-remote-${slot}]` — c'est un test d'implémentation, mais il
   garde un contrat inter-fichiers non typé (une chaîne). Justifié tant que le
   couplage passe par une chaîne (cf. §3, P3).
3. **Trou de couverture réel** : `api/dialer.js` (routeur + `handleDial` +
   `handleWebrtcToken`) n'a **aucun test**, alors que tous les modules
   `api/_dialer/*` en ont. C'est le chemin qui porte les gates budget et
   entitlement (cf. §3, P1).

### 1.8 Abstractions posées avant 2 usages (règle de 3)

Recherche systématique — **une seule trouvaille** : `dialCall()` +
`DialCallParams` + `DialCallResult` (~60 l. + ~40 l. de test), zéro appelant
(le fichier le documente lui-même). Traitement : §3, P1 (arbitrage produit).

Le découpage `domain/ · application/ · infrastructure/` pour 8 fichiers est
cérémonieux dans l'absolu, **mais la règle eslint G8 s'appuie dessus** pour
confiner `@telnyx/webrtc` : il paie sa place. `phaseLabels.ts` (30 l.) a
2 vocabulaires × 2 consommateurs : justifié.

---

## 2. Simplifications FAITES

Toutes vérifiées par : `npm run test` (1155 verts), `tsc --noEmit` (0),
`npm run build` (OK), `npm run lint` (0 erreur).

### 2.1 `api/dialer.js` — gates dédupliquées (−13 l., −1 requête SQL par appel)

`handleDial` et `handleWebrtcToken` reçoivent `client` et `flags` du routeur
au lieu de refaire `getServiceClient()` + `loadDialerFlags()` + le test
`!flags.enabled`. Le comportement est identique : le routeur renvoyait déjà le
503 avant d'atteindre les handlers (leur propre test était **inatteignable**).
L'objet `caps` — strictement identique dans les deux handlers — est factorisé
en `budgetCaps(flags, entitlements)` (2 usages constatés).

### 2.2 `useDialerPool.ts` + `poolLogic.ts` — état `isRunning` dupliqué supprimé (−13 l.)

`useState(isRunning)` supprimé ; le hook renvoie `isRunning: state.running`.
Les 8 `setIsRunning(...)` disparaissent : les actions `play`, `line-ended`,
`pool-error` et `reset` portaient **déjà** l'information. Seul le cas « fin de
démo sans réponse » n'avait pas d'action correspondante → action `stop`
ajoutée au réducteur (`running: false`, file et lignes intactes), au même
niveau que les autres actions métier.

*Effet de bord assumé et souhaitable* : après une démo « aucune réponse », Play
relance désormais réellement un cycle (avant, `state.running` restait `true` et
le réducteur ignorait le clic).

### 2.3 `useRtcCall.ts` — câblage SDK extrait de `startCall` (185 → 96 l., dont ~40 de commentaires)

Les 5 listeners (`telnyx.ready`, `notification`, `socket.close`, `error`,
`stats.frame`) et la garde d'identité `onLive` sortent dans
`attachSdkListeners(client, to, callerNumber)`. **Déplacement pur** : même
ordre d'enregistrement, même garde, mêmes closures. `startCall` se lit
maintenant de bout en bout : garde → micro → token → client → écoute →
connect → timeout de diagnostic.

### 2.3 bis — Fix : timers de simulation orphelins (même famille que §8.1)

Trouvé pendant l'extraction, **corrigé et couvert par un test** :

- `hangup()` arme un retour à `'idle'` à 1,5 s **hors** de `simTimersRef` ;
- le timer de sortie de wrapping de la simulation (2 s) idem ;
- `startCall` purgeait `clearDialTimeout()` mais **pas** `clearSimTimers()`
  (la dépendance était pourtant déclarée dans son tableau — incohérence).

Conséquence : raccrocher puis rappeler dans la seconde faisait retomber
l'appel n°2 en `'idle'` en pleine composition. Corrigé en traçant les deux
timeouts et en purgeant les timers de simulation en tête de `startCall`.
Test de non-régression ajouté (`useRtcCall.test.tsx` — « n'hérite pas du
retour à idle armé par le hangup précédent ») ; **vérifié rouge sans le
correctif** (`expected 'idle' to be 'dialing'`), vert avec.

### 2.4 `PowerDialerView.tsx` — mémoïsation cargo-cult retirée (−4 l.)

`useMemo` sur une boucle de 3 éléments → calcul direct ; `useCallback` sur
`loadDemo` (passé à un `<Button>` non mémoïsé) → fonction simple. Import
`useCallback`/`useMemo` supprimé.

### 2.5 `rtcClient.ts` — surface publique réduite

`AUDIO_CONSTRAINTS`, `getPreferredCodecs` et le type `RtcCodec` dé-exportés
(un seul appelant, interne). `off?` retiré de `RtcClientHandle` : jamais
appelé, remplacé par le commentaire qui explique *pourquoi* il n'y en a pas
(la neutralisation passe par la garde `onLive`).

### 2.6 `DialerView.tsx` — état `result` supprimé (−5 l.)

`useState<{dry_run}>` supprimé : `phase === 'ended'` implique déjà qu'un appel
a démarré, et `dryRunActive` est déjà calculé au-dessus. Le `<pre>` de debug
JSON est remplacé par la phrase équivalente.

**Bilan chiffré** : −151 / +172 lignes sur 8 fichiers, dont +28 pour le test
de non-régression (hors test : −151 / +144). Le gain n'est pas dans
le compteur (l'extraction §2.3 ajoute un en-tête de fonction) mais dans la
taille de la plus grosse fonction (185 → 96 l.), dans une source de vérité en
moins, et dans une requête SQL en moins par appel.

---

## 3. Simplifications RECOMMANDÉES, non faites

| # | Prio | Sujet | Gain | Coût / risque | Pourquoi pas maintenant |
| --- | --- | --- | --- | --- | --- |
| R1 | **P1** | Supprimer `dialCall()` / `DialCallParams` / `DialCallResult` (`dialerApi.ts`) + son test | −100 l., un chemin mort en moins | Faible techniquement | **Arbitrage produit** : le endpoint serveur `?resource=dial` reste gardé et fonctionnel ; supprimer le client acte l'abandon du Call Control. Décision de Théo, pas d'un passage de simplification. |
| R2 | **P1** | Tests du routeur `api/dialer.js` (`handleDial`, `handleWebrtcToken`) | Couvre le chemin qui porte budget + entitlement + E.164 | ~150 l. de test, besoin de mocker Supabase | Hors mandat (c'est de l'**ajout**, pas de la simplification). C'est le trou de couverture le plus coûteux du module. |
| R3 | **P2** | **Bug** : `skip()` appelle `clearDemoTimers()` qui purge *tous* les timers, y compris les timeouts non-réponse 20 s des **autres** lignes → après un skip manuel, les autres lignes ne s'auto-skippent plus | Correction d'un vrai défaut power dialing | Passer à un timer **par slot** (`timersRef.current[slot]`) : ~15 l. modifiées dans `dialSlot`/`skip`/`hangupAll` | Correction de comportement, pas simplification ; à traiter avec le lot AMD (11.8) qui remplacera ce timeout placeholder. |
| R4 | **P2** | Unifier les deux simulations (`useRtcCall.runSimulation` et `useDialerPool.startDemoSimulation`) | −40 l., un seul vocabulaire de démo | Les timings diffèrent **volontairement** (1,5 s/30 s vs 300 ms/2 s/10 s) et 5 tests s'appuient dessus | Abstraction à 2 usages divergents = paramétrisation qui coûterait plus cher que la duplication. **Ne pas faire.** |
| R5 | **P3** | Supprimer la chaîne de `useCallback` de `useRtcCall`/`useDialerPool` (effet de démontage en `[]` + `eslint-disable`) | −30 à 40 l. sur les deux hooks | `startCall`/`play` deviennent instables ; risque de boucle de rendu chez un consommateur du contexte | Le vrai remède est React Compiler (ou `useEffectEvent` quand il sera stable), qui supprimera la question **sans** la déplacer. À revoir à la migration. |
| R6 | **P3** | Passer l'**élément** audio plutôt qu'un **sélecteur** au pool (`audio[data-rtc-remote-N]`) | Supprime un couplage par chaîne + rend un test d'implémentation inutile | Nécessite des refs par slot remontées de la vue au hook | Le sélecteur est aujourd'hui documenté et testé ; le gain est de l'élégance, pas de la maintenabilité. |
| R7 | **P3** | Factoriser `handleDial`/`handleWebrtcToken` (entitlements → dry-run → réservation) | −15 l. | Indirection sur le chemin de sécurité, 2 usages divergents | **Règle de 3 non atteinte.** À reconsidérer si un 3ᵉ chemin de dial apparaît. |
| R8 | — | Rate limiter in-memory (`RateLimiter`, par instance Vercel) | — | — | Déjà documenté dans le code (S4). Pas de la sur-ingénierie : c'est l'inverse — la version simple, avec son plafond écrit. Correct tant que le dialer reste mono-instance. |

---

## 4. Verdict

**Le module est maintenable et propre.** La complexité restante est
majoritairement *nécessaire* et, désormais, *expliquée* : les refs, les gardes
d'identité et les mémoïsations sont la conséquence de trois contraintes
réelles — un SDK à listeners qui ne se désabonne pas, une garantie G2
vérifiable, et une machine à états qui doit être lisible de façon synchrone.
Ce n'est pas de la sur-ingénierie ; c'est le prix, en React 18 sans compiler,
d'un hook dont l'API est stable.

Trois défauts réels ont été trouvés au passage — pas des recommandations
recyclées :

1. une **double source de vérité** (`isRunning` / `state.running`) qui
   divergeait déjà en démo → supprimée ;
2. une **requête SQL redondante** par appel + une gate 503 inatteignable →
   supprimées ;
3. un **bug de timer orphelin** (raccrocher puis rappeler dans la seconde
   cassait l'appel suivant) → corrigé et couvert par un test rouge-puis-vert.

**Dette résiduelle assumée**, dans l'ordre : (a) `api/dialer.js` sans aucun
test alors qu'il porte les gates budget/entitlement — le risque le plus élevé
du module ; (b) `dialCall()` mort en attente d'arbitrage produit ; (c) le
timeout non-réponse placeholder du pool, dont la purge trop large (R3)
disparaîtra avec l'AMD du lot 11.8.

Ce qu'il **ne faut pas** simplifier davantage : `poolLogic.ts` (déjà minimal),
`CallBar.tsx`, la frontière `rtcClient.ts` (G8), et les deux simulations, dont
la divergence est un choix produit et non un oubli.
