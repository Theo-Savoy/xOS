# Audit — Consolidation des fonctions serverless Vercel

**Date** : 2026-09-03 · **Branche** : `enhance-bilan-interactive` · **Phase** : audit, aucun code modifié.

**Question** : peut-on consolider les fonctions serverless pour continuer à livrer de nouvelles apps sans atteindre le plafond du plan actuel, et jusqu'où ?

---

## 0. Correction de la prémisse — la marge est de 0, pas de 1

L'énoncé de mission part de « 11 routeurs, marge de 1 ». **C'est faux.** Vérifié sur le déploiement de production en cours :

```
GET /v11/deployments/dpl_CzU1mCB6TKJ6WqwdtjAvC27FELuw/builds
→ lambda outputs: 13
  api/auth  api/calls  api/cleaner  api/crm/picklists  api/dialer
  api/launcher  api/notifications  api/perf  api/profile  api/review
  api/status  api/weekly-targets          ← 12 fonctions serverless
  middleware                              ← Edge Middleware, hors quota
```

Le 12ᵉ routeur oublié est **`api/crm/picklists.js`** : il ne vit pas à la racine de `api/`, mais dans un sous-dossier **sans** préfixe `_`, donc Vercel en fait une fonction à part entière. Il est bien appelé en production (`src/apps/crm/usePicklistValues.ts:145`).

| | |
|---|---|
| Plan effectif | **Hobby**, confirmé par l'API (`/v2/user` → `billing.plan: hobby`, `/v2/teams` → `hello-theo-savoyfs-projects: hobby`) |
| Plafond | 12 fonctions serverless / déploiement |
| Consommé | **12 / 12** |
| Marge | **0** |

> **Conséquence immédiate** : la décision de « garder le routeur `review` pour l'app Bilan au lieu de créer `api/business-review.js` » n'était pas un confort, c'était la seule option qui ne cassait pas le déploiement. **Le prochain fichier ajouté sous `api/` hors `_*` fait échouer le build.**

L'Edge Middleware n'entre pas dans le quota — constaté empiriquement : le déploiement passe aujourd'hui avec 12 lambdas API **plus** `middleware`.

---

## 1. État des lieux

### 1.1 Les 12 fonctions

| Fonction | LOC | Exports méthode | Dispatch interne | Dépendances |
|---|---:|---|---|---|
| `api/auth.js` | 109 | `GET` `POST` `OPTIONS` | `?flow=` : `salesforce-link`, `salesforce-callback`, `salesforce` | SF (OAuth), Supabase |
| `api/calls.js` | 165 | `GET` `POST` `DELETE` `OPTIONS` | GET `?action=` (`list_contacts`, `accounts_search`, `list_presets`…) + `?resource=presets`, POST `body.action` (~20 actions via `_calls/*`) | Supabase |
| `api/cleaner.js` | 268 | `GET` `POST` | `?module=` + `?resource=` (`sectors`, `history`, `workspace`) + `?action=` | Supabase |
| `api/dialer.js` | 731 | `GET` `POST` (+ `config.maxDuration = 30`) | `?resource=` : `webhooks`, `audit`, `config`, `dial`, `webrtc_token`, `call_started`, `call_ended`, `calls`, `campaigns`, `pool_start`, `pool_status`, `pool_hangup` | Supabase, **Telnyx** |
| `api/launcher.js` | 420 | `GET` `POST` `OPTIONS` | GET = recherche SOSL ; POST `body.action` : `log_call`, `create_contact` | SF, Supabase |
| `api/notifications.js` | 220 | `GET` `POST` | POST `body.action` : `mark_read`, `react` | Supabase |
| `api/perf.js` | 2680 | `GET` | pas de `?resource=` — un seul handler, paramétré par `?period=` / `?weeks=` / `?lite=` / `?enrich=` | SF (grosses requêtes SOQL), Supabase |
| `api/profile.js` | 27 | `GET` | aucun | Supabase |
| `api/review.js` | 283 | `GET` `POST` `DELETE` `OPTIONS` | `?resource=` : `kpis`, `breakdown`, `funnel`, `calls`, `attention`, `shared` (+ `overview`, `bridge` en cours, lot 1 Bilan) | SF, Supabase |
| `api/status.js` | 240 | `GET` `POST` | POST `body.action` : `update_settings`, `set_role` | SF, Supabase |
| `api/weekly-targets.js` | 208 | `GET` `POST` | aucun | SF, Supabase |
| `api/crm/picklists.js` | ~90 | `GET` | `?field=` + `?controllingValue=` | SF, Supabase |

