# Lot 11.13 — Audit de consolidation / maintenabilité du module dialer Telnyx

**Périmètre** : `src/apps/calls/modules/dialer/**`, `src/apps/calls/modules/runner/ContactCardPanel.tsx` (bouton Appeler), `src/apps/calls/calls-dialer.css`, `api/dialer.js` + `api/_dialer/*`.
**HEAD auditée** : `1ce6786`.
**Nature** : rapport seulement — **aucun fichier de production modifié**. Objectif : simplification / clarification / documentation / factorisation, sans changement de comportement.

Le module fait ~1 700 lignes de TS/TSX côté client. Il fonctionne. Ce qui coûte cher aujourd'hui n'est pas la logique mais **la duplication entre les deux hooks** (`useRtcCall` mono-ligne, `useDialerPool` multi-lignes), une **couche `domain/` fantôme** héritée du lot 11.1, et une **documentation figée à l'état du lot 11.2** alors qu'on est au 11.13.

Trois constats sortent du cadre « maintenabilité pure » et sont signalés comme **écarts de comportement** (§8) : ils ne sont pas à corriger dans un lot de consolidation, mais ils doivent être tracés avant qu'un refactor ne les fige.

---

## Synthèse par priorité

| # | Sujet | Fichier(s) | Prio |
|---|---|---|---|
| 2.1 | `index.ts` (barrel) jamais importé | `index.ts` | **P1** |
| 2.2 | `orchestrator.ts` = stub noop, jamais appelé | `application/orchestrator.ts` | **P1** |
| 2.3 | `CallLine` / `CallLineId` / `DialerEvent` sans usage réel | `domain/CallState.ts` | **P1** |
| 2.4 | `RtcCallStatus` exporté, zéro usage | `useRtcCall.ts:21` | **P1** |
| 2.5 | Timer vide dans le pool + `timersRef`/`stopTimer` morts | `useDialerPool.ts:93,119,312` | **P1** |
| 2.6 | `PoolLine.durationSec` toujours 0 | `PoolState.ts:23` | **P1** |
| 2.7 | `_end` / `_unref` : casts qui ne font rien | `useRtcCall.ts:209,370` | **P1** |
| 2.8 | `p === 'failed'` inatteignable | `useRtcCall.ts:273` | **P1** |
| 2.9 | `useMemo(() => rtc, [rtc])` inutile | `DialerProvider.tsx:29` | **P1** |
| 2.10 | `connectedSlot` écrit, lu nulle part (sauf test) | `PoolState.ts:33` | **P1** |
| 2.11 | `dialCall()` sans appelant en prod | `dialerApi.ts:92` | **P2** |
| 1.1 | `phaseFromTelnyx` vs `poolPhaseFromTelnyx` | `useRtcCall.ts:50` / `useDialerPool.ts:35` | **P1** |
| 1.2 | `TelnyxNotification` déclaré deux fois | idem | **P1** |
| 1.3 | Construction des options `newCall` dupliquée | `useRtcCall.ts:225` / `useDialerPool.ts:135` | **P2** |
| 1.4 | Handler `telnyx.error` identique | `useRtcCall.ts:288` / `useDialerPool.ts:326` | **P1** |
| 1.5 | Bootstrap client (token → client → listeners → connect) dupliqué | idem | **P3** |
| 1.6 | `try { hangup() } catch {}` × 6 | les deux hooks | **P1** |
| 3.1 | `CallPhase` vs `PoolPhase` : unifier le socle commun | `domain/*` | **P2** |
| 3.2 | Type `callStats` inline écrit 2× | `useRtcCall.ts:32,101` | **P1** |
| 3.3 | Type codec inline écrit 3× | `rtcClient.ts:25,49,61` | **P1** |
| 3.4 | `PHASE_LABEL` triplé, avec divergence de libellé | `CallBar.tsx:18` / `DialerView.tsx:44` / `PowerDialerView.tsx:24` | **P1** |
| 4.1 | Aucun `client.off` : pas de `off` dans le type | `rtcClient.ts:26` | **P2** |
| 4.2 | `clientRef` non remis à `null` au unmount du pool | `useDialerPool.ts:106` | **P1** |
| 4.3 | Client précédent non déconnecté sur raccroché distant | `useRtcCall.ts:191` | **P2** (comportement) |
| 5.1–5.7 | Documentation périmée / trompeuse | `index.ts`, `orchestrator.ts`, `CallState.ts`, `poolLogic.ts`, `rtcClient.ts`, `useDialerPool.ts` | **P1** |
| 6.1–6.4 | CSS : tokens répétés, pas de vraie duplication de blocs | `calls-dialer.css` | **P1/P2** |
| 7.1 | Ordre des déclarations dans `useDialerPool` | `useDialerPool.ts:97 vs 180` | **P1** |
| 7.2 | `skipRef.current = skip` assigné pendant le render | `useDialerPool.ts:370` | **P2** |
| 7.3 | Nommage : `s`, `p`, `d`, `n`, `t` | les deux hooks | **P2** |
| 7.4 | `async` sans `await` | `useDialerPool.ts:127,170` | **P1** |
| 7.5 | Shadowing `destination` | `useRtcCall.ts:100 vs 154` | **P1** |

---

## 1. Duplications `useRtcCall` (mono-ligne) ↔ `useDialerPool` (multi-lignes)

**Réponse courte à « peut-on factoriser un cœur commun ? »** : oui, mais **pas le hook entier**. Les deux hooks ont des cycles de vie irréconciliables — `useRtcCall` crée un client **par appel** dans `startCall`, `useDialerPool` crée **un client partagé** au premier `play()` et route par `callId`. Fusionner les hooks produirait un troisième objet plus compliqué que les deux réunis.

En revanche **4 blocs sur 6 sont factorisables sans risque**, et ils vivent tous naturellement dans `infrastructure/telnyx/rtcClient.ts`, qui est déjà l'adaptateur SDK du module. C'est le bon point de collecte : il est déjà importé par les deux hooks, et il est déjà la seule frontière autorisée pour `@telnyx/webrtc` (règle eslint G8).

### 1.1 — Mapping état SDK → phase (P1)

- `useRtcCall.ts:50-69` `phaseFromTelnyx()`
- `useDialerPool.ts:35-52` `poolPhaseFromTelnyx()`

