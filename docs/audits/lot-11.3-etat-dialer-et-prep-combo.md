# Lot 11.3 — État du dialer & préparation Combo (2026-08-03, HEAD fde171b)

Scan vérifié dans le code + l'API réelle de `@telnyx/webrtc@2.27.8`
(`node_modules/@telnyx/webrtc/lib/src/**/*.d.ts` + `lib/bundle.js`).
`npm run test` (dialer, 72 tests) et `npm run build` : exit 0.

---

## SECTION 1 — ÉTAT DU PROJET

### Acquis, vérifié

| Brique | Fichier | Verdict |
|---|---|---|
| Gates serveur du token RTC (flags → entitlement → dry-run → audit) | `api/dialer.js:107-154` | OK |
| Fail-closed dry-run : `token: null`, aucun client possible | `api/dialer.js:128` + `rtcClient.ts:28` | OK, c'est le verrou principal |
| 3 niveaux de dry-run alignés client/serveur | `DialerView.tsx:84-88` / `api/dialer.js:119` | OK |
| Sélecteur caller ID alimenté par `dialer_phone_numbers` | `api/dialer.js:58-77` | OK côté lecture |
| Visibilité vue + bouton sous entitlement | `CallManagerApp.tsx:497-505,1953` | OK |
| Ordre micro → token → dial, garde anti-double-dial | `useRtcCall.ts:101-115` | OK |
| Pas d'auto-next après raccrochage (ARCEP §7.1.3) | `useRtcCall.ts:219-222` | OK |

### Bloquants du premier vrai appel — l'audio ne peut PAS fonctionner aujourd'hui

**B1 — `client.connect()` n'est jamais appelé. Showstopper.**
`useRtcCall.ts:159` écoute `telnyx.ready`, mais `BrowserSession.connect()` est la
méthode qui ouvre le socket ; le constructeur ne connecte pas (aucun `autoConnect`
dans le bundle). Sans elle, `telnyx.ready` ne fire jamais → `newCall()` (`:163`)
n'est jamais exécuté → l'UI reste bloquée en « Composition… » indéfiniment, sans
erreur. **Le premier appel réel ne partira pas du tout.**

**B2 — Aucun `remoteElement` : silence garanti. Showstopper.**
`ICallOptions.remoteElement` n'est pas passé (`useRtcCall.ts:163-167`) et aucun
`<audio>` n'existe dans `DialerView.tsx`. Dans le bundle, `attachMediaStream` fait
`const s = He(t); if (null !== s) { … }` : élément absent ⇒ le flux distant n'est
attaché à rien, **silencieusement**. Même si B1 est corrigé, personne n'entend rien.

**B3 — Toute notification hors `callUpdate` fait basculer l'UI en « Terminé ».**
`phaseFromTelnyx` (`:32-51`) retourne `'idle'` par défaut, et `:186` mappe `'idle' →
'ended'`. Or `INotificationEventData` inclut `vertoClientReady`, `userMediaError`,
`peerConnectionFailureError`… sans champ `call` ⇒ `state === undefined` ⇒ « Terminé »
dès la connexion. Les états `recovering`, `answering`, `purge` de l'enum `State` sont
également non gérés (une reconnexion réseau tue l'affichage de l'appel en cours).

**B4 — Fuite micro + double `getUserMedia`.**
Le `MediaStream` obtenu ligne 110 n'est `stop()` que dans la branche simulation
(`:154`). Dans le chemin réel il n'est ni stoppé ni transmis au SDK (`localStream`
non utilisé) : le SDK redemande le micro via `audio: true`. Résultat : deux captures,
et le voyant micro reste allumé après raccrochage.

**B5 — `startCall` retourne `true` sans qu'aucun appel ne soit parti.**
Le `return true` (`:201`) suit l'enregistrement des listeners, pas le `newCall`. Aucun
timeout : si le socket n'ouvre pas, l'UI ment. Aucun `off()` sur les listeners du
client précédent.

**B6 — Le chemin WebRTC contourne toutes les protections de volume.**
`?resource=webrtc_token` ne fait ni `reserveBudget`, ni rate limit, ni ligne
`dialer_calls`, ni audit de l'appel (seulement de l'émission du token). Un token vaut
600 s ⇒ **nombre d'appels illimité, hors budget et hors compteur**, dans cette fenêtre.
Corollaire : `dialCall()` (`dialerApi.ts:92`) est du code mort (plus aucun appelant
hors test), `RateLimiter` (`api/_dialer/rateLimit.js`) n'est câblé nulle part, et
`hangupCall` est importé sans usage (`api/dialer.js:31`).

**B7 — Caller ID non validé côté serveur.** Le `callerNumber` choisi dans le
navigateur part tel quel au SDK ; rien ne vérifie qu'il appartient à l'utilisateur
dans `dialer_phone_numbers`.