Volume total à consolider : **~147 Ko** de routeurs, appuyés sur **~397 Ko** de modules `api/_*` **déjà partagés** entre eux (`_auth`, `_calls`, `_config`, `_crm`, `_dialer`, `_lib`, `_review`, `_weekly`).

### 1.2 Contexte de déploiement

- `vercel.json` : `framework: vite`, `outputDirectory: dist`, uniquement des `headers` (HSTS, CSP report-only, X-Frame-Options). **Aucun `rewrites`, aucun `routes`, aucun bloc `functions`** — le routage `/api/*` est en zero-config par fichier.
- `package.json` : ESM (`"type": "module"`), React 19 / Vite 8, build `tsc --noEmit && vite build`, tests `vitest run`.
- Projet Vercel `xos` (`prj_0uZNpg9UmNUS0kBkmCJHKPNYKqEv`), Node 24.x, prod `https://xos.hellotheo.fr`.
- `.vercelignore` exclut déjà `api/**/*.test.js` — sans ça, les 13 fichiers de test compteraient aussi comme fonctions. Le commentaire du fichier documente d'ailleurs qu'ils *avaient* fait dépasser la limite.
- `middleware.js` (matcher `/(.*)`) gate `/api/*` sur `Authorization: Bearer`, avec **deux exemptions ouvertes** : `isAuthBridge` (`/api/auth`, `/api/sso-bridge`) et `isDialerWebhook` (`/api/dialer?resource=webhooks&method=POST`).

### 1.3 Tests

13 fichiers, **8 952 LOC**, chacun avec **exactement une** ligne `import … from './<routeur>.js'`. Certains (`perf.test.js`, `calls.test.js`) importent aussi des fonctions pures ré-exportées par le routeur.

### 1.4 Points relevés en passant (non traités — hors périmètre)

- `middleware.js:57` exempte `/api/sso-bridge`, **route morte** : aucun fichier `api/sso-bridge.js` n'existe.
- `api/dialer.js` déclare `resource=campaigns` en en-tête de doc mais `audit` et `campaigns` renvoient `NOT_IMPLEMENTED`.

---

## 2. Le fait technique qui décide de tout : la collision de namespace

Avant d'évaluer les options, un constat qui élimine d'emblée toute une famille de solutions.

Les routeurs **partagent déjà des noms de `?resource=`** :

| `resource` | Présent dans |
|---|---|
| `calls` | `review` **et** `dialer` |
| `config` | `dialer` |
| `shared`, `kpis`, `funnel` | `review` |
| `presets`, `hub`, `team`, `analytics`, `recalls` | `calls` |
| `sectors`, `history`, `workspace` | `cleaner` |

Il est donc **impossible d'aplatir tous les routeurs sur un `?resource=` unique** : `/api/review?resource=calls` et `/api/dialer?resource=calls` sont deux endpoints différents. Toute fusion qui repose sur la valeur de `?resource=` casse le contrat client.

**Corollaire structurant** : la fusion doit dispatcher sur le **pathname** (`/api/review`, `/api/dialer`, …), pas sur `?resource=`. Chaque routeur garde alors son propre sous-namespace `?resource=` **inchangé**, et la migration devient purement mécanique : zéro changement d'URL côté client, zéro changement de sémantique.

---

## 3. Options de consolidation

### Option A — Fusions par domaine (2 à 4 routeurs regroupés)

*Ex. `review` + `perf` (les deux « analytics SF »), ou `calls` + `dialer` (les deux « téléphonie »).*

| | |
|---|---|
| Gain | −1 à −3 fonctions. Il faut ~3 fusions pour libérer 3 slots, soit ~3 apps. |
| Coût | Identique à l'option B : réécrire le dispatch, déplacer les routeurs en modules, adapter les tests, ajouter un rewrite. |
| Risque | **`calls`+`dialer` est à écarter** : ça met la seule route non authentifiée (webhook Telnyx) dans le même fichier que le routeur le plus sollicité de l'app. `review`+`perf` fonctionne (namespaces disjoints, mêmes droits, mêmes deps SF+Supabase) mais mélange deux domaines métier dans un fichier de 3 000 LOC. |

**Verdict : rejetée.** Même effort de migration que la consolidation complète, pour un dixième du bénéfice, et une lisibilité dégradée (fichiers hybrides sans frontière naturelle). Repousse le problème de 3 apps.

### Option B — Routeur unique `api/index.js` pour *tout*