Les deux `switch` sont **identiques à un `case` près** : `useRtcCall` mappe `'held' → 'on_hold'`, le pool ne le mappe pas (il n'a pas de phase `on_hold`). Tout le reste — `new`/`requesting`/`trying` → `dialing`, `early`/`ringing` → `ringing`, `active` → `connected`, `hangup`/`destroy` → `ended`, `default` → `null` — est copié caractère pour caractère. Deux copies veut dire : le jour où Telnyx ajoute un état (`answering`, `purge`…), on corrige un fichier sur deux.

**Recommandation** — dans `rtcClient.ts`, une seule fonction qui parle le vocabulaire SDK, pas le vocabulaire produit :

```ts
/** États SDK Telnyx 2.27.8 → vocabulaire commun. null = état inconnu :
 *  l'appelant NE DOIT PAS toucher sa machine à états (fix audit 11.3 B3). */
export type TelnyxPhase = 'dialing' | 'ringing' | 'connected' | 'held' | 'ended';
export function telnyxPhase(state?: string): TelnyxPhase | null { /* le switch, une fois */ }
```

Puis, côté `useRtcCall`, une table de 5 entrées `TelnyxPhase → CallPhase` (`held → on_hold`) ; côté `useDialerPool`, une table de 4 entrées (`held` ignoré, `return` early). Le contrat « inconnu ⇒ null ⇒ ne pas bouger », qui est le fix de l'audit 11.3, devient documenté **une seule fois** au lieu d'être un commentaire dans un fichier et un `default: return null` nu dans l'autre.

### 1.2 — Type `TelnyxNotification` déclaré deux fois, différemment (P1)

- `useRtcCall.ts:38-41` → `{ call?: { state?, callId?, callState? }, event? }`
- `useDialerPool.ts:29-32` → `{ call?: { state?, callId?, id? }, event? }`

Deux vues partielles et **divergentes** du même payload SDK : l'un connaît `callState`, l'autre connaît `id`. `useRtcCall:248` lit `n?.call?.state ?? n?.call?.callState` ; `useDialerPool:287-288` lit `n?.call?.callId ?? n?.call?.id` et **ignore** `callState`. Résultat : si le SDK envoie `callState` sur un appel de pool, le pool ne voit rien. Le champ `event?` n'est lu ni dans un fichier ni dans l'autre.

**Recommandation** — un seul type exporté depuis `rtcClient.ts` avec l'union complète des champs observés, et **supprimer `event?`** qui n'est jamais lu :

```ts
export type TelnyxNotification = {
  call?: { state?: string; callState?: string; callId?: string; id?: string };
};
export const notifState = (n: TelnyxNotification) => n.call?.state ?? n.call?.callState;
export const notifCallId = (n: TelnyxNotification) => n.call?.callId ?? n.call?.id;
```

Les deux hooks importent le type et les deux accesseurs. Effet de bord bienvenu : le pool récupère `callState` gratuitement.

### 1.3 — Construction des options `newCall()` (P2)

- `useRtcCall.ts:224-239`
- `useDialerPool.ts:132-141`

Même séquence dans les deux : chercher l'élément `<audio data-rtc-remote…>` avec `document.querySelector`, poser `audio: AUDIO_CONSTRAINTS`, spread conditionnel de `preferred_codecs`, spread conditionnel de `remoteElement`. Deux détails aggravants :

- **`getPreferredCodecs()` est appelé deux fois par `newCall`** (`useRtcCall.ts:234-236`, `useDialerPool.ts:139`) : une fois dans la condition du ternaire, une fois dans la valeur. La fonction fait un `RTCRtpSender.getCapabilities()` + un `sort` à chaque appel. Bénin en coût, mais c'est le genre de motif qu'on recopie.
- Le sélecteur d'élément audio diverge : `audio[data-rtc-remote]` (mono) vs `audio[data-rtc-remote-${slot}]` (pool, attribut **jamais rendu** — cf. §8.3).

**Recommandation** — dans `rtcClient.ts` :

```ts
/** Options newCall communes (qualité audio + codec préféré + sortie audio).
 *  `remoteSelector` : sélecteur de l'élément <audio> où le SDK attache le flux
 *  distant — sans lui l'appel part mais on n'entend rien (fix B2 audit 11.3). */
export function newCallOptions(destinationNumber: string, remoteSelector: string, extra?: {...}) {
  const codecs = getPreferredCodecs();            // ← un seul appel
  const audioEl = document.querySelector<HTMLAudioElement>(remoteSelector);
  return { destinationNumber, audio: AUDIO_CONSTRAINTS,
           ...(codecs ? { preferred_codecs: codecs } : {}),
           ...(audioEl ? { remoteElement: audioEl } : {}), ...extra };
}
```

`useRtcCall` appelle avec `'audio[data-rtc-remote]'` + `{ callerNumber }` ; `useDialerPool` avec `` `audio[data-rtc-remote-${slot}]` `` + `{ id: callIdForSlot(slot) }`.

### 1.4 — Handler `telnyx.error` : extraction du message identique (P1)

- `useRtcCall.ts:288-294`
- `useDialerPool.ts:326-334`

Les 3 lignes `e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Erreur WebRTC Telnyx.'` sont copiées à l'identique, chaîne de fallback comprise. Seule la **réaction** diffère (l'un passe en `failed` avec message UI, l'autre `console.error` + reset).

**Recommandation** — `export function telnyxErrorMessage(e: unknown): string` dans `rtcClient.ts`. Les deux hooks gardent leur réaction propre, qui est bien ce qui doit rester distinct.

### 1.5 — Bootstrap du client (P3)

- `useRtcCall.ts:172-191` (token) + `328-335` (connect)
- `useDialerPool.ts:261-277` (token + client) + `336-341` (connect)

Même chorégraphie : `fetchRtcToken` → `createRtcClient(token)` → `null ⇒ simulation` → attacher les listeners → `await client.connect()` dans un `try/catch`. Mais les **politiques d'erreur divergent volontairement** : `useRtcCall` distingue dry-run (échec token toléré) de production (échec token = `failed` + message), `useDialerPool` avale toujours l'échec en `rtcToken = null`.

**Recommandation** — factoriser **uniquement** l'acquisition, pas la politique :

```ts
/** Token éphémère → client SDK, ou null (dry-run : le serveur n'émet pas de
 *  token ⇒ zéro paquet vers rtc.telnyx.com — garantie G2). Throw = échec réseau
 *  réel : l'appelant décide s'il tolère (dry-run) ou pas (production). */
export async function connectRtcClient(token: string, callerNumber?: string): Promise<RtcClientHandle | null>
```

Classé **P3** parce que c'est le seul point où une factorisation peut silencieusement effacer une différence de politique voulue : à faire avec un test par branche (dry-run tolère / prod échoue), pas à la volée.

### 1.6 — `try { hangup() } catch { /* déjà raccroché */ }` × 6 (P1)

`useRtcCall.ts:133-142` (×2, cleanup), `357-366` (×2, hangup) ; `useDialerPool.ts:99-110` (×2, cleanup), `303-308`, `353-356`, `374-379`. Six copies du même motif « raccrocher sans jamais throw ».

**Recommandation** — deux helpers d'une ligne dans `rtcClient.ts` : `safeHangup(call)` et `safeDisconnect(client)`. Gain : ~30 lignes, et surtout un seul endroit où changer d'avis si on décide un jour de logger ces échecs plutôt que de les avaler.

**Bilan §1** : 1.1 + 1.2 + 1.4 + 1.6 ≈ **80 lignes supprimées, zéro risque**, tout va dans `rtcClient.ts` qui est déjà la frontière SDK. 1.3 et 1.5 sont à faire ensuite, avec tests.

---

## 2. Code mort, exports inutilisés, redondances

Tous les points ci-dessous ont été vérifiés par `grep` sur `src/` **et** `api/`.

### 2.1 — `index.ts` : barrel jamais importé (P1)

`src/apps/calls/modules/dialer/index.ts` (9 lignes). Les 5 consommateurs du module importent **tous** en chemin direct :

```
CallManagerApp.tsx:54  ./modules/dialer/DialerView
CallManagerApp.tsx:55  ./modules/dialer/PowerDialerView
CallManagerApp.tsx:56  ./modules/dialer/DialerProvider
CallManagerApp.tsx:57  ./modules/dialer/CallBar
CallManagerApp.tsx:58  ./modules/dialer/dialerApi
```

Aucun `from '.../modules/dialer'` nulle part. Le barrel n'est ni un point d'entrée ni une contrainte d'architecture — c'est un fichier orphelin qui maintient artificiellement en vie `orchestrator.ts` (2.2) et trois types morts (2.3).

**Recommandation** — supprimer `index.ts`. Si l'on tient à un point d'entrée, alors il faut faire l'inverse : le remplir avec ce qui est **réellement** public (`DialerProvider`, `useDialer`, `CallBar`, `DialerView`, `PowerDialerView`, `CallPhase`) et faire pointer les 5 imports de `CallManagerApp` dessus. Les deux options se défendent ; laisser un barrel qui ment est la seule qui ne se défend pas.

### 2.2 — `application/orchestrator.ts` : stub noop (P1)

25 lignes, `createOrchestrator()` retourne `{ lines: [], dial: noop, hangup: noop, onEvent: () => noop }`. Appelé **nulle part** hors du barrel mort. Son en-tête annonce « Phase 11.2 will implement: parallel N-line orchestration » — or l'orchestration N-lignes **a été livrée au lot 11.5** dans `application/poolLogic.ts`.

C'est le pire type de code mort : un développeur qui cherche « où est l'orchestration ? » tombe sur un fichier nommé `orchestrator.ts` qui ne fait rien, et peut légitimement conclure que la fonctionnalité n'existe pas.

**Recommandation** — supprimer le fichier. La vraie orchestration est `poolLogic.ts` + `useDialerPool.ts`, et c'est ce que l'en-tête du module doit dire.

### 2.3 — `domain/CallState.ts` : 3 types sur 4 sans usage réel (P1)

| Type | Usage réel |
|---|---|
| `CallPhase` | **vivant** — `useRtcCall`, `CallBar:3`, `DialerView:9` |
| `CallLine` | uniquement `orchestrator.ts:8` (mort) |
| `CallLineId` | uniquement `CallLine.id` / `DialerEvent.lineId` (morts) |
| `DialerEvent` | uniquement `orchestrator.ts:14` (mort) |

En supprimant `orchestrator.ts` (2.2) et `index.ts` (2.1), ces trois types tombent à zéro référence. Ils décrivent un modèle (`startedAt`, `connectedAt`, `recordingUrl`, `DialerEvent.type`) qui n'a **jamais** été implémenté côté client — le registre des appels vit côté serveur (`api/_dialer/webhooks.js`).

**Recommandation** — réduire `domain/CallState.ts` à `CallPhase` seul, et lui donner enfin un en-tête qui parle de la phase d'appel (cf. 5.3). Si le modèle `CallLine`/`DialerEvent` doit revivre un jour, il reviendra aligné sur le schéma serveur réel, pas sur un brouillon du lot 11.1.

### 2.4 — `RtcCallStatus` : export mort et redondant (P1)

`useRtcCall.ts:21-25`. Exporté, **zéro import** dans tout le repo. Et il duplique exactement les 3 premiers champs de `UseRtcCallResult` (`phase`, `error`, `durationSec`, lignes 28-30) — deux types pour la même chose, dont un que personne n'utilise. Voir aussi §3.

**Recommandation** — supprimer les 5 lignes.

### 2.5 — Timer vide dans le pool : `timersRef` / `stopTimer` sont morts (P1)

`useDialerPool.ts:312-314` :

```ts
timersRef.current[slot] = setInterval(() => {
  // durée de la ligne connectée (à afficher)
}, 1000);
```

Un `setInterval` **au corps vide**, à 1 Hz, pour la durée de l'appel. Il n'écrit rien, ne déclenche aucun render, n'alimente aucun affichage. Autour de lui gravitent : `timersRef` (l.93), `stopTimer()` (l.119-124), trois appels à `stopTimer` (l.299, 318, 358, 381) et une boucle de nettoyage au unmount (l.111-113). **Une trentaine de lignes existent pour piloter un timer qui ne fait rien.**

À noter : `stopTimer(slot)` est appelé l.299 **juste avant** que la l.312 ne recrée un interval sur le même slot — dans le même bloc `if (p === 'connected')`.

**Recommandation** — deux issues, choisir explicitement :

- **(a) supprimer** `timersRef`, `stopTimer` et ses 4 appels (≈ −30 lignes) ; c'est cohérent avec 2.6 (`durationSec` n'est de toute façon jamais affiché dans `PowerDialerView`).
- **(b) le brancher** : `dispatch({ type: 'line-tick', slot })` + un `case` dans `poolReducer` qui incrémente `line.durationSec`, et un affichage dans `PowerDialerView`.

