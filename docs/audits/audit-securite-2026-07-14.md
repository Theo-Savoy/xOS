# Audit sécurité — Dashboard XOS Déchet

**Date** : 2026-07-14
**Périmètre** : code applicatif du repo `xos-dechet-dashboard` (middleware Vercel, endpoints `api/`, migrations Supabase, front `src/`, intégration Salesforce).
**Objectif** : identifier fuites de données et surfaces d'attaque avant mise en production, avec correctifs priorisés.

> **État d'application (2026-07-14).** Correctifs code appliqués : **C1** (migration `029_lock_rls_service_role_tables.sql`), **H3** (suppression du middleware password + cookie `xos_auth`), **H2** (en-têtes dans `vercel.json`, CSP en `Report-Only`), **M1** (CORS restreint à `APP_ORIGIN`). Tests : 750/750 ✅, build ✅.
> **Actions manuelles restantes** : appliquer la migration `029` en prod (projet `xos-portal`) ; retirer `DASHBOARD_PASSWORD` des env Vercel ; définir `APP_ORIGIN` en env Vercel ; promouvoir la CSP de `Report-Only` → enforced après observation ; **M2/M3** et §7 non traités (voir plus bas).
**Hors périmètre** (à vérifier séparément, voir §7) : configuration Supabase Auth (console), variables d'environnement Vercel, politiques d'accès Salesforce côté org.

---

## 1. Résumé exécutif

Le produit a de **bonnes fondations** : JWT réellement validé côté serveur, refresh tokens Salesforce chiffrés AES-256-GCM, OAuth state hashé avec TTL, validation stricte des entrées, `npm audit` propre (0 vuln). L'architecture d'auth par endpoint est saine.

**Mais un défaut systémique domine tout le reste** : la sécurité des données repose **entièrement sur la logique applicative** (le service-role Supabase contourne RLS), or **plusieurs tables contenant des données personnelles ont une policy `SELECT ... using(true)`** ouverte à tout utilisateur authentifié. Résultat : **n'importe quel employé connecté peut exfiltrer toute la base prospects (noms, téléphones, emails) directement via l'API REST Supabase**, en contournant complètement le scoping fait par `api/`.

| # | Sévérité | Titre | Fuite de données ? |
|---|----------|-------|--------------------|
| C1 | 🔴 Critique | RLS `using(true)` sur les tables PII accédées uniquement via service-role | **Oui — toute la base contacts** |
| H1 | 🟠 Élevé | RLS n'est pas la frontière de sécurité (dépendance totale au service-role) | Potentielle (régression) |
| H2 | 🟠 Élevé | Absence totale d'en-têtes de sécurité HTTP (CSP, HSTS, frame-ancestors…) | Via XSS/clickjacking |
| H3 | 🟠 Élevé | `DASHBOARD_PASSWORD` utilisé en clair comme valeur de cookie, secret partagé statique | Franchit le gate |
| M1 | 🟡 Moyen | CORS `Access-Control-Allow-Origin: *` sur toutes les routes API | Amplifie un vol de token |
| M2 | 🟡 Moyen | Aucun rate-limiting (login, /api/auth, recherche SOSL, écritures SF) | Brute-force / abus |
| M3 | 🟡 Moyen | Contrôle du domaine email uniquement dans le trigger DB | Dépend de la conf Supabase |
| M4 | 🟡 Moyen | PII prospects (email/tel) stockées en clair dans `action_journal` | Minimisation GDPR |
| M5 | 🟡 Moyen | Secrets en copies locales `.env.local` / `.env.vercel` | Vol poste dev |
| L1–L3 | 🔵 Faible | Fallbacks hardcodés, cache token 5 min, messages d'erreur SF verbeux | Marginale |

**Priorité absolue avant prod : corriger C1.** C'est la seule faille exploitable par un utilisateur légitime pour une exfiltration massive, et elle est directement pertinente RGPD.

---

## 2. Modèle de sécurité actuel (compréhension)