| | |
|---|---|
| Gain | 12 → **1**. Marge maximale (11 slots). |
| Coût | Migration mécanique (cf. §4). |
| Risque | Fait passer les **deux entrées non authentifiées** (`/api/auth`, `/api/dialer?resource=webhooks`) par le même dispatcher que les 10 routes JWT. Un bug de matching de path dans ce dispatcher devient un contournement d'authentification. C'est le seul risque de l'opération qui ne soit pas réversible par un `git revert`. |

**Verdict : rejetée de justesse**, pour ce seul motif de sécurité. Le 12ᵉ slot n'a aucune valeur ; l'isolation des routes ouvertes, si.

### Option C — `api/index.js` pour les routes JWT, `auth` et `dialer` laissés intacts ✅

Règle : **on ne touche pas aux deux fichiers qui portent une surface non authentifiée ; on fusionne les dix qui sont uniformément gated par JWT.**

| | |
|---|---|
| Gain | 12 → **3**. Marge : **9 slots**. |
| Modèle de sécurité | **Strictement inchangé.** `middleware.js` matche sur le pathname d'origine et s'exécute **avant** les rewrites : `isAuthBridge('/api/auth')` et `isDialerWebhook(url, method)` continuent de fonctionner à l'identique. Aucune route ouverte n'entre dans le dispatcher fusionné. |
| Coût | 10 `git mv` + 1 dispatcher + 1 rewrite + 10 lignes d'`import` dans les tests. |
| Réversibilité | Totale : `git revert` remet 12 fichiers en place. |

**Verdict : retenue.**

### Option D — Alternatives non-fonction (pour mémoire, non retenues)

- **Edge Functions** : elles ont leur propre quota, mais `@supabase/supabase-js` en mode service-role et les requêtes SOQL longues (`perf.js`) ne sont pas un bon fit pour l'Edge runtime (pas de Node natif, timeout court). Migration coûteuse, gain nul par rapport à l'option C.
- **Queue / cron** : pas de charge asynchrone à décharger ici, tout est requête-réponse synchrone.
- **Plan supérieur** : cf. §5. C'est la vraie porte de sortie, mais elle n'a pas à être franchie pour un problème de comptage de fichiers.

---

## 4. Recommandation — feuille de route

### Cible

| | Avant | Après |
|---|---:|---:|
| `api/index.js` (10 routes JWT) | — | 1 |
| `api/auth.js` | 1 | 1 |
| `api/dialer.js` | 1 | 1 |
| Autres routeurs | 10 | 0 |
| **Total** | **12** | **3** |
| **Marge** | **0** | **9** |

Et surtout : **une nouvelle app coûte désormais 0 fonction** — elle ajoute un module `api/_<app>/router.js` et une entrée dans la table de routage. Les 9 slots restants ne servent plus qu'aux cas particuliers (nouveau webhook tiers, cron, route à runtime différent).

### Le dispatcher

```js
// api/index.js
const ROUTES = {
  calls:            () => import('./_calls/router.js'),
  perf:             () => import('./_perf/router.js'),
  review:           () => import('./_review/router.js'),
  cleaner:          () => import('./_cleaner/router.js'),
  launcher:         () => import('./_launcher/router.js'),
  notifications:    () => import('./_notifications/router.js'),
  status:           () => import('./_status/router.js'),
  profile:          () => import('./_profile/router.js'),
  'weekly-targets': () => import('./_weekly/router.js'),
  'crm/picklists':  () => import('./_crm/picklistsRouter.js'),
};
```

Trois points non négociables :

1. **Exports nommés obligatoires.** Le dispatcher doit exporter `GET`, `POST`, `DELETE`, `OPTIONS` — l'union de tout ce qu'exposent les 10 routeurs. C'est exactement le piège du commit `835b920` : un `export default` fait basculer le runtime sur la signature Node legacy (`IncomingMessage`), et `new URL(request.url)` lève `TypeError: Invalid URL`. Une méthode oubliée dans les exports = `405` silencieux en production.
2. **`import()` à spécificateur littéral, jamais variable.** `@vercel/nft` trace les imports statiquement ; `import('./_' + name + '/router.js')` n'est **pas** tracé, le module n'est pas embarqué dans le bundle, et la route échoue à l'exécution. La table ci-dessus (une closure par route, chemin en dur) est tracée correctement, tout en ne *chargeant* que le module matché à l'exécution — ce qui annule le surcoût de cold start.
3. **404 explicite sur path inconnu.** Le rewrite `/api/(.*)` va aussi capturer `/api/sso-bridge` et toute typo, qui renvoient 404 aujourd'hui.

### Rewrite

```json
"rewrites": [{ "source": "/api/(.*)", "destination": "/api" }]
```

Le filesystem est résolu **avant** les rewrites : `/api/auth` et `/api/dialer` continuent d'atteindre leurs fichiers respectifs et ne sont jamais réécrits. Seuls les paths sans fichier correspondant tombent sur `api/index.js`.