Dans un lot de consolidation, **(a)**. (b) est une feature, elle mérite son propre lot.

### 2.6 — `PoolLine.durationSec` toujours à 0 (P1)

`PoolState.ts:23` (type), `PoolState.ts:46` et `poolLogic.ts:29` (init à 0). **Aucun reducer ne l'incrémente**, `PowerDialerView` ne l'affiche pas. Champ décoratif. Corollaire direct de 2.5 : à supprimer avec (a), à brancher avec (b).

### 2.7 — `_end` et `_unref` : deux casts qui ne font strictement rien (P1)

`useRtcCall.ts:208-209` :

```ts
// On garde la référence pour le bouton Raccrocher.
(sim as unknown as { _end?: ReturnType<typeof setTimeout> })._end = end;
```

Le commentaire annonce que la référence est gardée « pour le bouton Raccrocher » — **`_end` n'est relu nulle part**, et `hangup()` (l.354-371) ne le consulte pas. On attache une propriété à un objet timeout, et on l'oublie. Conséquence réelle en §8.2.

`useRtcCall.ts:370` :

```ts
(wrap as unknown as { _unref?: () => void })._unref?.();
```

`_unref` n'existe pas sur les timers navigateur (c'est `unref()` côté Node, sur `Timeout`). Le `?.()` garantit que ce n'est **jamais** appelé. Deux casts `as unknown as` pour un no-op.

**Recommandation** — supprimer la l.209 et la l.370 ; garder les timers dans des `useRef` s'ils doivent être annulables (cf. §8.2), sinon les laisser anonymes.

### 2.8 — Branche `p === 'failed'` inatteignable (P1)

`useRtcCall.ts:273` : `if (p === 'ended' || p === 'failed') stopTimer();`. Or `phaseFromTelnyx` (l.50-69) ne retourne **jamais** `'failed'` — son image est `{dialing, ringing, connected, on_hold, ended, null}`. Le typage `CallPhase` rend la comparaison légale, donc TypeScript ne la signale pas.

**Recommandation** — remplacer par `if (p === 'ended') stopTimer();`. Après le typage `TelnyxPhase` proposé en 1.1, la branche deviendrait une **erreur de compilation**, ce qui est exactement le but.

### 2.9 — `useMemo(() => rtc, [rtc])` (P1)

`DialerProvider.tsx:29`. `rtc` est l'objet littéral retourné par `useRtcCall` — **nouvelle identité à chaque render**. La dépendance change donc à chaque fois, le memo recalcule à chaque fois : c'est un `const value = rtc` déguisé, avec un faux signal de « on a optimisé les re-renders du contexte ».

**Recommandation** — `<DialerContext.Provider value={rtc}>`, supprimer l'import `useMemo`. (Si l'on veut *réellement* stabiliser le contexte, c'est `useRtcCall` qui doit mémoïser son objet de retour — autre chantier, autre lot.)

### 2.10 — `PoolState.connectedSlot` : écrit, jamais lu en production (P1)

`PoolState.ts:33`, écrit par `poolLogic.ts:62` et `:92`. Seule lecture du repo : `poolLogic.test.ts:48`. `PowerDialerView` déduit la ligne connectée de `line.phase === 'connected'` (l.66, 151-157, 174) et n'utilise jamais `connectedSlot`.

**Recommandation** — supprimer le champ et l'assertion du test **ou** l'utiliser dans `PowerDialerView` à la place des trois comparaisons `phase === 'connected'`. Un champ dont le seul lecteur est son propre test est un champ mort avec un alibi.

### 2.11 — `dialCall()` : dérive client/serveur (P2)

`dialerApi.ts:92-119` + les types `DialCallParams` (l.40-47) et `DialCallResult` (l.49-61). Seul appelant du repo : `dialerApi.test.ts`. Le chemin d'appel réel est **100 % WebRTC** — `ContactCardPanel:47` et `DialerView:100` passent par `useDialer().startCall()`, qui appelle `fetchRtcToken` et jamais `dialCall`.

