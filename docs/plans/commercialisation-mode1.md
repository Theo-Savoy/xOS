# Commercialisation — audit de couplage & plan phasé « mode 1 »

**Objectif** : rendre le produit installable chez un autre client par un expert
(un projet Vercel + un projet Supabase + l'org Salesforce du client), sans fork
du repo, avec des facilitateurs d'intégration qui ramènent l'installation à
moins d'une journée.
**Périmètre** : audit read-only du couplage tenant/vertical + plan. Le mode 2
(self-service multi-tenant) est explicitement hors scope — voir §6.
**Méthode** : lecture directe + grep (annexe A). HEAD : `9c52703`.

---

## 1. TL;DR

**Le code est déjà à ~70 % prêt.** L'architecture a été conçue avec la
portabilité en tête : `api/_crm/mapping.js` centralise champs, picklists et
stages Salesforce ; les SOQL construits hors de `_crm/` sont **déjà pilotés par
le mapping** (aucun nom de champ en dur) ; `access.js` s'annonce lui-même comme
« replace this module for another client » ; l'OAuth Salesforce dérive son
callback de l'origin (aucune URL en dur) ; le chiffrement de tokens par user
existe.

Ce qui manque tient en trois blocs :

| Bloc | Contenu | Effort |
|---|---|---|
| **Confinement résiduel** | 3 leaks `__c` côté front, picklist dupliquée front/back, sujets RDV et presets fonction en dur | ~2-3 j |
| **Config tenant unifiée** | branding, domaine email, rôles, sf_user_map : aujourd'hui éclatés dans 6 fichiers dont 3 migrations SQL | ~3-4 j |
| **Facilitateurs d'intégration** | scripts de provisioning, validateur de mapping (describe), endpoint doctor, runbook | ~5-7 j |

Total ordre de grandeur : **2-3 semaines** pour une première installation
pilote reproductible.

**Décision préalable requise** (bloque la phase 1) : le produit reste-t-il
vertical « prospection/CRM commercial » avec le vocabulaire actuel (secteurs,
recettes, Lundi, Combo) considéré comme *feature*, ou tout devient
configurable ? Recommandation : **vertical assumé**. Seul ce qui varie
mécaniquement d'un org Salesforce à l'autre passe en config ; le process
commercial (sujets RDV, KPI Lundi, modes de tracking) reste produit. C'est
moins de travail et un produit plus opinioné, donc plus vendable.

---

## 2. Audit approfondi du couplage

### 2.1 Ce qui est déjà portable (ne pas retoucher)

| Élément | Preuve |
|---|---|
| Mapping SF centralisé | `api/_crm/mapping.js` (357 l.) : objets, champs (`Nombre_employes__c`, `Type_de_vente__c`…), picklists, stages, `closedLostStage`, `saleTypes`, `arrCommissionTypes` |
| SOQL hors `_crm` mapping-driven | 8 requêtes dans 5 fichiers (`perf.js`, `weekly-targets.js`, `_cleaner/recettes/sectors.js`, `_cleaner/opportunities/read.js`, `_calls/accountsSearch.js`) — toutes construites via `${opportunity.fields.closeDate}` etc. Zéro champ en dur |
| OAuth par user | `salesforceOAuth.js` : callback dérivé de l'origin, tokens chiffrés (`tokenEncryption.js`, `SF_TOKEN_ENCRYPTION_KEY`), table `salesforce_user_oauth` (migration 015) |
| Auth produit | JWT Supabase pur, magic link PKCE — aucun SSO propriétaire |
| Infra déclarative | `vercel.json` neutre (headers sécurité, CSP), env vars listées §2.4 |
| Rôles produits | `commercial | manager | admin` + tracking modes `commercial | sdr | dg` : abstraction correcte, seul le *bootstrap* est tenant |

### 2.2 Inventaire du couplage résiduel — par fichier

**A. Identité & branding**

| Fichier | Couplage |
|---|---|
| `middleware.js:11-19` | `LOGIN_HTML` en dur : « 🗑️ Dashboard XOS Déchet », « Comptes @xos-learning.fr uniquement » |
| `index.html:6` | `<title>X OS</title>` (acceptable si le produit s'appelle X OS ; sinon config) |
| `src/auth/LoginScreen.tsx` | mention `@xos-learning.fr` |

**B. Domaine email — défini à 3 endroits**

| Fichier | Couplage |
|---|---|
| `middleware.js` | texte UI |
| `supabase/migrations/002_email_domain_validation.sql:12` | regex `@xos-learning\.fr$` dans `handle_new_user()` |
| `supabase/migrations/013_sf_user_map.sql` | la regex est **re-déclarée** dans la nouvelle version du trigger |

**C. Données tenant embarquées dans les migrations** — le point le plus gênant :
les migrations mélangent schéma (produit) et seed (tenant).

| Migration | Donnée tenant |
|---|---|
| `013_sf_user_map.sql` | 5 emails + 5 SF User Ids en `INSERT` |
| `014_sf_user_map_roles.sql` | idem, rôles par email |
| `002` + trigger de `013` | domaine email |

**D. Config accès en code**

`api/_config/access.js` : `ROLE_BOOTSTRAP_BY_EMAIL` (3 emails),
`WEEKLY_TRACKING_BY_SF_USER` (SF User Ids en dur). Le fichier est bien isolé et
documenté — il faut juste que son contenu vienne d'ailleurs.

**E. Leaks Salesforce côté front** — 3 occurrences réelles (le reste du grep
`__c` est du BEM CSS) :

| Fichier | Champ |
|---|---|
| `src/apps/calls/types.ts:148` | `Type_de_client__c` |
| `src/apps/calls/EventPanel.tsx:39` | `Type_de_client__c` |
| `src/apps/calls/rdvSubjects.ts:113` | `Type_de_client__c` |

**F. Picklist dupliquée front/back** : `src/crm/secteurValues.ts` (54 valeurs)
est une copie manuelle de `mapping.objects.account.industries`. Toute
divergence org client ↔ copie front casse silencieusement les filtres.
`secteurFamilies.ts` regroupe ces valeurs en familles (métier vertical — OK en
produit si vertical assumé, mais doit dériver des valeurs servies par l'API).

**G. Vocabulaire process commercial en dur** (à trancher en phase 0) :

| Fichier | Contenu |
|---|---|
| `src/apps/calls/rdvSubjects.ts` | 5 sujets d'Event SF (`Rdv découverte prospect`…) avec `apiName` = Subject exact — dépend des conventions de l'org |
| `mapping.js` contact `fonctionPresets` | « Responsable formation », « Digital learning manager »… — **très** XOS-Learning, aucun sens chez un client déchet/autre |
| `mapping.js` opportunityHistory `stageOrder` | 11 stages nommés dont « XOS recommandé », « XOS short-listé » |
| `api/_cleaner/recettes/sectors.js:14` | `ACTIVE_SECTORS` dérive déjà du mapping (bien) ; le commentaire signale lui-même le follow-up « move to a settings table » |

**H. Provisioning — l'angle mort principal**

- Migrations appliquées **à la main** (supabase/README.md ; épisodes de dérive
  documentés — cf. audit santé). 33 migrations, avec une paire couplée
  021/026 à ordonner manuellement.
- 13 env vars (`SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_REFRESH_TOKEN`,
  `SF_INSTANCE_URL`, `SF_LOGIN_URL`, `SF_TOKEN_ENCRYPTION_KEY`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `APP_ORIGIN`,
  `VERCEL_GIT_COMMIT_SHA`) — non documentées en un seul endroit, pas de
  `.env.example`.
- Aucun script d'installation, aucun healthcheck de configuration (le
  `/api/status` actuel ne valide pas le mapping contre l'org).
- Connected app Salesforce : création manuelle non documentée (scopes requis :
  `openid email profile api refresh_token`, callback
  `{origin}/api/auth?flow=salesforce-callback`).

### 2.3 Matrice produit vs tenant

| Varie par client (→ config) | Invariant produit (→ code) |
|---|---|
| Noms des champs custom SF (`__c`) | Objets standard (Account, Contact, Opportunity, Task, Event, User) |
| Picklists : industries, tranches effectifs, types client, tiers, niveaux décision | Concepts : secteur, taille, statut client, niveau de décision |
| Stages d'opportunité + ordre + stage « perdu » | Notion de pipeline ordonné, won/lost |
| Sujets RDV (Subjects Event) + presets fonction | Notion de types de RDV, KPI Lundi, presets de ciblage |
| Domaine(s) email autorisé(s) | Auth magic link + rôles |
| Emails → rôles / SF User Ids / tracking modes | Hiérarchie commercial/manager/admin, modes commercial/sdr/dg |
| Branding (nom, logo, emoji, textes login) | L'OS desktop, les apps, le design system |
| Credentials (SF connected app, Supabase, clé de chiffrement) | — |

### 2.4 Audit infra & données (2e passe)

**Functions Vercel** : 6/12 handlers HTTP sous plafond Hobby, discipline de
consolidation documentée (`docs/ops/vercel-functions.md`). ⚠️ Le plan Hobby
est **non commercial** : passage Vercel Pro obligatoire dès le premier client
payant (les projets restent illimités par team, le plafond de functions saute).

**Pas de crons** : les snapshots perf sont écrits au fil de l'eau
(`perf_forecast_snapshots` / `perf_week_snapshots` en upsert), avec
**dégradation gracieuse si la table manque** (`perf.js:683,692,721`). Ce
pattern « le code tolère le schéma en retard » est un atout direct pour opérer
plusieurs bases clients — à ériger en règle (cf. §3, phase 3).

**Realtime** : utilisé pour les notifications (`useRealtimeNotifications.ts`,
canal `user-notifications:<userId>`, auth par JWT). À couvrir dans le runbook
(publication realtime sur la table, migration 023).

**Email** : magic link via SMTP custom Resend (`docs/ops/auth-email-resend.md`).
**L'expéditeur est mutualisé** : un seul domaine produit (DNS déjà authentifié),
un seul compte Resend pour tous les clients. Par client il ne reste que la
config SMTP du projet Supabase (même credentials Resend) + le template à
coller — 10 minutes, scriptable en partie via l'API Supabase. Un domaine
expéditeur white-label par client n'est envisagé que si un client l'exige.

**Domaine & callback** : `APP_ORIGIN` + domaine Vercel par client ; le
callback de la connected app SF (`{origin}/api/auth?flow=salesforce-callback`)
et l'authorize URL (My Domain de l'org, pas `login.salesforce.com`) suivent.

**`@vercel/blob` est quasi mort** : plus aucun usage runtime, seul le script
one-shot `scripts/migrate-cleaner-history.js` (migration legacy Labo) l'importe.
→ pas de store Blob à provisionner par client ; dépendance à signaler pour
nettoyage (hors périmètre de ce plan).

**Données** : 19 tables, toutes génériques produit — aucune colonne
tenant-specific hors les seeds de `sf_user_map` (§2.2.C). RLS verrouillée
« service-role only » sur les tables sensibles (migration 029) : posture saine
et parfaitement compatible avec le modèle une-base-par-client (l'isolation
inter-clients est physique, pas par RLS). La table `settings` (key/value
jsonb, migration 001) est le foyer naturel d'une future config tenant en DB.

**Inventaire des ressources par client** (à provisionner) :

| Ressource | Notes |
|---|---|
| Projet Vercel | même repo Git, env vars propres, domaine custom |
| Projet Supabase | migrations + seed, SMTP → Resend mutualisé, realtime, `SUPABASE_*` |
| Domaine + DNS | domaine app uniquement (l'expéditeur email est mutualisé) |
| Connected app SF | dans l'org du client, scopes `openid email profile api refresh_token` |
| Clé `SF_TOKEN_ENCRYPTION_KEY` | 32 octets aléatoires, jamais tournée sans re-liaison |

### 2.5 Architecture repo & déploiement — décision

**Un seul repo. Jamais de repo cloné par client.**

```
                    git push main
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  Vercel proj. XOS  Vercel proj. A  Vercel proj. B   ← même repo Git,
  (env: TENANT=xos) (TENANT=a)      (TENANT=b)          env vars par projet
        │                │                │
  Supabase XOS      Supabase A       Supabase B      ← 1 base par client
```

- **Vercel supporte N projets sur le même repo Git.** Chaque projet client a
  ses env vars (`TENANT`, credentials SF/Supabase, `APP_ORIGIN`) et son
  domaine. Un push sur `main` redéploie tout le monde : **le problème de
  synchronisation de repos disparaît par construction** — il n'y a rien à
  synchroniser.
- **Le repo cloné par client est le piège classique** : divergence dès la
  première personnalisation « vite fait », fixes sécurité à backporter N fois,
  et précisément le fardeau de sync redouté. À proscrire.
- **Le seul point de synchronisation réel restant : le schéma des N bases
  Supabase.** Le déploiement code est atomique (tous les clients d'un coup),
  les migrations sont par-base. Deux garde-fous : un script de flotte qui
  applique les migrations sur toutes les bases au release (phase 3.6), et la
  règle déjà pratiquée par `perf.js` — *migrations additives d'abord, code
  qui tolère leur absence, jamais l'inverse*.
- **Geler un client** (s'il refuse une release) : désactiver l'auto-deploy de
  *son* projet Vercel et promouvoir les déploiements à la main. Pas de branche
  par client — une branche par client est un repo cloné qui s'ignore.
- Nuance assumée : tous les clients suivent la même version. C'est un choix
  produit (SaaS single-version), pas une limite technique — et c'est ce qui
  rend le mode 1 opérable par une seule personne.

### 2.6 Architecture cible mode 1

```
Repo unique (pas de fork)
 ├─ code produit (src/, api/) — zéro donnée tenant
 ├─ mapping tenant     → config/tenant/<client>/mapping.js
 ├─ config tenant      → config/tenant/<client>/tenant.json (branding, domaine,
 │                        rôles bootstrap, tracking, sujets RDV, presets)
 ├─ seed tenant        → config/tenant/<client>/seed.sql (sf_user_map…)
 └─ scripts/install/   → provisioning + validation

Par client : 1 projet Vercel (env vars) + 1 projet Supabase (migrations
génériques + seed tenant) + 1 connected app dans SON org SF.
```

Le choix du tenant au build : une env var `TENANT=<client>` résolue par
`mapping.js`/`access.js` (import dynamique au démarrage de la function, ou copie
au build — trancher en phase 2 ; l'import statique actuel favorise la copie au
build, plus simple sur Vercel).

---

## 3. Plan phasé

### Phase 0 — Décisions (½ j, bloquant)

1. **Vertical assumé ou générique ?** Recommandation : vertical (cf. TL;DR).
2. **Nom produit** (le repo s'appelle `xos-dechet-dashboard`, l'UI « X OS ») —
   impacte branding par défaut et communication.
3. **Politique de repo** : ✅ tranché — repo unique + N projets Vercel sur le
   même repo (§2.5). Pas de repo cloné par client.

→ vérifié par : décisions écrites en tête de ce document.

### Phase 1 — Finir le confinement (2-3 j)

| # | Tâche | Vérifié par |
|---|---|---|
| 1.1 | Éliminer `Type_de_client__c` du front : l'API renvoie une clé normalisée `customerType` (3 fichiers calls) | `grep -rE "[A-Za-z0-9]+__c\b" src/` ne matche plus que du BEM |
| 1.2 | Servir les picklists au front via un endpoint `/api/config` (industries, tranches, types, tiers, familles de secteurs) ; supprimer `secteurValues.ts` en tant que source | le front n'importe plus de liste de valeurs SF en dur ; tests verts |
| 1.3 | Déplacer `rdvSubjects` (apiNames) et `fonctionPresets` dans le mapping/config, exposés par `/api/config` | changer un Subject dans le mapping change l'UI sans rebuild front... ou au moins sans toucher `src/` |
| 1.4 | Sortir `stageOrder`/stages nommés de tout usage produit non mappé (déjà dans mapping — vérifier qu'aucun stage n'est référencé ailleurs) | `grep -rn "XOS recommandé\|short-listé" api/ src/` → uniquement mapping |

### Phase 2 — Config tenant unifiée (3-4 j)

| # | Tâche | Vérifié par |
|---|---|---|
| 2.1 | Créer `config/tenant/xos/` : `tenant.json` (nom, emoji/logo, domaine email, textes login), `mapping.js` (déplacé), `seed.sql` | XOS devient le premier « client » du système |
| 2.2 | Brancher `middleware.js` (LOGIN_HTML) et `LoginScreen` sur `tenant.json` | changer le nom dans le JSON change l'écran de login |
| 2.3 | Remplacer `ROLE_BOOTSTRAP_BY_EMAIL` / `WEEKLY_TRACKING_BY_SF_USER` par le contenu tenant (fichier ou table `tenant_access` — fichier suffit en mode 1) | `access.js` ne contient plus ni email ni SF Id |
| 2.4 | **Purger les migrations des données tenant** : nouvelle migration qui paramètre le domaine email (table `tenant_settings` lue par `handle_new_user()`) ; seeds `sf_user_map` extraits vers `seed.sql`. Les migrations 002/013/014 restent dans l'historique (déjà appliquées chez XOS) mais le *bootstrap d'un nouveau client* n'exécute que du schéma générique + son seed | un `supabase db reset` + migrations + seed vierge produit une base sans aucune donnée XOS |
| 2.5 | `.env.example` exhaustif et commenté (les 13 vars, lesquelles sont par-client) | fichier à la racine, revu |

### Phase 3 — Facilitateurs d'intégration (5-7 j) — le cœur

| # | Facilitateur | Contenu | Vérifié par |
|---|---|---|---|
| 3.1 | **`scripts/install/provision.sh`** (ou .mjs) | crée/lie le projet Supabase (CLI), applique les 33 migrations **dans l'ordre** (avec la paire 021→026), joue `seed.sql`, configure SMTP magic link ; idempotent | run à blanc sur un projet Supabase neuf : vert du premier coup |
| 3.2 | **Validateur de mapping** `scripts/install/validate-mapping.mjs` | appelle l'API *describe* de l'org client, compare chaque champ/picklist/stage du `mapping.js` du tenant à l'org réelle ; sortie : rapport champs manquants / valeurs de picklist inconnues / stages absents | lancé contre l'org XOS : 0 écart ; contre une sandbox vierge : rapport complet des écarts |
| 3.3 | **Générateur de squelette** (option du même script) | à partir du describe, pré-remplit un `mapping.js` candidat (standard fields + suggestions pour les custom par similarité de label) que l'expert finalise à la main | générer le squelette pour l'org XOS retrouve ≥ 80 % du mapping actuel |
| 3.4 | **Endpoint doctor** `/api/status?deep=1` (admin) | vérifie : env vars présentes, JWT Supabase OK, tables attendues, token SF valide, mapping validé contre l'org (réutilise 3.2), version schéma vs migrations du repo | un mauvais `SF_REFRESH_TOKEN` ou un champ renommé côté client est signalé en une requête |
| 3.5 | **Runbook `docs/ops/installation-client.md`** | pas-à-pas expert : connected app SF (scopes, callback, My Domain), refresh token initial, projets Vercel/Supabase (même repo, env vars, domaine), **SMTP Supabase → Resend mutualisé + template magic link**, publication realtime, seed users `sf_user_map`, validation doctor, checklist de recette | un dev qui ne connaît pas le projet suit le runbook sans aide |
| 3.6 | **Script de flotte `scripts/install/migrate-all.mjs`** | applique les migrations en attente sur *toutes* les bases clients (liste dans `config/tenant/*/`), rapport par base ; règle d'or affichée : *migrations additives d'abord, code tolérant ensuite* (pattern `perf.js` existant) | à chaque release : une commande, N bases à jour, y compris XOS (fin des applications manuelles) |

### Phase 4 — Installation pilote à blanc (2-3 j)

Dérouler le runbook de bout en bout sur un « client fictif » : org SF sandbox
(ou Developer Edition), projet Supabase neuf, projet Vercel neuf, tenant
`demo`. Chronométrer, noter chaque friction, corriger runbook et scripts.

→ vérifié par : installation complète < 1 journée, doctor 100 % vert, session
d'appels + weekly perf fonctionnels sur la sandbox.

### Dépendances

```
Phase 0 ─→ Phase 1 ─→ Phase 2 ─→ Phase 3 ─→ Phase 4
                        (3.2/3.3 peuvent démarrer dès la fin de 2.1)
```

---

## 4. Risques & points d'attention

| Risque | Mitigation |
|---|---|
| Un org client sans les champs custom requis (`Type_de_client__c`, `NPA__c`, `Inactif__c`…) | Le validateur 3.2 classe chaque champ **requis / dégradable** ; définir le comportement produit quand un champ dégradable manque (feature masquée, pas de crash) |
| Rate limits API SF sur des orgs plus petits (éditions Professional : API en option) | Prérequis commercial documenté dans le runbook : édition Enterprise ou add-on API |
| Dérive migrations déjà connue sur xos-portal | Le provisioning scripté (3.1) + flotte (3.6) deviennent le seul chemin, y compris pour XOS ; interdire l'application manuelle |
| Vercel Hobby = usage non commercial | Passage **Vercel Pro** au premier client payant (coût fixe team, projets illimités) — à intégrer au pricing |
| Déploiement code atomique vs migrations séquentielles sur N bases | Règle « additif d'abord, code tolérant » (déjà pratiquée par `perf.js`) + `migrate-all` avant le push de release |
| `SF_REFRESH_TOKEN` global : un seul user d'intégration par tenant | Acceptable en mode 1 (documenté runbook : user d'intégration dédié + OAuth par user pour l'écriture). Ne pas sur-construire |
| Volumétrie picklists (54 industries XOS) très différente selon client | Tout passe par `/api/config` (1.2), donc neutre |

## 5. Estimation globale

| Phase | Effort |
|---|---|
| 0 — Décisions | 0,5 j |
| 1 — Confinement | 2-3 j |
| 2 — Config tenant | 3-4 j |
| 3 — Facilitateurs | 5-7 j |
| 4 — Pilote à blanc | 2-3 j |
| **Total** | **~13-17 j-dev** (2-3 semaines) |

## 6. Hors scope explicite (mode 2 — self-service)

Ne rien construire de cette liste tant qu'un pipeline de clients ne le
justifie pas : multi-tenancy `tenant_id` + RLS par tenant, provisioning
Supabase par API à la volée, connected app publiée + security review
AppExchange, wizard de mapping self-serve, billing Stripe, signup ouvert,
monitoring par tenant. Le mode 1 en est le banc d'essai : chaque installation
experte documente ce qui varie réellement et alimente le futur wizard.

---

## Annexe A — Commandes d'audit

```sh
# SOQL hors adapter (8 requêtes, toutes mapping-driven)
grep -rn 'SELECT ' api --include='*.js' | grep -v test | grep -v _crm/

# Leaks SF réels côté front (le grep __c naïf matche le BEM CSS)
grep -rEon "[A-Za-z0-9_]+__c\b" src --include='*.ts*' | grep -v test \
  | grep -vE "__(close|container|content|controls|count|card|chip|col|cell|check|circle|caption|cta|copy|corner|cluster)\b"

# Données tenant dans les migrations
grep -rln "005[A-Za-z0-9]\{12,15\}\|@xos-learning" supabase/migrations/

# Env vars consommées
grep -rhon 'process\.env\.[A-Z_]*' api middleware.js -o \
  | sed 's/.*process\.env\.//' | sort -u
```
