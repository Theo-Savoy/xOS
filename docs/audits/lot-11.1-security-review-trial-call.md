# Revue sécurité — appel réel unique en mode Telnyx TRIAL

> Angle : architecte systèmes / sécurité. Périmètre : HEAD `39f104f`.
> Question posée : peut-on passer **un** appel réel contrôlé en trial sans
> abîmer les garanties fail-closed de l'application payante future ?

---

## Verdict — **CONDITIONAL GO**

L'architecture fail-closed tient. Le changement « clé webhook optionnelle »
est correct et ne crée aucun chemin fail-open (trace en §1). Mais trois
conditions doivent être remplies **avant** de composer le numéro, dont une
qui contredit directement une garantie écrite dans le runbook.

| # | Condition bloquante | Effort |
|---|---|---|
| **C1** | Corriger (ou cesser de documenter) le fail-open sur `entitlement.dry_run` — §3.1 | 1 ligne |
| **C2** | Poser la borne de dépense **côté Telnyx** (daily spend limit + Outbound Voice Profile France-only) : les caps applicatifs ne bornent pas les euros — §3.2 | 2 min portail |
| **C3** | **Ne pas lancer le tunnel** pour cet appel. Il est inutile en trial et il porte à lui seul toute la surface publique — §4 | supprime du travail |

C3 est la recommandation la plus rentable de cette revue : elle retire la
totalité de la classe « exposition Internet » sans écrire une ligne de code.

---

## 1. La clé webhook optionnelle est-elle vraiment fail-closed ?

**Oui.** Trace complète des quatre états possibles :

| État de `WEBHOOK_TELNYX_PUBLIC_KEY` | Chemin | Résultat |
|---|---|---|
| absente / vide / espaces | `config.js:18-22` (`readEnv` trim → `null`) → `config.js:56` → `webhooks.js:125` | **503** `webhook_public_key_not_configured` |
| présente mais base64 invalide ou ≠ 32 octets | `webhooks.js:43-53` → `null` → `verifyTelnyxSignature` `:79-80` | **401** `bad_public_key` |
| présente et valide, signature fausse | `webhooks.js:83-92` | **401** `signature_invalid` |
| `loadDialerConfig()` throw (clé API absente, `TELNYX_ENV` invalide) | `webhooks.js:107-112` | **503** `dialer_not_configured` |

Points vérifiés explicitement :

- `webhooks.js:125` est un **early return inconditionnel**, pas une branche
  dans un `if/else` qu'un chemin pourrait contourner. Aucune ligne entre
  `:104` et `:125` ne peut sauter vers `:129`.
- Le garde-fou est placé **avant** `recordAttempt` (`:147`) et **avant** tout
  accès au service client Supabase (`:151`). Sans clé, l'endpoint public
  n'écrit rien, ne lit rien, ne consomme rien. C'est le bon ordre.
- `config.js:45-50` continue de throw sur clé API manquante — le seul throw
  restant, et il est du bon côté.
- Côté routeur : `dialer.js:202` n'appelle `handleWebhook` que sur
  `resource=webhooks` + POST. Aucune autre ressource ne dépend de la clé.
  `handleConfig` (`:55`) l'expose seulement en booléen `has_webhook_public_key`.

**Aucun chemin fail-open.** Le seul effet du commit `19e3897` est que le
routeur ne meurt plus au chargement du module — le receiver reste fermé.

### 1.1 Conséquence opérationnelle non couverte par le runbook

En trial, la clé est indisponible (payant uniquement) ⇒ **tous** les webhooks
de retour répondent 503. Concrètement :

- `dialer_webhook_events` restera **vide** après l'appel ;
- aucun `call.initiated` / `call.answered` / `call.hangup` ne sera traité ;
- le coût réel ne remontera jamais dans la réservation budgétaire.

Or `docs/ops/telnyx-go-live-runbook.md` §9 demande de cocher
« Webhooks `call.initiated` / `call.answered` / `call.hangup` reçus, signature
validée ». **Cette case est insatisfiable en trial.** Elle doit être marquée
`N/A (trial)` sinon l'opérateur conclura à une panne et ira débugger une
chaîne qui fonctionne comme prévu.

---

## 2. Middleware — les préfixes Vite ouvrent-ils quelque chose en prod ?