Côté serveur, `POST /api/dialer?resource=dial` **existe toujours** (`api/dialer.js:186` `handleDial`, routé l.352) avec sa porte flags + budget + entitlement. `DialerView.test.tsx:110-112,168` va jusqu'à **asserter qu'aucun appel vers `resource=dial` n'est émis** — la non-utilisation est donc un invariant testé, pas un oubli.

C'est **P2 et pas P1** : ce n'est pas du code mort évident, c'est une décision produit. Deux lectures possibles — (a) l'API dial serveur est le fallback / le futur chemin *call control* et le client typé doit rester, (b) le WebRTC a gagné et les deux côtés doivent partir.

**Recommandation** — ne rien supprimer sans arbitrage. Documenter l'état dans l'en-tête de `dialerApi.ts` :

```
 * NOTE (11.13) : dialCall() n'a AUCUN appelant en production — le dial passe
 * par WebRTC (fetchRtcToken + SDK). Le endpoint serveur ?resource=dial reste
 * en place (api/dialer.js:186). Conservé pour <raison> / à supprimer au lot <n>.
```

**Question ouverte pour Théo** : garde-t-on le chemin dial serveur ?

**Volume total du code mort (2.1 → 2.10)** : ≈ **120 lignes** supprimables sans le moindre changement de comportement observable.

---

## 3. Cohérence des types

### 3.1 — `CallPhase` vs `PoolPhase` : socle commun extractible (P2)

`domain/CallState.ts:11-19` vs `domain/PoolState.ts:9-16` :

```
CallPhase : idle · dialing · ringing · connected · on_hold · wrapping · ended · failed
PoolPhase : idle · dialing · ringing · connected ·            skipped  · ended · failed
```

