# 🛠️ X OS — Plan d'implémentation

Compagnon opérationnel de `xos_portal_plan.md` (v2). Découpage en **lots délégables**, un lot = un agent = un worktree Orca = une PR. Repo GitHub canonique : **`Theo-Savoy/xOS`**, projet Vercel renommé : **`xos`**.

## Organisation

- **Coordination** : Claude (Fable) — spécification des lots, dispatch, suivi, contrôle qualité, merges. **N'écrit pas le code des lots.**
- **Exécution** : agents via Orca — Cline, Command Code, Antigravity, Claude Code — tous sur **Sonnet 5 Medium**. L'assignation indiquée par lot est indicative (équilibrage de charge) ; tout agent peut prendre tout lot, la spec est la frontière.
- **Workflow par lot** : spec écrite dans le prompt de l'agent (objectif, fichiers autorisés, contrat, critères de vérification) → worktree Orca dédié → livraison → **gate QC** → merge sur `main` → déploiement Vercel prod (pas de previews sur ce projet).

### Gate QC (bloquant, appliqué à chaque livraison)
1. `npx tsc --noEmit` et `npx eslint .` sans erreur ; `npm run build` OK.
2. Revue du diff : périmètre respecté (aucun fichier hors spec), pas de sur-ingénierie, style cohérent.
3. QA visuelle du flux touché (navigateur sur le build local `vercel dev` ou la prod).
4. **Non-régression Cleaner** : `GET /dashboard.html` fonctionne (direct + Basic Auth legacy), `GET /api/refresh` renvoie les données, `POST /api/update` inchangé. Vérifié même si le lot ne touche "pas" à ces fichiers.
5. Lot avec logique non triviale → au moins un test/check exécutable livré avec.

### Règles données aux agents (dans chaque spec)
- Ne modifier **que** les fichiers listés dans la spec du lot.
- `dashboard.html`, `api/refresh.py`, `api/update.js`, `api/history.js` sont **intouchables** (sauf lot qui les cite explicitement).
- Nouveaux endpoints en Node (pattern de `api/update.js`) ; secrets via variables d'env, jamais en dur.
- Toute écriture (SF ou Postgres) passe par un endpoint qui vérifie le JWT Supabase.

---

## Phase 0 — Socle technique *(séquentielle, dérisque tout le reste)*

### Lot 0.1 — Scaffold Vite + React + TS et déploiement hybride — `Claude Code`
- Init Vite/React/TS à la racine, ESLint + Prettier, structure `src/os`, `src/apps`, `src/lib`.
- Déplacer `dashboard.html` vers `public/dashboard.html` (contenu **byte-identique**, URL `/dashboard.html` conservée) ; adapter `vercel.json` : build Vite (`dist/`), rewrite `/` → SPA, fonctions `api/` (Node + Python) et `middleware.js` toujours actifs.
- Page d'accueil placeholder ("X OS").
- **Vérifié par** : déploiement prod où `/` sert la SPA, `/dashboard.html` + `/api/refresh` + `/api/update` fonctionnent comme avant (gate QC point 4).

### Lot 0.2 — Supabase : projet, schéma, auth — `Command Code`
- Projet Supabase, migrations SQL : `profiles`, `settings`, `challenges`, `challenge_results`, `badges`, `action_journal` + RLS (lecture authentifiée, écriture service-role only).
- Supabase Auth avec lien magique email restreint au domaine **`xos-learning.fr`** ; trigger SQL de création de `profiles` à l'inscription.
- `src/lib/supabase.ts`, écran de login, garde de session dans la SPA ; helper Node `api/_auth.js` de vérification du JWT pour les futurs endpoints.
- `middleware.js` : accepter session Supabase **ou** Basic Auth legacy (seule modification autorisée de ce fichier).
- **Vérifié par** : connexion par lien magique (OTP) fonctionnelle en prod, profil créé en base, endpoint de test refusant les requêtes sans JWT, `/dashboard.html` accessible dans les deux modes d'auth.

---

## Phase 1 — Bureau virtuel *(3 lots parallèles après 0.2)*