```
Navigateur ──(magic link @xos-learning.fr, PKCE)──► Supabase Auth
   │ session JWT (localStorage) + provider_refresh_token SF
   │
   ├─(1) clé anon + JWT ──► PostgREST Supabase  ← RLS s'applique (rôle "authenticated")
   │        · front lit directement : profiles, desktop_shortcuts, user_notifications (realtime)
   │
   └─(2) Authorization: Bearer <JWT> ──► /api/*  ← middleware cookie xos_auth (gate grossier)
            · verifyJWT() revérifie le token (api/_auth.js)
            · getServiceClient() → SERVICE_ROLE_KEY → RLS CONTOURNÉE
            · scoping owner/rôle fait à la main dans le code
```

Deux chemins d'accès aux données coexistent :

- **Chemin (2), l'API `api/*`** : correctement authentifié (`verifyJWT` sur les 8 endpoints) et scopé à la main (`assertSessionAccess`, `authorizeContext`, `.eq('recipient_id', user.id)`…). C'est le chemin « voulu ».
- **Chemin (1), l'accès direct PostgREST** avec la clé anon publique + le JWT de l'utilisateur : **il est toujours ouvert**. La clé anon est publique par design (elle est dans le bundle front, `src/lib/supabase.ts`). La seule barrière sur ce chemin, c'est **RLS**. Et c'est là que C1 mord.

Le point critique à intégrer : **le service-role côté API ne « remplace » pas RLS, il la court-circuite.** RLS reste la seule défense du chemin (1), qu'aucun code applicatif ne protège.

---

## 3. Findings détaillés

### 🔴 C1 — Tables PII lisibles par tout utilisateur authentifié via PostgREST

**Fichiers** : `supabase/migrations/004_call_sessions.sql:48,61`, `005_call_target_presets.sql:14`, `016_perf_forecast_snapshots.sql:21`, `017_perf_week_snapshots.sql:34`, `019_perf_seasonality_cache.sql:16`, `022_call_session_sharing.sql:18`, `028_recette_journal.sql:20`, `001_initial_schema.sql` (badges, challenge_results, challenges, settings).

**Problème.** Ces tables portent une policy :

```sql
create policy "..._select" on public.<table>
  for select to authenticated using (true);
```

`using(true)` = **aucun filtre de ligne**. Tout porteur d'un JWT valide (donc tout compte `@xos-learning.fr`) peut lire **toutes les lignes** via l'endpoint REST public, sans passer par `api/`. La table `call_session_contacts` contient `contact_name`, `phone`, `email` (migration `012`), `sf_contact_id` — soit **l'intégralité des fiches prospects manipulées par toute l'équipe**.

**Scénario d'attaque.** Un commercial (ou un compte compromis par phishing) ouvre la console du navigateur, où le client Supabase est déjà authentifié, et exécute :

```js
const { data } = await supabase
  .from('call_session_contacts')
  .select('contact_name, phone, email, sf_contact_id, account_name')
  .limit(100000);
// → dump complet : noms, téléphones, emails de tous les prospects de toutes les séances
copy(JSON.stringify(data)); // exfiltration
```

Aucune trace dans `action_journal` (l'accès ne passe pas par l'API). Idem pour `call_target_presets` (stratégie commerciale), `perf_*` (perfs individuelles de chaque commercial), `call_session_members` (qui travaille avec qui).

**Pourquoi c'est exploitable maintenant.** Le front ne lit **jamais** ces tables directement (vérifié : `grep supabase.from` ne renvoie que `profiles`, `desktop_shortcuts`, `user_notifications`). Ces `using(true)` n'ont donc **aucun usage légitime** — c'est de la surface d'attaque pure.

**Correctif recommandé — défense en profondeur, tables non lues par le front.** Retirer l'accès `authenticated` du chemin (1) sur toutes ces tables ; l'API en service-role continue de fonctionner sans changement.

```sql
-- migration 029_lock_rls_readonly_tables.sql
-- Ces tables ne sont accédées QUE par l'API service-role. On ferme PostgREST anon/authenticated.
revoke select on public.call_sessions          from anon, authenticated;
revoke select on public.call_session_contacts  from anon, authenticated;
revoke select on public.call_session_members   from anon, authenticated;
revoke select on public.call_target_presets    from anon, authenticated;
revoke select on public.perf_forecast_snapshots from anon, authenticated;
revoke select on public.perf_week_snapshots    from anon, authenticated;
revoke select on public.perf_seasonality_cache from anon, authenticated;
revoke select on public.recette_journal        from anon, authenticated;
-- Optionnel mais propre : supprimer les policies devenues mortes
drop policy if exists "call_session_contacts_select" on public.call_session_contacts;
drop policy if exists "call_sessions_select"          on public.call_sessions;
drop policy if exists "call_session_members_select"   on public.call_session_members;
drop policy if exists "call_target_presets_select"    on public.call_target_presets;
-- (idem pour perf_* et recette_journal)
```