**6 valeurs sur 8 sont communes.** Les différences sont légitimes et doivent le rester : `on_hold`/`wrapping` sont mono-ligne (l'ACW n'a de sens que sur l'appel qu'on vient de finir), `skipped` est pool (abandonner une ligne au profit d'une autre).

**Recommandation** — nommer explicitement le socle plutôt que le laisser implicite :

```ts
// domain/CallState.ts
/** Phases communes à toute ligne d'appel (mono-ligne et pool). */
export type LinePhase = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'failed';
/** Mono-ligne : + mise en attente et clôture (ACW, jamais d'auto-next — ARCEP). */
export type CallPhase = LinePhase | 'on_hold' | 'wrapping';
// domain/PoolState.ts
/** Pool : + ligne abandonnée au profit d'une autre (skip / réponse ailleurs). */
export type PoolPhase = LinePhase | 'skipped';
```

Bénéfice concret et immédiat : le mapping de 1.1 retourne `LinePhase | null`, les deux hooks le consomment sans cast, et l'ajout d'un état SDK se propage aux deux par le compilateur.

**Ne pas** fusionner en une seule `Phase` à 9 valeurs : `PowerDialerView.PHASE_LABEL` (`Record<PoolLine['phase'], string>`) devrait alors fournir des libellés pour `on_hold`/`wrapping` qui ne surviennent jamais dans un pool — on échangerait une duplication contre du mensonge de type.

### 3.2 — `RtcCallStatus` vs `UseRtcCallResult` (P1)

`RtcCallStatus` (l.21-25) est mort (2.4) et redondant avec les l.28-30 de `UseRtcCallResult`. Par ailleurs le type de `callStats` — `{ mos: number; codec?: string; jitterMs?: number; rttMs?: number }` — est écrit **deux fois à l'identique** (l.32 dans le type de retour, l.101 dans le `useState`).

**Recommandation** :

```ts
/** Qualité de l'appel en cours. mos/jitter/rtt : telnyx.stats.frame.
 *  codec : lu via pc.getStats() (absent du frame SDK). */
export type CallStats = { mos: number; codec?: string; jitterMs?: number; rttMs?: number };
```

…utilisé aux deux endroits, et `RtcCallStatus` supprimé. `UseRtcCallResult` reste **le seul** contrat public du hook — ce qui est cohérent avec `useDialerPool` qui n'expose que `UseDialerPoolResult`. Les deux hooks exposent alors un type et un seul, de la même façon.

Note : `rttMs` est alimenté (l.315) mais **jamais affiché** — `DialerView:187-193` montre codec, MOS et jitter uniquement. À garder (utile en diagnostic console) mais à signaler comme tel dans le commentaire du type.

### 3.3 — Type codec inline écrit 3 fois (P1)

`rtcClient.ts` : l.25 (dans `newCall`), l.49 (retour de `getPreferredCodecs`), l.61 (cast de sortie). Trois copies de :

```ts
Array<{ mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string }>
```

**Recommandation** — `export type RtcCodec = { mimeType: string; clockRate: number; channels?: number; payloadType?: number; sdpFmtpLine?: string };`, puis `RtcCodec[]` aux trois endroits. La ligne 25 (signature de `newCall`) redevient lisible sur un écran.

### 3.4 — `PHASE_LABEL` triplé, avec un libellé divergent (P1)

- `CallBar.tsx:18-27` — `Record<CallPhase, string>`, `wrapping: 'Clôture…'`
- `DialerView.tsx:44-53` — `Record<CallPhase, string>`, `wrapping: 'Fermeture…'`
- `PowerDialerView.tsx:24-32` — `Record<PoolLine['phase'], string>`

Les deux premiers sont censés être identiques et **ne le sont pas** : la même phase s'appelle « Clôture… » dans la CallBar et « Fermeture… » dans le DialerView, sur le même écran, au même instant. C'est la signature exacte d'un copier-coller qui a divergé.

**Recommandation** — un `domain/phaseLabels.ts` :

```ts
export const CALL_PHASE_LABEL: Record<CallPhase, string> = { … wrapping: 'Clôture…' … };
export const POOL_PHASE_LABEL: Record<PoolPhase, string> = { … skipped: 'Abandonné' … };
```

Deux tables (les vocabulaires produit diffèrent), mais **une seule** définition par vocabulaire. Trancher au passage : « Clôture… » ou « Fermeture… ».

---

## 4. Nettoyage des listeners SDK (question explicite du brief)

**Réponse : non, aucun listener n'est explicitement retiré — ni dans `useDialerPool`, ni dans `useRtcCall`. Il n'y a aucun `client.off` dans le repo, et le type `RtcClientHandle` n'expose même pas de méthode `off`.**

Détail vérifié (`grep -rn "client.off\|\.off(" src/apps/calls/modules/dialer/` → 0 résultat) :

| Hook | Listeners attachés | Retirés ? | Filet de sécurité |
|---|---|---|---|
| `useDialerPool` | `telnyx.ready` (l.280), `telnyx.notification` (285), `telnyx.socket.close` (322), `telnyx.error` (326) | ❌ | `disconnect()` au unmount (l.107) |
| `useRtcCall` | `telnyx.ready` (l.218), `telnyx.notification` (246), `telnyx.socket.close` (278), `telnyx.error` (288), `telnyx.stats.frame` (300) | ❌ | `disconnect()` au unmount (l.139) + `clientRef = null` (l.143) |

`rtcClient.ts:26` : `on: (event: string, cb: (data: unknown) => void) => void;` — pas de `off` dans le contrat, donc **pas de retrait possible** en l'état, même en le voulant.

**Y a-t-il une fuite réelle ?** Sur le chemin nominal, **non** :
- les listeners ferment sur `dispatch` / `setIsRunning` / `setPhaseSafe`, tous stables et sans effet après unmount en React 18 (pas de warning, pas de crash) ;
- le `disconnect()` du cleanup ferme le socket, donc plus d'événement entrant ;
- l'instance client devient inatteignable et part au GC avec ses listeners.

**Mais trois défauts structurels** :

### 4.1 — Pas de `off` dans le contrat (P2)

Tant que `RtcClientHandle` n'a pas de `off`, on **dépend de `disconnect()`** pour tout. Si le SDK émet un `telnyx.error` **pendant** le `disconnect()` (cas courant : socket coupé côté serveur), le handler tourne encore et, dans le pool, fait `setIsRunning(false)` + `dispatch({type:'reset'})` sur un composant démonté.

**Recommandation** — ajouter `off?: (event: string, cb: (data: unknown) => void) => void;` à `RtcClientHandle` (le SDK Telnyx l'expose ; l'optionnel `?` protège les mocks de test), garder les callbacks dans des `const` nommées, et retirer avant `disconnect()` dans le cleanup. ~10 lignes par hook, et le cleanup devient auto-documenté.

### 4.2 — Asymétrie de cleanup entre les deux hooks (P1)

`useRtcCall.ts:143-144` met `clientRef.current = null; callRef.current = null;` après le `disconnect()`. `useDialerPool.ts:106-110` **ne le fait pas** — ni `clientRef.current = null`, ni `callsRef.current = []`. Aucune conséquence à l'unmount (le composant est mort), mais c'est exactement le genre d'asymétrie qui fait qu'on lit les deux hooks en se demandant lequel a raison.

**Recommandation** — aligner : ajouter `clientRef.current = null; callsRef.current = [];` dans le cleanup du pool. Une ligne, zéro risque, et les deux hooks se lisent enfin pareil.

### 4.3 — Le vrai sujet est ailleurs : `useRtcCall` n'a pas de cleanup **inter-appels** (P2 — voir §8.1)

Le cleanup au **unmount** est correct. Ce qui manque, c'est le cleanup entre **deux appels successifs** : `useRtcCall.ts:191` fait `clientRef.current = client` **sans déconnecter le client précédent**. Détaillé en §8.1 parce que c'est un écart de comportement, pas de style.

---

## 5. Documentation manquante ou trompeuse

Le module est **abondamment commenté** — c'est une force réelle : les fixes des audits 11.2 / 11.3 sont tracés, les garanties ARCEP et G2 sont rappelées là où elles se jouent. Le problème n'est pas le volume, c'est que **plusieurs commentaires décrivent un code qui n'existe plus ou n'a jamais existé**. Un commentaire faux est pire que pas de commentaire : on lui fait confiance.

### 5.1 — `poolLogic.ts:1-14` décrit une API inexistante (P1) — le plus grave

L'en-tête documente trois fonctions : `skipLine()`, `onAnswered()`, `onLineEnded()`. **Aucune des trois n'existe.** Le fichier exporte `poolReducer(state, action)` et un type `PoolAction`, avec des actions `'skip'`, `'answered'`, `'line-ended'`. C'est la documentation d'une version antérieure (API impérative) collée sur une implémentation en reducer.

**Recommandation** — réécrire l'en-tête en vocabulaire d'actions :

```
 * Réducteur pur du power dialing (lot 11.5) — aucun SDK, aucun React.
 * Actions :
 *   play        compose min(size, restants) — déclenchement HUMAIN, no-op si running
 *   skip        abandonne une ligne, compose le suivant de la file
 *   answered    réponse humaine : la ligne passe connected, les autres skipped
 *   line-ended  fin de la ligne connectée → running=false. JAMAIS d'auto-next (ARCEP §7.1.3)
```

Les règles produit (le contenu utile de l'en-tête actuel) sont conservées ; seuls les noms de fonctions fantômes disparaissent.

### 5.2 — `index.ts:3-5` : promesse de 11 lots de retard (P1)

« Phase 11.2 will export: createOrchestrator, useTelnyxDialer hook, PowerDialerView, ACWOverlay, types. » On est au **lot 11.13**. `useTelnyxDialer` et `ACWOverlay` n'ont jamais existé ; `PowerDialerView` existe mais n'est pas exporté par ce barrel. Disparaît avec 2.1.

### 5.3 — `domain/CallState.ts:1-7` : en-tête de module dans un fichier de types (P1)

Le fichier commence par « `modules/dialer/` — Telephony-agnostic dialer module. Telnyx (Phase 11) is an adapter inside `infrastructure/telnyx/`. Call state, line concurrency, retries, recording, ACW belong here… ». C'est la doc **du module**, dans un fichier qui ne définit que des types d'état d'appel. Elle annonce en outre « line concurrency, retries, recording, ACW » — dont **rien** n'est implémenté ici (la concurrence est dans `poolLogic.ts`, retries et recording n'existent pas côté client).

**Recommandation** — déplacer le paragraphe d'architecture dans un `README.md` du dossier `dialer/` (ou l'en-tête de `DialerProvider.tsx`, seul point d'entrée réel), et donner à `CallState.ts` un en-tête vrai : « Phases d'un appel mono-ligne. Vocabulaire produit, indépendant du SDK — le mapping SDK→phase vit dans `infrastructure/telnyx/`. »

### 5.4 — `rtcClient.ts:39-48` : journal d'investigation en guise de doc (P1) — point cité au brief

10 lignes de commentaire pour une fonction de 15 lignes, et ce sont des **notes d'enquête** : « Données réelles (call reports) », « jitter buffer 238ms », « Le bitrate n'était pas le problème (artefact ÷5s) ; la latence + écho de l'auto-appel étaient les vrais coupables ». Ces informations sont précieuses — mais leur place est dans `docs/audits/lot-11.4-bitrate-investigation.md`, **qui existe déjà**.

Même remarque, plus nette, pour `useRtcCall.ts:296-299` : le commentaire cite le **bundle minifié** du SDK — « vérifié dans le bundle : StatsFrame,function({data:e})… ». C'est de l'archéologie. L'information utile tient en une phrase.

**Recommandation** — garder l'invariant, renvoyer l'enquête au doc :

```ts
/** Codecs préférés : G.722 d'abord (pas de transcodage vers le PSTN → HD
 *  jusqu'au mobile), OPUS en fallback. Verdict lot 11.4 :
 *  docs/audits/lot-11.4-bitrate-investigation.md */
```

```ts
// telnyx.stats.frame : le payload est enveloppé dans { data } et NE CONTIENT
// PAS le codec — celui-ci est lu via pc.getStats() (readCodecFromPeer).
```

Règle générale suggérée pour le module : **le commentaire porte l'invariant, le doc d'audit porte l'enquête**, avec un lien de l'un vers l'autre.

### 5.5 — `useDialerPool.ts:69-70` : doc fausse de `isRunning` (P1)

`/** Ligne active (appel en cours sur au moins un slot). */ isRunning: boolean;`

Faux. `setIsRunning(true)` est fait par `play()` (l.251) **avant** toute composition, y compris quand la file est vide ; `setIsRunning(false)` est déclenché par `telnyx.socket.close` (l.323) et `telnyx.error` (l.331), c'est-à-dire **précisément quand plus rien n'est actif**. `isRunning` signifie « un cycle Play est ouvert », pas « une ligne est active ». C'est d'ailleurs ce sens-là que `PowerDialerView:98` utilise pour basculer Play ↔ Tout raccrocher — le code est juste, la doc ment.

**Recommandation** — `/** Un cycle Play est ouvert (≠ « une ligne est active ») : pilote la bascule Play ↔ Tout raccrocher. */`

### 5.6 — `useRtcCall.ts:208` : commentaire qui décrit une intention non tenue (P1)

« On garde la référence pour le bouton Raccrocher » — la référence est posée sur `_end` et **jamais relue** (2.7, §8.2). Le commentaire fait croire à un mécanisme qui n'existe pas.

### 5.7 — Deux simulations divergentes, aucune ne mentionne l'autre (P2)

`useRtcCall.ts:194-212` : mono-ligne, `ringing` à t+0, `connected` à t+1,5 s, `wrapping` à t+30 s. `useDialerPool.ts:203-246` : pool, `ringing` à t+300 ms, `answered` à t+2 s, `ended` à t+10 s (ou skips à 3/6/9 s). Les valeurs n'ont aucune raison de coïncider — mais **rien ne dit que deux simulations coexistent**, ni pourquoi elles diffèrent. Un lecteur qui débogue « la démo » ne sait pas laquelle il regarde.

Bon point à conserver : `useDialerPool.ts:143-147` (placeholder 20 s vs AMD premium en production) est **exactement** le bon niveau de commentaire — il dit ce qui est temporaire, pourquoi, et ce qui le remplacera. À prendre comme modèle pour le reste du module.

**Recommandation** — une ligne croisée dans chaque en-tête : « Simulation mono-ligne (démo). Le pool a sa propre simulation, voir `useDialerPool.startDemoSimulation` — les timings diffèrent volontairement. »

### 5.8 — `console.debug` / `console.error` résiduels (P1)

`useRtcCall.ts:254` et `:260` (`console.debug('[rtc] …')`), `useDialerPool.ts:333` (`console.error('[dialer.pool]', msg)`). Ce sont des sondes de diagnostic livrées en production. Les deux `console.debug` sont **justifiés** (ils tracent les notifications SDK non mappées, cœur du fix 11.3 B3) — mais ils méritent d'être documentés comme volontaires, sinon quelqu'un les supprimera par « propreté ».

Le `console.error` du pool, lui, est le **seul** signalement d'une erreur SDK côté pool : cf. §8.4.

**Recommandation** — préfixer d'un commentaire `// Diagnostic VOLONTAIRE (fix 11.3 B3) : trace les états SDK non mappés.` et, à terme, passer par un helper `dialerLog()` désactivable — pas dans ce lot.

---

## 6. CSS : `.calls-power__*` est-il dupliqué avec `.calls-dialer__*` ?

**Réponse : non, pas de duplication de blocs.** `calls-dialer.css` fait 221 lignes, chaque sélecteur est utilisé, et il n'y a **aucune règle morte** (vérifié classe par classe contre les `.tsx`). `.calls-power__line--connected` n'apparaît pas littéralement dans le JSX mais est bien produit par le template `` `calls-power__line calls-power__line--${line.phase}` `` (`PowerDialerView.tsx:147`).

Ce qui est dupliqué, ce sont des **déclarations atomiques** et des **variantes non intentionnelles**.

### 6.1 — `font-variant-numeric: tabular-nums` × 5 (P1)

L.43 (`__duration`), l.73 (`callbar__dest`), l.102 (`power__counter-value`), l.140 (`power__line-dest`), l.159 (`power__queue-item`). Les l.42-45, 72-76 et 139-143 vont plus loin : **`tabular-nums` + `font-weight: 600`**, soit trois copies de la même paire, une par bloc BEM.

**Recommandation** — une utilitaire unique et trois sélecteurs groupés :

```css
/* Tout ce qui affiche un numéro ou un chrono : chiffres à chasse fixe. */
.calls-dialer__duration,
.calls-callbar__dest,
.calls-power__line-dest { font-variant-numeric: tabular-nums; font-weight: 600; }
.calls-power__counter-value,
.calls-power__queue-item { font-variant-numeric: tabular-nums; }
```

≈ −8 lignes, et la règle « un numéro s'affiche en tabular-nums » devient visible au lieu d'être répartie sur cinq blocs.

### 6.2 — Trois variantes de « petit texte grisé » (P1)

| Sélecteur | `font-size` | `opacity` |
|---|---|---|
| `.calls-power__hint` (l.168) | 0.85rem | 0.6 |
| `.calls-dialer__hint` (l.196) | 0.72rem | 0.65 |
| `.calls-dialer__note` (l.217) | 0.75rem | 0.6 |

Trois tailles et deux opacités pour le même rôle sémantique (texte secondaire). Rien ne justifie l'écart — c'est de la dérive de copier-coller, pas une décision de design.

**Recommandation** — deux niveaux, pas trois : `--dialer-hint` (0.75rem / 0.65) pour l'aide en ligne, et garder `.calls-power__hint` distinct **seulement** si le bloc pédagogique du power dialer doit vraiment être plus gros (il est plus long, l'argument tient). Trancher explicitement plutôt que subir.

### 6.3 — Surface de carte répétée (P2)

`.calls-power__counter` (l.95-96) et `.calls-power__line` (l.122-123) partagent `border-radius: 10px; background: rgba(255,255,255,0.04)`, et `.calls-power__line` ajoute `border: 1px solid rgba(255,255,255,0.06)`. Ces valeurs littérales (`rgba(255,255,255,0.04)`, `0.06`, `10px`) sont recopiées alors que le fichier utilise déjà des variables ailleurs (`--xos-border`, `--xos-input-bg`, `--xos-text`, l.183-193).

**Recommandation** — homogénéiser vers les tokens `--xos-*` existants, ou déclarer `--dialer-surface` / `--dialer-radius` en tête de fichier. Le fichier mélange aujourd'hui deux conventions ; en choisir une.

### 6.4 — Fuite de bloc BEM et sélecteur manquant (P1)

- `PowerDialerView.tsx:165` utilise `className="calls-dialer__error"` **à l'intérieur** du bloc `.calls-power` — pragmatique (le style est identique) mais ça brise la convention BEM et rend le CSS impossible à découper par vue. **Recommandation** : renommer en `.calls-dialer-error` (classe transverse assumée) et grouper avec les autres transverses en tête de fichier, ou ajouter `.calls-power__line-error` en `@extend` manuel. Choisir, et l'écrire dans un commentaire.
- `DialerView.tsx:216-226` rend un `<select>` dans `.calls-dialer__form`, or le fichier ne style que **`.calls-dialer__form input`** (l.186-194). Le sélecteur de caller ID est donc rendu **non stylé** (natif) à côté d'inputs stylés. **Recommandation** : `.calls-dialer__form input, .calls-dialer__form select { … }`. Une ligne, incohérence visuelle réglée.

---

## 7. Lisibilité générale

### 7.1 — `useDialerPool` : ordre des déclarations (P1) — le point le plus coûteux à la lecture

Le fichier déclare ses dépendances **après** leurs utilisateurs :

| Ligne | Utilise | Déclaré ligne |
|---|---|---|
| 97-116 (cleanup `useEffect`) | `demoTimersRef` | **180** |
| 127-160 (`dialSlot`) | `stateRef` | **163** |
| 127-160 (`dialSlot`) | `skipRef` | **167** |

Ça **fonctionne** (les closures ne résolvent le binding qu'à l'exécution, bien après l'initialisation), mais c'est fragile et surtout illisible : on lit le cleanup en se demandant ce qu'est `demoTimersRef`, et il faut descendre 83 lignes pour le savoir.

**Recommandation** — regrouper **toutes** les refs juste après le `useReducer` (l.86-95) :

```ts
const clientRef   = useRef<RtcClientHandle | null>(null);
const callsRef    = useRef<(RtcCallHandle | null)[]>([]);
const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
const stateRef    = useRef(state);   // état courant pour les listeners (pas de closure périmée)
const skipRef     = useRef<(slot: number) => void>(() => {});  // brise le cycle dialSlot ↔ skip
stateRef.current  = state;
```

…puis les callbacks dans l'ordre d'appel : `stopTimer` → `dialSlot` → `composeAfterPlay` → `startDemoSimulation` → `play` → `skip` → `hangupAll` → `setQueue`, et le `useEffect` de cleanup **en dernier**. Pur déplacement de lignes, zéro changement de comportement, gros gain de lecture.

### 7.2 — Le pattern `skipRef` / `stateRef` (P2) — question explicite du brief

Le pattern est **justifié dans son principe** : `dialSlot` (l.148-153) doit appeler `skip` au timeout de non-réponse, et `skip` (l.363) doit rappeler `dialSlot` pour composer le suivant. Cycle réel. Le passer par une ref est la solution la plus simple ; l'alternative « hoisting par `useCallback` » ne marche pas, et extraire une machine à états serait disproportionné.

Deux critiques précises néanmoins :

**(a) l'assignation se fait pendant le render** — `useDialerPool.ts:164` (`stateRef.current = state`) et `:370` (`skipRef.current = skip`). Écrire dans une ref pendant le render est un effet de bord de render : React le tolère ici parce que l'opération est idempotente, mais c'est contraire aux règles officielles et ça surprendra sous StrictMode / concurrent.

**Recommandation** — encadrer et documenter :

```ts
// Refs de synchronisation : les listeners SDK et les timers sont créés une
// fois et ne doivent PAS capturer un state périmé. Assignation en effet
// (et pas pendant le render) — React interdit les effets de bord de render.
useEffect(() => { stateRef.current = state; skipRef.current = skip; });
```

(Effet sans tableau de deps : exécuté après chaque render, donc avant tout callback utilisateur — la sémantique est préservée.)

**(b) le commentaire l.166 est vague** : « permet à dialSlot de l'appeler sans closure circulaire ». Le vrai contenu à écrire : « `dialSlot` arme un timeout de non-réponse qui appelle `skip` ; `skip` rappelle `dialSlot` pour composer le suivant. Cycle assumé, cassé par une ref. »

**(c) alternative si le cycle gêne un jour** — sortir le timeout de non-réponse de `dialSlot` : `dialSlot` compose et retourne, et c'est **l'appelant** (`composeAfterPlay` / `skip`) qui arme le timeout. `skipRef` disparaît alors ; `stateRef` reste (nécessaire pour les listeners). **P3**, seulement si le timeout non-réponse évolue (l'AMD du lot 11.8 le remplacera peut-être entièrement).

### 7.3 — Nommage : variables d'une lettre à sens variable (P2)

Dans `useDialerPool` : `s` = `stateRef.current` (l.171) **et** `s` = `n?.call?.state` (l.288). Dans `useRtcCall` : `s` = état SDK (l.248), `sec` (l.265), `n` (l.247), `p` (l.257), `d` (l.309), `t` (l.184), `e` (l.178). Sur un fichier de 384 lignes, `s` désigne trois choses différentes selon l'endroit.

**Recommandation** — cibler les 5 qui comptent, ne pas faire une passe globale (§3 du CLAUDE.md : périmètre chirurgical) : `s` → `sdkState`, `p` → `phase`, `n` → `notification`, `d` → `statsData`, et dans le pool `const s = stateRef.current` → `const current`.

### 7.4 — `async` sans `await` (P1)

`useDialerPool.ts:127` (`dialSlot`) et `:170` (`composeAfterPlay`) sont déclarées `async` mais ne contiennent **aucun `await`**. Conséquence : tous les appelants écrivent `void dialSlot(…)` / `void composeAfterPlay()` (l.174, 283, 344, 363) pour taire le lint, ce qui donne au lecteur l'impression d'une frontière asynchrone… qui n'existe pas.

**Recommandation** — retirer `async` des deux, supprimer les 4 `void`. La ligne `client.on('telnyx.ready', () => { void composeAfterPlay(); })` (l.280-284) devient `client.on('telnyx.ready', composeAfterPlay)`.

### 7.5 — Shadowing de `destination` (P1)

`useRtcCall.ts:100` déclare l'état `const [destination, setDestination] = useState('')`, et `:154` déclare le paramètre `async (destination: string, callerNumber?: string)`. Dans tout le corps de `startCall` (l.154-349), `destination` désigne le **paramètre**, jamais l'état — mais rien ne le signale, et l.160 `setDestination(destination)` se lit comme une tautologie.

**Recommandation** — renommer le paramètre en `to` (c'est déjà le vocabulaire de `DialerView` l.100 et de `dialerApi`). Renommage local, 4 occurrences.

### 7.6 — `PowerDialerView` : deux `useMemo` pour une boucle (P1)

L.61-69 (`connected`, `conversations`) et l.71-74 (`attempted`) parcourent **la même** `pool.state.lines` avec la même dépendance.

**Recommandation** — un seul `useMemo` retournant `{ attempted, connected, conversations }`. (Note : sur 3 lignes, `useMemo` n'apporte de toute façon rien ; un calcul direct serait encore plus simple.)

Au passage : `loadDemo` (l.56-59) dépend de `pool`, objet recréé à chaque render — le `useCallback` ne mémoïse donc rien. Même diagnostic que 2.9. Dépendre de `pool.setQueue` (stable, l.387-389) suffit.

### 7.7 — Ordre de lecture de `useRtcCall` (P2)

`startCall` fait 196 lignes (l.153-349) et enchaîne 5 responsabilités : garde anti-double-dial, micro, token, branche simulation (l.193-212), branche réelle avec 5 listeners inline (l.218-321), connect + timeout de diagnostic. La branche simulation est enclavée au milieu du chemin réel.

**Recommandation** (P2, à faire **après** §1) — extraire deux fonctions locales au fichier : `startSimulatedCall()` (la branche l.193-212) et `attachCallListeners(client)` (l.218-321). `startCall` retombe à ~60 lignes et se lit comme une séquence : garde → micro → token → client → (simulé | réel) → connect. Aucune logique déplacée, seulement des accolades.

---

## 8. Écarts de comportement repérés en chemin (hors périmètre « consolidation »)

Ces quatre points **ne sont pas des problèmes de style**. Ils sont listés ici parce qu'un refactor les figerait dans le marbre. Aucun n'est corrigé dans ce rapport.

### 8.1 — Client WebRTC précédent non déconnecté sur raccroché distant (P2)

`useRtcCall.ts:190-191` : `const client = await createRtcClient(rtcToken); clientRef.current = client;` — écrasement **sans** `disconnect()` du client précédent.

Chemin de reproduction : appel n°1 → le prospect raccroche → notification SDK `hangup` → l.273-276 `stopTimer()` + `setPhaseSafe('ended')`. **`hangup()` n'est jamais appelé**, donc le client n°1 reste connecté, avec ses 5 listeners vivants. L'agent clique « Appeler » sur un autre contact (autorisé : la garde l.155 ne bloque que `dialing`/`connected`) → client n°2 créé, `clientRef` écrasé, **client n°1 orphelin mais toujours abonné**. Ses handlers appellent encore `setPhaseSafe` / `setError` sur le même state React que l'appel n°2.

Conséquence plausible : un `telnyx.socket.close` tardif du client n°1 fait passer l'appel n°2 en `failed` avec « Connexion WebRTC perdue » (l.278-287) alors qu'il se déroule normalement.

**Recommandation** — en tête de `startCall`, après la garde : déconnecter et nullifier `clientRef.current` avant d'en créer un nouveau. **Avec un test** de deux appels consécutifs séparés par un raccroché distant.

### 8.2 — Timers de simulation non annulables par « Raccrocher » (P2)

`useRtcCall.ts:196-209` arme trois timers en mode simulation : `sim` (t+1,5 s → `connected`), l'interval de chrono, et `end` (t+30 s → `wrapping` puis `idle`). `hangup()` (l.354-371) ne connaît que `timerRef` et `dialTimeoutRef` — il annule l'interval, **pas `sim` ni `end`** (2.7 : `_end` n'est jamais relu). Un raccroché en simulation à t+5 s laisse donc `end` armé : à t+30 s la machine repasse `wrapping` → `idle`, alors qu'elle était déjà `idle`.

En pratique invisible (on retourne au même état), sauf si l'agent relance un appel avant t+30 s : le `setPhaseSafe('wrapping')` du timer résiduel **écrase la phase de l'appel en cours**.

**Recommandation** — stocker les timers de simulation dans un `simTimersRef: useRef<Timeout[]>` et les vider dans `hangup()` **et** dans le cleanup d'unmount, exactement comme `demoTimersRef` le fait déjà côté pool (`useDialerPool.ts:180-185`) — le pool a le bon pattern, le mono-ligne ne l'a pas.

### 8.3 — L'attribut `data-rtc-remote-${slot}` n'est rendu nulle part (P2)

`useDialerPool.ts:132-134` cherche `` document.querySelector(`audio[data-rtc-remote-${slot}]`) ``. Aucun `<audio>` du repo ne porte cet attribut : `CallBar.tsx:39` rend `data-rtc-remote` (sans suffixe), `DialerView.tsx:181` idem, et `PowerDialerView.tsx` **ne rend aucun élément audio**. Le `querySelector` retourne donc toujours `null`, le spread `...(audioEl ? { remoteElement: audioEl } : {})` (l.140) est toujours vide.

Conséquence : en power dialing **réel** (hors démo), l'appel partirait mais **on n'entendrait rien** — c'est exactement le bug B2 corrigé au lot 11.3 pour le mono-ligne, et non corrigé pour le pool. Non détecté aujourd'hui parce que le pool n'a été exercé qu'en mode `simulate`.

**Recommandation** — rendre dans `PowerDialerView`, à l'intérieur du bloc lignes, un `<audio data-rtc-remote-{slot} autoPlay className="calls-dialer__rtc-audio" />` par slot. **À valider par Théo avant** : le pool n'a peut-être jamais été prévu pour tourner en réel avant l'AMD du lot 11.8.

### 8.4 — Les erreurs SDK du pool ne remontent pas à l'utilisateur (P2)

`useDialerPool.ts:326-334` : sur `telnyx.error`, le pool fait `setIsRunning(false)` + `dispatch({type:'reset', queue:[]})` + `console.error`. Du point de vue de l'agent : **la file d'attente se vide et tout revient à zéro, sans un mot d'explication**. Idem pour `telnyx.socket.close` (l.322-325), qui ne logge même pas.

L'infrastructure d'affichage existe pourtant : `PoolState` a `error` par ligne, `poolLogic` a l'action `line-error`, `PowerDialerView.tsx:165` rend `line.error`. Seul `dialSlot` (l.156) dispatche `line-error` — les erreurs **globales** n'ont aucun canal.

Comparaison éclairante : `useRtcCall` traite ces deux mêmes événements avec un message utilisateur explicite (l.284 « Connexion WebRTC perdue… », l.292 `setError(msg)`). Le pool est le parent pauvre.

**Recommandation** — ajouter un `error: string | null` global à `PoolState` (+ action `pool-error`), l'alimenter depuis les deux handlers, l'afficher en tête de `PowerDialerView`. Et **ne pas vider la file** sur erreur : `reset` avec `queue: []` fait perdre les numéros restants, ce qui est le pire moment pour les perdre.

---

## 9. Plan d'exécution proposé

### P1 — nettoyage, aucun risque (une PR, ~2 h)

Uniquement des suppressions et des déplacements ; **aucune modification de logique**.

1. Supprimer `index.ts` (2.1) et `application/orchestrator.ts` (2.2).
2. Réduire `domain/CallState.ts` à `CallPhase` (2.3), corriger son en-tête (5.3).
3. Supprimer `RtcCallStatus` (2.4), extraire `CallStats` (3.2).
4. Supprimer `timersRef` / `stopTimer` / `PoolLine.durationSec` / `connectedSlot` (2.5, 2.6, 2.10) — option (a).
5. Supprimer les casts `_end` / `_unref` (2.7) et la branche `p === 'failed'` (2.8).
6. `DialerProvider` : `value={rtc}` (2.9). `PowerDialerView` : un seul `useMemo` (7.6).
7. Factoriser dans `rtcClient.ts` : `telnyxPhase` (1.1), `TelnyxNotification` + accesseurs (1.2), `telnyxErrorMessage` (1.4), `safeHangup`/`safeDisconnect` (1.6), `RtcCodec` (3.3).
8. `domain/phaseLabels.ts` + trancher « Clôture… » / « Fermeture… » (3.4).
9. Réécrire les en-têtes menteurs : `poolLogic.ts` (5.1), `rtcClient.ts` (5.4), doc `isRunning` (5.5).
10. Retirer `async` sans `await` + les `void` (7.4) ; renommer `destination` → `to` (7.5).
11. Réordonner les déclarations de `useDialerPool` (7.1) ; aligner le cleanup avec `useRtcCall` (4.2).
12. CSS : grouper `tabular-nums` (6.1), styler le `<select>` (6.4).

**Vérification** : `npm run test -- dialer` (les 5 fichiers de test existants couvrent `poolLogic`, `useDialerPool`, `dialerApi`, `DialerView`, `PowerDialerView`) + `npm run build`. Aucun test ne devrait bouger — sauf l'assertion `connectedSlot` de `poolLogic.test.ts:48`, à retirer avec le champ.

### P2 — factorisation moyenne (une PR, ~½ journée, avec tests)

13. Socle `LinePhase` partagé (3.1).
14. `newCallOptions()` dans `rtcClient.ts` (1.3).
15. `off?` dans `RtcClientHandle` + retrait explicite des listeners (4.1).
16. `stateRef`/`skipRef` assignés en `useEffect` + commentaire honnête (7.2).
17. Découper `startCall` en `startSimulatedCall` / `attachCallListeners` (7.7).
18. CSS : unifier les niveaux de « hint » (6.2), assumer ou renommer `.calls-dialer__error` transverse (6.4).
19. Nommage ciblé des 5 variables d'une lettre (7.3).

### P3 — à planifier, arbitrage produit requis

20. Bootstrap client mutualisé `connectRtcClient()` (1.5) — un test par branche dry-run/prod.
21. Arbitrer le sort de `dialCall()` et du endpoint `?resource=dial` (2.11). **Décision Théo.**
22. Corriger les écarts §8.1 à §8.4, chacun avec son test de reproduction. **§8.3 (audio du pool) demande d'abord de savoir si le power dialing réel est au programme avant l'AMD 11.8.**
23. Tokens CSS `--dialer-*` ou alignement sur `--xos-*` (6.3).

---

## 10. Ce qui est bien et qu'il ne faut pas casser

À dire, parce qu'un refactor mal cadré détruit ces trois choses en premier :

1. **`poolLogic.ts` est un réducteur pur, testé, sans React ni SDK.** C'est la meilleure décision d'architecture du module : la règle produit la plus délicate (relancer les `skipped`, sortir les `ended` du flux — l.36-64) est vérifiable sans monter un composant. Toute factorisation doit **entrer** dans ce modèle, pas en sortir.
2. **La frontière SDK est réelle et tenue.** `@telnyx/webrtc` n'est importé que dans `rtcClient.ts`, en import dynamique, sous contrainte eslint (G8). C'est ce qui rend §1 possible sans risque : il existe déjà un endroit évident où mettre le code commun.
3. **Les garanties critiques sont commentées là où elles se jouent** — G2 (dry-run ⇒ token null ⇒ client null ⇒ zéro paquet) et ARCEP §7.1.3 (jamais d'auto-next) sont rappelées à chaque point du code qui pourrait les violer. Les commentaires périmés de §5 doivent être corrigés ; **ceux-là doivent être préservés mot pour mot.**