### Phases

Chaque phase est déployable et revertable indépendamment. **Aucune phase ne doit augmenter le compte de fonctions** (on est à 12/12 : un ajout net = build cassé).

| Phase | Routeurs migrés | Fonctions | Tests à adapter |
|---|---|---:|---|
| **1** | `profile`, `crm/picklists`, `weekly-targets`, `notifications`, `status` — les 5 plus petits, GET/POST simples, trafic faible | 12 → **8** | `weekly-targets.test.js`, `notifications.test.js`, `status.test.js`, `crm/picklists.test.js` (4 lignes) |
| **2** | `launcher`, `cleaner`, `review` | 8 → **5** | `log.test.js`, `search.test.js`, `cleaner.test.js` (3 lignes) |
| **3** | `perf`, `calls` — les deux plus gros et les plus sollicités, migrés en dernier une fois le dispatcher éprouvé | 5 → **3** | `perf.test.js`, `calls.test.js`, `calls-list.test.js`, `presets.test.js` (4 lignes) |

Phase 1 débloque déjà 4 apps ; elle suffit à lever l'urgence.

### Tests

Coût réel : **10 lignes d'`import` sur 13 fichiers / 8 952 LOC**. Les 8 952 lignes d'assertions sont inchangées — elles appellent les handlers directement, pas via HTTP.

Deux vérifications à ajouter (une seule fois, en phase 1) :

- **Le dispatcher route bien.** Un test qui, pour chaque entrée de `ROUTES`, appelle `GET(new Request('https://x/api/<path>'))` et vérifie qu'on n'obtient pas un 404 de routage. C'est le seul code neuf non trivial de l'opération.
- **Les exports de méthode existent.** `expect(Object.keys(mod)).toEqual(expect.arrayContaining(['GET','POST','DELETE','OPTIONS']))` — deux lignes qui auraient attrapé `835b920`.

Le reste (`middleware.test.js`, `_auth.test.js`, `_config/access.test.js`) n'est pas touché.

### Critères de succès vérifiables

1. Phase déployée → `builds` API retourne le compte de lambdas attendu → vérifié par la requête `/v11/deployments/<id>/builds` de §0.
2. Aucune régression fonctionnelle → vérifié par `npm test` (les 8 952 LOC existantes) + le test de routage.
3. Aucun changement du modèle d'auth → vérifié par `middleware.test.js` inchangé et vert, et par l'absence de `auth.js`/`dialer.js` dans le diff.

---

## 5. Point de bascule

**Le nombre de fonctions cesse d'être le facteur limitant.** Après consolidation, les apps s'ajoutent à coût nul ; les 9 slots libres ne se consomment que sur cas particuliers. Sur le rythme actuel (webhook Telnyx = le seul cas en ~14 lots), cela représente des années.

Ce qui deviendra contraignant, dans l'ordre de probabilité :

1. **Les conditions d'utilisation du plan Hobby — c'est le vrai point de bascule, et il est déjà atteint.** Le plan Hobby de Vercel est réservé à un usage **personnel et non commercial**. Le Portal XOS est un outil de production d'une équipe commerciale (`@xos-learning.fr`, Salesforce, Telnyx, données clients). C'est un usage commercial. Le risque n'est pas un plafond technique qui se dégrade en douceur, c'est une suspension de projet à l'initiative de Vercel. Aucune consolidation ne le résout.
2. **Les quotas d'exécution** (temps de calcul, bande passante, invocations). `perf.js` fait déjà des SOQL lourdes ; la charge croît avec le nombre d'utilisateurs, pas avec le nombre d'apps. **À lire sur le dashboard** — l'API Vercel n'expose pas ces compteurs au token CLI (`/v1/usage` → 400), je ne les ai donc pas vérifiés et je ne les invente pas.
3. **`maxDuration`.** Hobby plafonne la durée d'exécution. `dialer.js` demande déjà 30 s. Une nouvelle app avec un agrégat SF plus lourd que `perf` heurtera ce mur avant tout problème de comptage.

**Coût / bénéfice du passage au plan Pro** (~20 $/utilisateur/mois) :

| Gagné | Perdu |
|---|---|
| Usage commercial conforme aux ToS | Le coût mensuel |
| Plafond de fonctions relevé (100+) | — |
| `maxDuration` étendu | — |
| Quotas d'exécution supérieurs, protection DDoS, logs plus longs, environnements de preview par branche | — |