### 2.1 La protection `/api/*` est intacte

Ordre d'évaluation : `isAuthBridge` (`middleware.js:73`) → `isPublic` (`:78`)
→ `isProtected` (`:84`). `isPublic` **précède** `isProtected` : toute règle
publique capable de matcher un chemin `/api/…` serait un bypass total.

Les cinq préfixes ajoutés (`/src/`, `/@vite/`, `/@react-refresh`, `/@fs/`,
`/node_modules/`) sont tous des `startsWith` — structurellement incapables de
matcher `/api/…`. **Pas de bypass.**

En production le build Vite empaquette dans `/assets/` ; ces préfixes ne
correspondent à aucune route et ne sont donc pas servis. Le commentaire
`middleware.js:38-41` est exact.

### 2.2 Défaut latent — la regex image est cassée (inoffensif aujourd'hui)

`middleware.js:37` :

```js
if (/\\.(png|webp|svg|ico|jpe?g|gif)$/i.test(pathname)) return true;
```

`\\` dans un littéral regex = **antislash littéral**, puis `.` = n'importe
quel caractère. Vérifié :

```
"/logo.png"      → false
"/assets/x.svg"  → false
"/a\xpng"        → true
```

La règle est donc morte : elle n'a jamais rendu public le moindre `.png`.
Effet net = plus restrictif que voulu ⇒ **pas une faille**. Les assets passent
par `/assets/` (`:34`).