### Lot 1.1 — Thème & design system — `Antigravity`
- `src/os/theme.css` : variables de la charte (fond `#0D173F`, accent `#8B5BFA`, alerte `#FFF96F`, bordures translucides, blur), fond d'écran dégradé animé, logo.
- Polices : copier les **woff2 Brockmann** (Regular, Medium, SemiBold, Bold) depuis `fonts/brockmann-complete-webfont/.../webfontkit/` vers `public/fonts/` ; convertir **Neue Montreal** (Regular, Medium, Bold) OTF → woff2 (`fonttools`) pour les chiffres/dashboards (`tabular-nums`). `@font-face` avec `font-display: swap`, fallback `system-ui`. **Interdits** : les .otf Brockmann desktop (licence distincte) et **Aeonik TRIAL** (EULA d'essai). Le dossier `fonts/` source reste hors build.
- Composants UI partagés de base (`src/lib/ui/`) : bouton, carte glassmorphism, tag.
- **Vérifié par** : page de démo des composants + QA visuelle vs charte.

### Lot 1.2 — Window manager, Dock, registry — `Claude Code`
- `react-rnd` : fenêtres déplaçables/redimensionnables, feux tricolores (fermer/réduire/agrandir), focus/z-index, état des fenêtres ouvertes persisté en localStorage.
- Dock flottant avec zoom au survol, branché sur `src/os/registry.ts` (contrat `AppManifest` du plan v2).
- **Vérifié par** : 2 apps factices ouvertes simultanément — drag, resize, minimize, restore, focus corrects.

### Lot 1.3 — App CRM Cleaner (iframe) — `Cline`
- `src/apps/cleaner/` : fenêtre contenant l'iframe `/dashboard.html`, taille par défaut adaptée, entrée dock.
- **Vérifié par** : parcours complet du Cleaner *dans* la fenêtre X OS (filtres, tri, action en lot de test) identique à l'accès direct.

**🎯 Jalon V1 déployée** : bureau + dock + Cleaner utilisable. Annonce possible à l'équipe.

---

## Phase 2 — Launcher & Hub *(3 lots, 2.1 avant 2.2 ; 2.3 parallèle)*

### Lot 2.1 — Recherche Cmd+K — `Claude Code`
- `api/search.js` : SOSL multi-objets (Account, Contact, Opportunity), JWT requis, pas de cache.
- Palette `cmdk` dans le shell (`Cmd+K`) : résultats groupés, ouverture fiche SF ou app X OS.
- **Vérifié par** : recherche d'un compte réel < 1 s, navigation clavier complète.

### Lot 2.2 — Actions `/log`, `/create`, `/clean` — `Command Code`
- `api/log.js` : création de Task SF rattachée (compte/contact/opp) avec mention "via X OS par {nom}" + entrée `action_journal` ; création express de **Contact** (`/create`) ; `/clean` ouvre le Cleaner pré-filtré (query param lu par l'iframe — seule évolution tolérée côté `dashboard.html`, à défaut on ouvre sans pré-filtre).
- Formulaires inline dans la palette.
- **Vérifié par** : Task et Contact visibles dans SF, entrée journal attribuée au bon utilisateur, échec propre sans JWT.

### Lot 2.3 — App Hub — `Antigravity`
- `api/status.js` : limits SF + fraîcheur caches. UI : statut, quotas, config des seuils et exclusions (CRUD `settings`, réservé rôle manager), profil + déconnexion.
- **Vérifié par** : quotas réels affichés, modification d'un seuil persistée et relue, CRUD refusé à un non-manager.

---

## Phase 3 — Weekly Perf

### Lot 3.0 — Audit métriques activités — `Cline` *(livrable : rapport, pas de code produit)*
- Scripts SOQL : volumétrie Tasks par type/subtype, Events, `OpportunityHistory`, nommage réel des étapes. Proposition de définitions exactes des 3 métriques (Pulse, Généré vs Gagné, Taux d'effort).
- **Vérifié par : validation des définitions par Théo** — bloque 3.1.

### Lot 3.1 — `api/perf.js` — `Command Code`
- Agrégations par commercial × semaine (8 semaines glissantes) selon les définitions validées ; cache `s-maxage=900`.
- **Vérifié par** : contrôle croisé des chiffres d'une semaine avec des requêtes SF manuelles.

### Lot 3.2 — UI Weekly Perf — `Antigravity`
- Cartes Pulse par commercial, graphique Généré vs Gagné (Recharts), taux d'effort ; filtres semaine/commercial ; vue "moi" vs vue manager (rôle).
- **Vérifié par** : QA visuelle + cohérence des chiffres avec 3.1.

## Phase 4 — Call Manager

- **Lot 4.0 — Audit Prospection & Appels** — `Cline` : analyse des tâches d'appels Salesforce, statut, historique d'efforts, volumétrie des comptes et contacts par commercial. **Validation Théo** — bloque 4.1.
- **Lot 4.1 — `api/calls.js`** — `Command Code` : Moteur de campagnes d'appels / séances de prospection (création d'une séance, attribution d'une liste de contacts à appeler, endpoints pour enregistrer la progression et statistiques de session).
- **Lot 4.2 — UI Call Manager** — `Claude Code` : Interface interactive pour créer et lancer une séance de prospection (liste de contacts séquentiels à appeler, bouton d'appel rapide, formulaire de log d'appel direct pré-rempli pour enchaîner les appels en 1 clic).

## Phase 5 — Arena

### Lot 5.1 — Moteur de challenges — `Command Code`
- CRUD challenges (managers) sur catalogue de métriques (réutilise les agrégations 3.1/4.1 + `action_journal`, incluant des indicateurs de qualité de remplissage du CRM : complétude des fiches, CloseDate valide, raisons de perte renseignées) ; cron Vercel de recalcul → snapshots `challenge_results`, attribution `badges`.
- **Vérifié par** : challenge de test sur une métrique réelle de qualité CRM, classement recalculé par le cron, badge attribué en fin de période.

### Lot 5.2 — UI Arena — `Antigravity`
- Leaderboard animé, médailles/badges, création de défi (manager), historique, tableau de bord des indicateurs de qualité de saisie CRM.
- **Vérifié par** : QA visuelle + parcours complet création → participation → clôture.

## Phase 6 — Business Review

- **Lot 6.0 — Audit Performance Globale & Produits** — `Cline` : analyse de la structure des opportunités liées aux produits (OpportunityLineItem, Product2) et audit de la complétude des motifs de gain et perte. **Validation Théo** — bloque 6.1.
- **Lot 6.1 — `api/business-review.js`** — `Command Code` : Endpoints d'agrégation de performance par périodes (mensuelle, trimestrielle, annuelle) avec comparaison vs année précédente (YoY), et distribution des motifs de gain/perte par produit sur une période donnée.
- **Lot 6.2 — UI Business Review** — `Antigravity` : Tableaux de bord de pilotage exécutif avec indicateurs YoY, graphiques de tendance comparatifs, et diagrammes d'analyse des motifs de gain/perte par produit.

---

## Suivi

| Phase | Lots | Parallélisme | Jalon |
|---|---|---|---|
| 0 | 0.1 → 0.2 | séquentiel | Socle déployé, auth lien magique OK |
| 1 | 1.1 ∥ 1.2 ∥ 1.3 | 3 agents | **V1 : bureau + Cleaner** |
| 2 | 2.1 → 2.2, ∥ 2.3 | 2-3 agents | Launcher + Hub |
| 3 | 3.0 → 3.1 → 3.2 | séquentiel (audit d'abord) | Weekly Perf |
| 4 | 4.0 → 4.1 → 4.2 | séquentiel ; parallélisable avec fin de 3 | Call Manager |
| 5 | 5.1 → 5.2 | séquentiel | Arena — portail complet |
| 6 | 6.0 → 6.1 → 6.2 | séquentiel | Business Review |

Défauts actés (véto possible) : Supabase nouveau projet région `eu-west` ; ancien journal Blob lu tel quel par le Cleaner, nouvelles actions en Postgres ; un lot = une PR mergée par le coordinateur après gate QC ; cron Arena horaire en période de challenge.

Décisions humaines attendues en cours de route :
- ~~Domaine email autorisé pour le lien magique~~ → **`xos-learning.fr`** (acté le 2026-07-10).
- ~~Création du CNAME `xos.hellotheo.fr`~~ et configuration DNS du domaine sur le projet Vercel renommé **xos** → **Fait (actif)**.
- **Configuration de la redirect URL Supabase** : ajouter `https://xos.hellotheo.fr` dans la console d'administration Supabase (requis pour la redirection après connexion OTP).
- **Liste des emails managers** (rôles) → bloque le lot 2.3.
- Validation des définitions de métriques (lots 3.0 et 4.0).
- Fin de phase 2 : feu vert pour l'extinction du Basic Auth legacy.