**Recommandation d'arbitrage** : la consolidation et le passage à Pro ne sont pas alternatifs. La consolidation est bonne **en soi** (elle rend le coût d'une nouvelle app nul, sur n'importe quel plan) et se justifie même une fois sur Pro. Le passage à Pro relève d'une décision de conformité, à trancher indépendamment et à court terme — pas d'une décision d'architecture.

---

## 6. Risques

| Risque | Sévérité | Réalité | Mitigation |
|---|---|---|---|
| **Signature de handler** (`export default` → `TypeError: Invalid URL`) | Élevée | Déjà survenu en production : commit `835b920`. C'est le mode d'échec le plus probable de cette opération. | Exports nommés `GET`/`POST`/`DELETE`/`OPTIONS` sur `api/index.js`, plus le test d'exports de §4. |
| **Méthode HTTP oubliée dans les exports** | Élevée | `dialer` n'exporte que `GET`/`POST`, `review` en exporte 4, `perf` un seul. L'union est facile à sous-estimer. | Exporter les 4. Le front n'utilise que GET / POST / DELETE (vérifié : 46 POST, 3 GET, 2 DELETE dans `src/`). |
| **Perte de séparation des droits** | Élevée si option B, **nulle en option C** | Les routes ouvertes (`/api/auth`, webhook Telnyx) restent dans leurs fichiers ; `middleware.js` matche le pathname d'origine, avant rewrite. | Ne pas fusionner `auth.js` ni `dialer.js`. Non négociable. |
| **Collision de `?resource=`** | Élevée si dispatch par resource, **nulle en dispatch par path** | `resource=calls` existe dans `review` **et** `dialer` (§2). | Dispatcher sur le pathname. Chaque routeur conserve son namespace. |
| **Modules non embarqués** (`import()` à spécificateur variable) | Élevée | `@vercel/nft` ne trace pas les imports dynamiques calculés → 500 en prod uniquement, invisible en local. | Table de closures à chemins littéraux (§4). Un smoke test par route après déploiement. |
| **Cold start** | Faible | Chargement paresseux : seul le module matché est exécuté. Et le bundle unique dédoublonne `@supabase/supabase-js`, aujourd'hui embarqué 12 fois. | Aucune. |
| **Timeouts** | Faible | `maxDuration` est par fonction. `perf` (SOQL lourdes) et `dialer` (30 s) ne cohabitent pas — `dialer` reste isolé. Prévoir `config.maxDuration` sur `index.js` calé sur la route la plus lente. | Mesurer `perf` avant/après. |
| **Lisibilité / débogage** | Faible | Les logs Vercel s'agrègent par fonction : 10 routes dans un seul flux. | Logger le pathname dans le dispatcher. Aucune perte de structure côté code : chaque routeur reste un fichier distinct sous `api/_<app>/`. |
| **Capacité à itérer** | **Améliorée** | Aujourd'hui, ajouter une app = casser le build. Après : une entrée dans une table. | — |

---

## Résumé exécutif

1. **La prémisse était fausse : 12 fonctions sur 12, marge 0** — `api/crm/picklists.js`, dans un sous-dossier sans `_`, compte comme fonction. Le prochain fichier ajouté sous `api/` casse le déploiement.
2. Plan **Hobby confirmé** par l'API Vercel (`billing.plan: hobby`) ; CLI disponible et authentifié.
3. **Oui, c'est consolidable, et largement** : un `api/index.js` dispatchant sur le **pathname** (pas sur `?resource=` — `resource=calls` existe dans `review` *et* `dialer`) absorbe les 10 routeurs uniformément gated par JWT.
4. **12 → 3 fonctions** (`index`, `auth`, `dialer`). `auth.js` et `dialer.js` restent intacts : ce sont les deux seuls porteurs de surface non authentifiée, les isoler laisse le modèle de sécurité **strictement inchangé**.
5. **Marge libérée : 9 slots — et une nouvelle app coûte désormais 0 fonction.** La contrainte disparaît, elle ne recule pas.
6. Coût : 10 `git mv`, un dispatcher, un rewrite, **10 lignes d'`import`** sur 8 952 LOC de tests. En 3 phases déployables ; la phase 1 (5 petits routeurs, 12 → 8) lève l'urgence à elle seule.
7. **Risque principal** : la signature de handler — exports nommés obligatoires, c'est exactement le bug de `835b920`. Second risque : `import()` à chemin littéral, sinon `@vercel/nft` n'embarque pas les modules.
8. **Point de bascule réel : ce n'est pas technique, c'est contractuel.** Hobby interdit l'usage commercial ; le Portal en est un. À trancher à court terme, indépendamment de cette consolidation — qui reste justifiée même sur Pro.