Le risque est en revanche réel **si quelqu'un la « répare »** en
`/\.(png|…)$/i` : `new URL('http://x/api%5Cevil.png').pathname` vaut
`/api%5Cevil.png`, qui matcherait, et `isPublic` gagnerait sur `isProtected`.
Un antislash brut ne peut pas apparaître (le parser WHATWG normalise `\` → `/`,
vérifié), mais la forme percent-encodée, si.

**Correctif structurel (3 lignes, à faire une fois pour toutes) :** déplacer le
test `/api/` **avant** `isPublic`, pour qu'aucune règle de contenu statique ne
puisse jamais primer sur l'authentification.

### 2.3 Ce qui n'est pas protégé du tout : `/api/dialer`

`middleware.js:58` place `/api/dialer` **entier** dans `isAuthBridge` → retour
immédiat, aucune vérification de header. La justification (le webhook Telnyx
ne peut pas porter de JWT) est valable, mais elle exempte aussi
`?resource=config`, `?resource=dial`, `?resource=campaigns`…

Le routeur rattrape correctement (`dialer.js:212` `verifyJWT`) pour tout sauf
`config` — qui est un **read non authentifié assumé** (`dialer.js:195-199`).
Cet endpoint divulgue `env`, `has_caller_id`, `has_webhook_public_key`, et les
trois plafonds budgétaires, **et déclenche une requête Supabase par appel**
(`loadDialerFlags`). En local c'est sans intérêt ; derrière le tunnel c'est
public et non compté.

Noter que `tunnel.sh:42`, `:49` et `:101` s'en servent comme healthcheck —
c'est vraisemblablement pourquoi il est resté ouvert. À l'onboarding payant,
soit on l'authentifie et on change le healthcheck, soit on réduit sa réponse à
`{ok:true}`.

Enfin, `verifyJWT` (`_auth.js:52-57`) délègue à Supabase `/auth/v1/user` sans
filtre de domaine. Tout compte du projet Supabase est un appelant légitime du
dialer ; l'allowlist `@xos-learning.fr` vit dans `api/_config/access.js` et
n'est **pas** consultée par `api/dialer.js`.

---

## 3. La fenêtre `enabled=true` + `dry_run=false` : les garde-fous tiennent-ils ?

### 3.1 🔴 BLOQUANT — `entitlement.dry_run` n'est jamais lu (fail-open)

`budget.js:110` charge le champ :

```js
dryRun: data?.dry_run ?? true,
```

`dialer.js:100` calcule le dry-run effectif :

```js
const isDryRun = cfg.isDryRun || flags.dryRun === true;
```

`entitlements.dryRun` **n'apparaît nulle part** dans le OU. Vérifié par grep
sur `api/dialer.js` : la valeur est chargée ligne 103 et jamais consommée.
Seul `entitlements.enabled` est utilisé (`:104`).

Conséquences pendant la fenêtre de test :

- **Le runbook ment.** §7 affirme : « le dial réel exige `flags.enabled` **et**
  `entitlement.enabled` **et** `dry_run=false` aux deux niveaux (config +
  flags). La plus pessimiste gagne. » Le troisième niveau — celui de
  l'entitlement, précisément celui que §6 fait écrire en base — n'est pas
  évalué.
- **Sens de la dérive = fail-open.** Un utilisateur porteur d'un entitlement
  `enabled=true, dry_run=true` (le réglage « ce compte n'a pas le droit
  d'appeler pour de vrai ») **passera un appel réel** dès que le flag global
  `dialer_dry_run` bascule à `false`. Le garde-fou par utilisateur est décoratif.
- Le commentaire d'en-tête `dialer.js:21-22` documente le contrat correct
  (« la plus pessimiste gagne ») ; l'implémentation ne le respecte pas.

**Correctif — une ligne**, `dialer.js:100` doit devenir (après le chargement
des entitlements, donc à déplacer sous `:103`) :

```js
const isDryRun = cfg.isDryRun || flags.dryRun === true || entitlements.dryRun === true;
```

Si l'on préfère ne pas toucher au code avant l'appel, alors **retirer la
phrase du runbook §7** et vérifier à la main qu'aucun autre entitlement
`enabled=true` n'existe en base avant d'ouvrir la fenêtre :

```sql
select user_id, enabled, dry_run from public.dialer_user_entitlements where enabled;
```

Je recommande le correctif : une ligne vaut mieux qu'une procédure manuelle.

### 3.2 🟠 Les plafonds en centimes ne bornent pas la dépense

`dialer.js:113` :

```js
estimatedCostCents: 1,
```

Constante en dur, jamais réconciliée avec le coût réel (la réconciliation
passerait par `call.hangup`, qui en trial ne sera jamais reçu — §1.1). Donc :

- `budget_session_cents = 300` ne signifie pas « 3 € » mais « **300 appels** ».
- `to` (`dialer.js:89`) ne subit **aucune validation** : ni format E.164, ni
  allowlist de destinations, ni filtre de préfixe. Vérifié : aucune regex de
  numéro dans `api/dialer.js` ni dans `dialerApi.ts`.
- Un appel vers un numéro surtaxé ou international coûte très largement plus
  d'un centime, tout en ne décrémentant qu'un centime de plafond.

Pour un appel unique et surveillé, l'impact réel est nul. Mais **la vraie
borne de dépense est côté Telnyx, pas côté application**. D'où **C2** :
le *daily spend limit* et le whitelisting France de l'Outbound Voice Profile
(runbook §3) ne sont pas des « bonnes pratiques optionnelles », ce sont les
seuls contrôles qui bornent des euros. À traiter comme obligatoires.

### 3.3 🟠 Le rate limiter est du code mort

`rateLimit.js` implémente un token bucket propre et testé (78 lignes,
tests verts). Il est exporté par le barrel `_dialer/index.js:7` — **et ce
barrel n'est importé par personne.** `api/dialer.js:25-31` importe
`config`, `webhooks`, `budget`, `audit`, `telnyx`. Pas `rateLimit`.

Aucun rate limiting n'est appliqué sur le chemin de dial. Pire, `handleConfig`
(`dialer.js:62-63`) expose `rate_rps` et `rate_burst` : l'API **annonce une
protection qui n'existe pas**. Une garantie fantôme est plus dangereuse
qu'une absence de garantie, parce qu'elle empêche de la chercher ailleurs.

Sans impact sur un appel unique déclenché à la main. À câbler (ou à supprimer
avec son annonce) avant l'ouverture payante.

### 3.4 🟡 Paramètres de dial contrôlés par l'appelant

Trois champs du corps de requête partent tels quels chez Telnyx :

| Champ | Ligne | Risque |
|---|---|---|
| `webhook_url` | `dialer.js:91` → `telnyx.js:79` | Telnyx POSTera les événements — dont `client_state` qui contient `userId` (`dialer.js:154`) — vers **n'importe quel host** choisi par l'appelant. Exfiltration de métadonnées d'appel par proxy. |
| `connection_id` | `dialer.js:90` | Permet de router via n'importe quelle connection du compte Telnyx. |
| `from` | `dialer.js:151` (`body?.from ?? cfg.callerId`) | Choix libre de l'identifiant appelant parmi ce que le compte autorise. |

Appelant = tout utilisateur Supabase authentifié (§2.3). Pour l'appel de test
c'est l'owner lui-même : impact nul. Ces trois valeurs devraient venir de la
config serveur, pas du corps de requête. → à durcir à l'onboarding payant.

### 3.5 ✅ Ce qui est correct

- **Choke point dry-run** : `telnyx.js:35-40`, le court-circuit est *dans*
  `telnyxPost`, seul endroit qui touche `fetch`. Aucun appelant ne peut le
  contourner par erreur. Bon design.
- **Kill switch ORG_EXCEEDED** : `dialer.js:124-143`. Le `JSON.stringify(false)`
  produit bien le `"false"` jsonb attendu par la migration (commentaire `:126`
  exact). L'échec de l'update est loggé et n'empêche pas le 429. L'audit est
  best-effort et non bloquant. Correct.
- **Réservation atomique** : `budget.js:55-66`, verrou consultatif côté RPC,
  release sur échec de dial (`dialer.js:176`) — le cap n'est pas mangé par un
  appel raté.
- **Idempotence insert-first** : `idempotency.js:49-66`, la PK est le verrou,
  toute erreur ≠ 23505 est propagée plutôt que traitée en « nouvel événement ».
  Le raisonnement en commentaire `:8-13` est juste.
- **Ed25519 maison plutôt que `standardwebhooks`** : `webhooks.js:10-14`, le
  diagnostic est correct (chaîne signée différente).

---

## 4. Le tunnel — ce qui est réellement exposé

`cloudflared` publie `http://localhost:5174` (`tunnel.sh:56`), c'est-à-dire
`vercel dev` **entier**, sur une URL HTTPS publique. Derrière le tunnel, le
middleware s'exécute, donc :

| Chemin | Accessible sans auth ? | Note |
|---|---|---|
| `/api/dialer?resource=config` | **oui** | `isAuthBridge` — divulgue env + plafonds, requête Supabase par hit, non compté |
| `/api/dialer?resource=webhooks` | **oui** | 503 en trial (pas de clé) — surface nulle tant que la clé est absente |
| `/api/dialer?resource=dial` | non | `verifyJWT` `dialer.js:212` |
| `/api/auth`, `/api/sso-bridge` | oui (par conception) | portent leur propre JWT |
| `/api/calls`, `/cleaner`, `/status`, `/perf`, `/review`, `/notifications`, `/weekly-targets`, `/launcher` | non | header `Bearer` exigé par le middleware **et** `verifyJWT` vérifié dans chacun (audité : les 11 routes appellent `verifyJWT`) |
| `/@fs/**` | **oui** | **primitive de lecture de fichiers arbitraires** |
| `/src/**`, `/node_modules/**` | **oui** | code source, dépendances |
| `/` + SPA | oui | attendu |

Le point sérieux est `/@fs/`. En dev, Vite sert n'importe quel fichier sous
`server.fs.allow` via ce préfixe. La seule protection des secrets est
`server.fs.deny` (défaut `['.env', '.env.*', '*.{crt,pem}']`) — qui couvre bien
`.env.local` et `.vercel/.env.development.local`. Mais :

- `server.fs.deny` est un confort de développement, **pas une frontière de
  sécurité** ; la documentation Vite dit explicitement de ne pas exposer le
  serveur de dev ;
- quatre CVE de contournement de `fs.deny` sont sorties sur la seule année 2025
  (CVE-2025-30208, -31125, -31486, -32395), toutes du même moule ;
- `vite: ^8` est déclaré (`package.json`), donc les contournements connus sont
  patchés — mais c'est une classe de bug récidivante, pas un incident isolé ;
- tout le reste du dépôt reste lisible : `docs/`, `supabase/migrations/`,
  `scripts/`, `.tunnel-url`.

L'URL est aléatoire et non indexée, ce qui n'est pas un contrôle d'accès :
les Quick Tunnels `trycloudflare.com` sont scannés en continu.

### La conclusion qui simplifie tout : le tunnel n'est pas nécessaire

Pour **cet** appel :

1. Le dial est une requête **sortante** HTTPS depuis `vercel dev` vers
   `api.telnyx.com` (`telnyx.js:41`). Il n'exige aucune joignabilité entrante.
2. Le `webhook_url` doit seulement être une URL HTTPS syntaxiquement valide
   acceptée par Telnyx. Les événements de retour sont perdus de toute façon —
   503 sans clé publique (§1.1).
3. L'UI click-to-call fonctionne sur `http://localhost:5174` ; le runbook §8
   suggère l'URL tunnel uniquement parce que le tunnel est déjà là.

**Recommandation : appel de test sans tunnel.** Cela supprime d'un coup
`/@fs/`, `/src/`, `/node_modules/`, le `?resource=config` public et l'endpoint
webhook public. Le tunnel redevient utile le jour où la clé Ed25519 est
disponible — c'est-à-dire à l'onboarding payant, où un déploiement Vercel de
preview est de toute façon le bon support.

Si le tunnel est malgré tout lancé : le garder ouvert **le temps de l'appel**,
puis `./scripts/tunnel.sh stop` immédiatement — et considérer le contenu du
dépôt comme ayant été public pendant la fenêtre.

---

## 5. Actions

### Top 3 — avant l'appel réel

1. **Fermer le fail-open `entitlement.dry_run`** (§3.1) — `dialer.js:100`,
   une ligne. À défaut : retirer la garantie du runbook §7 **et** vérifier en
   SQL qu'aucun autre entitlement `enabled=true` n'existe. *C'est le seul
   écart entre garantie documentée et comportement réel.*
2. **Poser la borne de dépense côté Telnyx** (§3.2) — daily spend limit bas
   + Outbound Voice Profile restreint à la France. Les plafonds applicatifs
   comptent des appels, pas des euros ; sans validation E.164 ni allowlist sur
   `to`, Telnyx est le seul rempart financier. Marquer le runbook §3 comme
   obligatoire, pas indicatif.
3. **Faire l'appel sans tunnel** (§4) — supprime intégralement la surface
   Internet. Et corriger le runbook §9 : la case « webhooks reçus » devient
   `N/A (trial — clé Ed25519 payante)`, sinon l'absence d'événements sera lue
   comme une panne.

### Top 2 — à différer à l'onboarding payant

1. **Câbler `rateLimit.js` sur le chemin de dial, ou le supprimer avec son
   annonce** (§3.3). Une garantie affichée dans `?resource=config` et non
   implémentée est pire que pas de garantie. Étendre le rate limiting à
   l'endpoint webhook public, qui deviendra alors un `INSERT` Supabase
   déclenchable sans authentification, sans limite de taille de corps
   (`webhooks.js:117`, `:176-192`) — inoffensif tant que la clé est absente,
   à traiter le jour où elle arrive.
2. **Verrouiller les paramètres de dial et réconcilier le coût réel** (§3.4,
   §3.2). `webhook_url`, `connection_id` et `from` doivent venir de la config
   serveur. `estimatedCostCents: 1` doit être remplacé par le coût réel remonté
   par `call.hangup`, sans quoi les plafonds budgétaires ne borneront jamais
   des euros.

*Correctif structurel hors périmètre mais peu coûteux (§2.2) : tester `/api/`
avant `isPublic` dans le middleware, pour qu'aucune règle d'asset statique ne
puisse primer sur l'authentification.*

---

## Annexe — vérifications exécutées

```
NODE_ENV=test npm run test -- api/_dialer api/dialer.test.js
→ 7 fichiers, 59 tests, tous verts
```

Contrôles statiques :

- `grep dryRun api/dialer.js` → `entitlements.dryRun` chargé (`:103`),
  jamais lu. Confirme §3.1.
- `grep -rn rateLimit api src --include='*.js'` → une seule référence hors
  tests : `_dialer/index.js:7`. Le barrel n'est importé nulle part. Confirme §3.3.
- Comportement de la regex `middleware.js:37` et normalisation des antislashs
  par `new URL()` vérifiés à l'exécution sous Node. Confirme §2.2.
- Les 11 routes de `api/*.js` appellent `verifyJWT`. Confirme le tableau §4.