**B8 — Zéro test du chemin réel.** `DialerView.test.tsx` ne couvre que la simulation.
Les 4 bloquants ci-dessus sont invisibles pour la CI.

**B9 — Migration 044 non appliquée** (index unique « 1 appel actif/user »).
`dialer_calls` reste orpheline : la garantie ARCEP la plus forte n'existe pas encore.

---

## SECTION 2 — PRÉPARATION COMBO (sans toucher la prod)

### 2.1 Où vit le dialer

`?view=dialer` reste le **panneau ops/diagnostic** — ne pas le supprimer. L'appel en
flux se joue dans le Runner, où le contact et son numéro sont déjà à l'écran
(`ContactCardPanel.tsx:147-167`, aujourd'hui un simple lien `tel:`).

Plan de fichiers, minimal, dans les patterns existants :

- `modules/dialer/DialerProvider.tsx` — **une seule** instance de `useRtcCall` montée
  dans `CallManagerApp`, exposée par contexte. C'est ce qui garantit « un appel à la
  fois » côté UI (l'index 044 le garantit côté base).
- `modules/dialer/CallBar.tsx` — barre persistante rendue au-dessus des vues :
  caller ID · numéro · phase · chrono · **Raccrocher** · erreur. États : `idle`
  (masquée) / `dialing` / `ringing` / `connected`+chrono / `wrapping` (ACW visible,
  jamais d'auto-next) / `ended` / `failed` + message.
- `ContactCardPanel.tsx` — bouton « Appeler » branché sur le contexte quand
  `canDialer && !dryRun` ; **garder le `tel:` en fallback** (c'est le chemin qui
  marche aujourd'hui).
- L'élément `<audio ref>` (fix B2) vit dans `CallBar`, monté en permanence.
- Styles : étendre `calls-dialer.css` (préfixe `.calls-dialer__*` déjà en place),
  pas de nouveau fichier CSS.

### 2.2 Sélecteur de caller ID

Le `<select>` natif de `DialerView.tsx:206` est en dessous du reste de l'app :
`src/components/ui/Select.tsx` existe déjà et gère groupes/label/clavier. Verdict :
passer au `Select` maison, libellé `« Marseille — +33… »`, tri par `priority` (déjà
renvoyé par l'API), entrées `status: 'cooldown'` affichées **désactivées**. Le choix
doit vivre dans le provider + `localStorage`, pas être re-sélectionné à chaque appel.
Un contrôle plus riche (badges, santé du numéro) ne se justifie qu'au-delà de ~3
numéros par utilisateur — YAGNI d'ici là.

### 2.3 Travail serveur minimal pour un appel traçable par contact

1. `?resource=webrtc_token` doit faire ce que fait `?resource=dial` : `reserveBudget`,
   rate limit, **validation du `caller_number` contre `dialer_phone_numbers`**, puis
   créer la ligne `dialer_calls` (`status='dialing'`, `owner_user_id`, `contact_id`,
   `to_number`) et renvoyer son `call_id`.
2. **Blocage schéma** : `dialer_calls.campaign_id` est `NOT NULL`
   (`038_dialer_campaigns.sql:29`). Un appel en flux depuis le Runner n'a pas de
   campagne ⇒ rendre la colonne nullable **ou** créer une campagne implicite par
   session. À trancher avant tout code.
3. Le client renvoie `{ call_id, session_id, contact_id }` dans `clientState`
   (`ICallOptions.clientState` existe en 2.27.8) : c'est le pont vers les webhooks
   Phase B sans changer le schéma plus tard.
4. `POST ?resource=call_ended` (durée + cause depuis le SDK) pour clore la ligne tant
   que les webhooks ne sont pas branchés. `GET ?resource=calls` est encore `501`
   (`api/dialer.js:342`) — nécessaire pour l'historique par contact.

### 2.4 Ce qui ne doit PAS bouger avant la Phase B

- **Le fail-closed `token: null`** (`api/dialer.js:128`) et les 3 niveaux de dry-run.
  C'est la seule chose qui empêche un navigateur d'appeler.
- **Ne pas piloter la state machine UI par webhooks** : `webhooks.js` n'écrit rien sur
  le leg WebRTC. Le SDK reste la source de vérité de l'UI jusqu'à la Phase B.
- `?resource=config` reste sous JWT, `canDialer` reste gaté sur l'entitlement.
- Aucun parallélisme, aucun auto-next (ARCEP) — la contrainte `parallelism = 1` de 044
  formalise l'interdit.
- **Appliquer 044 avant la première écriture dans `dialer_calls`**, sinon la garantie
  « 1 appel actif par user » n'existe pas au moment où elle compte.

### Ordre recommandé

B1 + B2 + B3 + B4 (le premier appel réel est impossible sans eux) → test manuel audio
→ B6 (budget/traçabilité sur `webrtc_token`) → 2.1/2.2 (UX en flux) → Phase B.