> C'est exactement le pattern déjà appliqué avec succès en `015_salesforce_user_oauth.sql:20` (`revoke select ... from anon, authenticated`) pour protéger `sf_refresh_token_encrypted`. Il faut le généraliser.

**Pour `badges`, `challenge_results`, `challenges`, `settings`** (`001`) : si le front les lit un jour, préférer un scoping ligne plutôt qu'un revoke. Sinon, revoke également. Aujourd'hui aucune n'est lue par le front → revoke.

**Vérification.** Après migration, avec un JWT valide :
```bash
curl "$VITE_SUPABASE_URL/rest/v1/call_session_contacts?select=phone" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
# attendu : [] ou 401/permission denied, plus jamais la liste des prospects
```

> Note : `profiles` est correctement traité (`015` limite les colonnes à `id,email,full_name,sf_user_id,role,...` et exclut le token chiffré). `user_notifications` (`023`), `desktop_shortcuts` (`020`) et `action_journal` (durci en `021`) sont scopés par `auth.uid()` — bon. Ce sont les tables listées ci-dessus qui restent ouvertes.

---

### 🟠 H1 — RLS n'est pas la frontière de sécurité : dépendance totale au scoping applicatif

**Fichiers** : tous les `api/*.js` via `getServiceClient()` (`api/_calls/http.js:121`).

**Problème.** Chaque endpoint utilise le service-role, qui **ignore RLS**. La séparation des données entre utilisateurs ne tient qu'aux filtres écrits à la main (`assertSessionAccess`, `.eq('owner', userId)`, `authorizeContext`…). **Un seul filtre oublié dans une future route = fuite inter-utilisateurs**, sans qu'aucune alerte ne se déclenche (RLS ne rattrapera pas l'erreur).

C'est un risque structurel, pas un bug ponctuel. L'audit n'a pas trouvé de filtre manquant dans les routes actuelles (bon), mais la surface grandit à chaque feature.

**Correctifs.**
1. **Corriger C1 d'abord** : une fois RLS resserrée, elle redevient un filet de sécurité même sur le chemin service-role si un jour une route bascule sur la clé anon.
2. **Convention de code** : toute nouvelle requête service-role sur une table multi-utilisateur DOIT porter un `.eq()` de scoping ou passer par un helper `assertSessionAccess`-like. À documenter dans `CLAUDE.md`.
3. **Test de non-régression** : un test qui, pour chaque endpoint, vérifie qu'un utilisateur A ne peut pas lire/modifier une ressource de l'utilisateur B (il en existe déjà pour les sessions — étendre aux presets, perf, notifications).
4. **Envisager, à terme, de faire porter les requêtes API par le JWT utilisateur** (clé anon + `Authorization` du user) plutôt que le service-role, pour que RLS s'applique en défense secondaire. Non trivial (certaines opérations sont légitimement transverses) — à évaluer, pas bloquant pour la prod.

---

### 🟠 H2 — Aucun en-tête de sécurité HTTP

**Fichiers** : `vercel.json` (aucun `headers`), `middleware.js` (aucun header sur les réponses SPA).

**Problème.** L'application ne renvoie **aucun** de : `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` / CSP `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`. Conséquences :

- **Clickjacking** : l'app peut être embarquée dans une iframe tierce. Elle-même iframe le Cleaner ; sans `frame-ancestors` défini, rien ne cadre qui peut l'embarquer.
- **XSS → vol de session** : le JWT Supabase est en `localStorage` (défaut du SDK). Sans CSP, une seule injection JS (dépendance compromise, contenu SF affiché sans échappement) permet d'exfiltrer le token et d'usurper la session. Pas de `dangerouslySetInnerHTML`/`eval` trouvé dans le code (bon), mais la CSP est la défense de dernier recours.
- **HSTS absent** : pas de forçage HTTPS strict.

**Correctif.** Ajouter les en-têtes dans `vercel.json` :

```json
{
  "framework": "vite",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://<projet>.supabase.co https://*.salesforce.com; frame-src https://<projet>.supabase.co; frame-ancestors 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'" }
      ]
    }
  ]
}
```

> La CSP est à ajuster à ce que l'app charge réellement (domaines Supabase/SF exacts, iframe Cleaner). Déployer d'abord en `Content-Security-Policy-Report-Only` pour détecter les casses, puis basculer en enforcement. Vite génère du JS sans inline script → `script-src 'self'` devrait passer.

---

### 🟠 H3 — `DASHBOARD_PASSWORD` en clair comme valeur de cookie, secret partagé statique

**Fichiers** : `middleware.js:66-77,91-99`, `api/auth.js:41-51`.

**Problème.** Le cookie de gate vaut **littéralement le mot de passe** :
```js
'Set-Cookie': `xos_auth=${password}; ... Max-Age=2592000`   // 30 jours
// vérification :
cookieHeader.split(/;\s*/).includes('xos_auth=' + password)
```
- **Secret partagé unique** pour toute l'équipe : impossible de révoquer un accès individuel, pas de rotation sans casser tout le monde.
- **Le mot de passe transite et se stocke tel quel** dans le cookie ; comparaison par `includes` (non constant-time, timing marginal).
- Max-Age 30 jours : un cookie volé reste valide un mois.

**Nuance importante (ce que ce gate ne protège PAS et ne casse PAS).** Les endpoints `api/*` revérifient tous le JWT. Donc connaître `DASHBOARD_PASSWORD` seul ne donne accès à **aucune donnée** (il faut un JWT valide en plus). Ce gate est en pratique **redondant** avec l'auth JWT : il ne protège que le chargement du shell SPA, qui est de toute façon public sur `/`. La sévérité vient surtout de la mauvaise hygiène (secret partagé statique, valeur = secret) et du faux sentiment de protection.

**Correctifs (au choix, par ordre de simplicité).**
1. **Le plus simple** : reconnaître que le gate est décoratif et le **supprimer** — l'auth réelle est le JWT sur `/api/*`. Retirer `xos_auth`/`DASHBOARD_PASSWORD`/`POST /login` réduit la surface et un secret à gérer.
2. Si on garde un gate de démo : ne pas mettre le mot de passe **dans** le cookie. Poser un jeton opaque aléatoire signé (HMAC de `DASHBOARD_PASSWORD` + timestamp), comparer en constant-time, Max-Age plus court (24 h).

Recommandation : **option 1** (supprimer), sauf besoin métier explicite d'un mur avant même l'écran de login.

---

### 🟡 M1 — CORS `Access-Control-Allow-Origin: *` sur toutes les routes API

**Fichiers** : `api/auth.js:84`, `api/calls.js:96`, `api/launcher.js:293` (OPTIONS).

**Problème.** Toute origine peut envoyer des requêtes cross-origin à l'API. L'auth se fait par header `Authorization: Bearer` (pas par cookie) → **pas de CSRF classique** (un site tiers ne peut pas forger le header sans le token). Mais `*` élargit inutilement la surface : combiné à un vol de token (via XSS, H2), il permet à n'importe quel site de piloter l'API.

**Correctif.** Restreindre à l'origine du produit :
```js
"Access-Control-Allow-Origin": "https://<domaine-prod>.vercel.app"
```
(ou renvoyer l'origine uniquement si elle est dans une allowlist). Comme l'API et le front sont same-origin sur Vercel, le CORS peut même être retiré des routes hors intégrations externes.

---

### 🟡 M2 — Aucun rate-limiting

**Fichiers** : `middleware.js` (`POST /login`), `api/auth.js`, `api/launcher.js` (SOSL), `api/cleaner.js` (bulk).

**Problème.** Rien ne limite :
- Le brute-force de `DASHBOARD_PASSWORD` sur `POST /login` (401 sans throttle).
- Les appels `/api/launcher?q=` (recherche SOSL `IN ALL FIELDS`) et créations SF — un compte compromis peut brûler les quotas API Salesforce et générer du coût / du bruit.
- Un abus de `/api/auth`.

**Correctif.** Vercel n'a pas de rate-limit natif ; ajouter une limite simple par IP/utilisateur (ex. `@upstash/ratelimit` avec Redis, ou un compteur en KV) sur `/login`, `/api/launcher`, `/api/cleaner` POST. À défaut, au minimum un délai/verrouillage progressif sur `/login`. Non bloquant si C1/H2/H3 sont traités, mais recommandé avant ouverture large.

---

### 🟡 M3 — Contrôle du domaine email uniquement dans le trigger DB

**Fichiers** : `supabase/migrations/002_email_domain_validation.sql`.

**Problème.** La restriction `@xos-learning.fr` est appliquée par `handle_new_user()` (trigger `after insert on auth.users`) — bonne défense côté DB. Mais l'ouverture réelle des inscriptions et la sécurité du magic link dépendent de **paramètres Supabase Auth hors repo** : autorisation des signups, confirmation email, et surtout **whitelist des Redirect URLs** (un redirect non restreint = fuite de token OTP via open-redirect / phishing).

**Correctif (console Supabase, à vérifier — voir §7).**
- Restreindre les **Redirect URLs** à l'origine de prod uniquement (pas de wildcard).
- Confirmer que le trigger lève bien et **annule** la création (rollback) pour un domaine non autorisé (le code le fait via `raise exception` — bon).
- Envisager la restriction de domaine aussi côté Auth settings (allowlist) en plus du trigger.

---

### 🟡 M4 — PII prospects stockées en clair dans `action_journal`

**Fichiers** : `api/launcher.js:280-286` (`create_contact` journalise `firstName, lastName, email, phone`), `api/_calls/http.js:135` (`journalAction`).

**Problème.** Le journal d'audit conserve, en clair et sans TTL, des données personnelles de prospects (email, téléphone). C'est utile pour l'audit mais pose une question de **minimisation et de rétention RGPD** : un journal qui grossit indéfiniment devient une base PII secondaire non maîtrisée.

**Correctif.** Définir une politique de rétention (purge > N mois), et/ou minimiser les `changes` journalisés (stocker l'ID SF créé plutôt que le contenu complet). `action_journal` est déjà scopé en lecture (`021`) — bon.

---

### 🟡 M5 — Copies locales de secrets

**Fichiers** : `.env.local`, `.env.vercel` (présents sur le poste, **gitignorés** via `.env*` — vérifié, non commités).

**Problème.** Ces fichiers contiennent `SUPABASE_SERVICE_ROLE_KEY`, `SF_CLIENT_SECRET`, `SF_REFRESH_TOKEN`, `SF_TOKEN_ENCRYPTION_KEY`, `DASHBOARD_PASSWORD`. Le service-role donne un **accès total à la base** (contourne RLS). Un épisode de révocation de tokens SF a déjà eu lieu (mémoire projet 13/07) — signe que la gestion des secrets est un point sensible.

**Correctif.** Ne pas conserver de copie locale du service-role/SF secrets au-delà du strict nécessaire ; s'appuyer sur `vercel env pull` à la demande puis supprimer. Prévoir une procédure de **rotation** (service-role, `SF_CLIENT_SECRET`, `SF_TOKEN_ENCRYPTION_KEY`, `DASHBOARD_PASSWORD`) et la documenter. Le `.gitignore` est correct — rien n'est exposé dans l'historique git (vérifié).

---

### 🔵 Findings faibles

- **L1 — Fallbacks hardcodés d'infra SF.** `SF_INSTANCE_URL` réel (`db0000000d7rdeay.my.salesforce.com`) en dur dans `api/_crm/salesforce.js:399` et `salesforceOAuth.js:19`. Pas un secret, mais divulgue le My Domain de l'org. À externaliser en variable d'env sans fallback.
- **L2 — Cache de validation JWT 5 min** (`api/_auth.js:16`). Un token révoqué reste accepté jusqu'à 5 min. Acceptable pour le produit ; à connaître en cas d'incident (invalider = attendre le TTL ou redéployer).
- **L3 — Messages d'erreur SF renvoyés au client** (`salesforce.js:426,464`, `slice(0,500)`). Peut divulguer des détails d'implémentation SF au front. Mineur ; envisager de logger côté serveur et renvoyer un code générique.

---

## 4. Points positifs (à préserver)

- ✅ **`verifyJWT` valide réellement** le token via `GET /auth/v1/user` (pas de simple décodage local) — `api/_auth.js:51`.
- ✅ **Refresh tokens SF chiffrés AES-256-GCM** avec IV aléatoire + AAD, format versionné — `api/_crm/tokenEncryption.js`.
- ✅ **OAuth SF robuste** : `state` aléatoire 256 bits, **hashé** en base, TTL 10 min, consommation atomique (`salesforceOAuth.js`), et **vérification d'identité** (email + `user_id`) avant de stocker le token (`verifyIdentityAndStore`). Empêche le vol de compte SF croisé.
- ✅ **Échappement SOQL/SOSL** présent (`escapeSOQL`, `escapeSOSL`) et validation d'IDs SF par regex `^[a-zA-Z0-9]{15,18}$`.
- ✅ **Token SF par utilisateur, sans fallback org silencieux** (`fetchSFToken`, `allowOrgFallback !== true`) : les recherches respectent le partage SF de chaque commercial.
- ✅ **Validation d'entrée stricte** : borne JSON 1 Mo (`cleaner.js:204`), types vérifiés, email regex, actions whitelistées.
- ✅ **`npm audit` : 0 vulnérabilité**. `profiles` protégée en colonnes (`015`). Secrets non commités.

---

## 5. Scénarios d'attaque (synthèse)

| Attaquant | Vecteur | Aujourd'hui | Après correctifs |
|-----------|---------|-------------|------------------|
| Employé curieux / compte phishé | Console navigateur → `supabase.from('call_session_contacts')` | **Dump complet des prospects (PII)** | Bloqué (C1) |
| Site tiers malveillant | CSRF vers `/api/*` | Bloqué (auth par Bearer, pas cookie) | Idem + CORS resserré (M1) |
| XSS (dépendance compromise) | Vol du JWT en localStorage | Session usurpée, pas de CSP | Fortement mitigé (H2) |
| Fuite de `DASHBOARD_PASSWORD` | Cookie forgé | Franchit le gate, **mais 0 donnée sans JWT** | Gate supprimé/durci (H3) |
| Brute-force `/login` | Requêtes répétées | Non limité | Rate-limité (M2) |
| Compte SF détourné | Search SOSL massive / créations | Quotas SF brûlés | Rate-limité (M2) |

---

## 6. Plan d'action priorisé

**Bloquant avant prod :**
1. **C1** — Migration `029` : `revoke select` sur les tables PII non lues par le front (+ drop policies mortes). *Vérifié par : `curl` REST authentifié renvoie `[]`/403 sur `call_session_contacts`.*
2. **H2** — En-têtes de sécurité dans `vercel.json` (CSP en `Report-Only` d'abord). *Vérifié par : `curl -I` montre les headers ; app fonctionnelle sans violation CSP.*
3. **H3** — Supprimer (ou durcir) le gate `DASHBOARD_PASSWORD`/`xos_auth`. *Vérifié par : login JWT toujours fonctionnel ; plus de secret en clair dans le cookie.*

**Fortement recommandé avant ouverture large :**
4. **M1** — CORS restreint à l'origine prod.
5. **M2** — Rate-limiting `/login`, `/api/launcher`, `/api/cleaner`.
6. **M3** — Verrouiller Redirect URLs Supabase + confirmer réglages Auth (§7).
7. **H1** — Convention + tests d'isolation inter-utilisateurs ; documenter dans `CLAUDE.md`.

**Amélioration continue :**
8. M4 (rétention `action_journal`), M5 (rotation/gestion secrets), L1–L3.

---

## 7. À vérifier hors code (console)

Ces points ne sont pas dans le repo mais conditionnent la sécurité réelle :

- **Supabase Auth** : signups restreints/désactivés hors domaine, confirmation email active, **Redirect URLs en allowlist stricte** (pas de wildcard), rotation des refresh tokens activée.
- **Supabase** : exécuter `get_advisors` (Security) sur le projet `xos-portal` pour repérer d'autres tables sans RLS/policies laxistes.
- **Vercel** : secrets uniquement en variables d'env (pas de preview exposant la prod), `SF_TOKEN_ENCRYPTION_KEY` bien présent en prod (absent de `.env.local`).
- **Salesforce** : la Connected App a des scopes minimaux ; le compte technique (`SF_REFRESH_TOKEN` fallback) est-il encore nécessaire vu le passage full user-OAuth ?

---

*Audit réalisé par lecture statique du code au commit courant de `main`. Il ne remplace pas un test d'intrusion dynamique, notamment sur la configuration Supabase/Vercel/Salesforce (§7).*
