# 🛠️ X OS — Plan d'implémentation

Compagnon opérationnel de `xos_portal_plan.md` (v3). Découpage en **lots délégables** : un lot = un agent = un worktree Orca ; PR/merge après gate QC et accord. Repo GitHub canonique : **`Theo-Savoy/xOS`**, projet Vercel renommé : **`xos`**.

**Dernière synchro statut** : 2026-08-01 (audit conseil Foederati Opus 5 + Grok 4.5 — `docs/audits/audit-architecture-2026-08-01.md`, `docs/audits/audit-strategie-produit-execution-2026-08-01.md`). **Décision produit : Combo au centre, Telnyx prioritaire, Arena gelée.** Corrections majeures : Phase 10 Labo livrée à ~90% (marquée ⬜ à tort), Phase 6 Bilan codée en untracked (non testée/non commitée), Vercel à 9/12 et non 7/12, Basic Auth déjà éteint, migrations 014 sans doublon. Lint était rouge sur main (corrigé), BUG-07 fixé (RangeError comboStreaks), dead code useNudgeLearning supprimé, prettier aligné.

## Organisation

- **Coordination** : Alaric — architecture, spécification des lots, dispatch, suivi et contrôle qualité. **N'écrit pas le code des lots d'implémentation.**
- **Exécution** : agents via Orca dans un worktree dédié ; la spec du lot est la frontière et le routage modèle est fixé par phase. Les anciens lots ont utilisé Cline, Command Code, Antigravity, Claude Code et Codex ; la Phase 10 suit le routage spécifique ci-dessous.
- **Workflow par lot** : spec écrite dans un brief versionné (objectif, fichiers autorisés, contrat, critères) → task Orca → dispatch `--inject` → `worker_done` → revue indépendante du diff et tests frais → PR/merge uniquement si demandé → déploiement Vercel prod uniquement après accord explicite.

**Phase 10 — routage spécifique validé** : Alaric coordonne et n'écrit pas le code des lots ; exécution par Claude Code/Sonnet 5, OpenCode/Minimax M3 ou Cline/Minimax M3 après vérification des identifiants réellement disponibles dans les CLI. Foederati est essayé sur un premier lot borné et réversible ; au premier défaut de lifecycle, retour au flux Orca canonique `task-create → dispatch --inject → worker_done`. Aucun remplacement silencieux de modèle.

### Gate QC (bloquant, appliqué à chaque livraison)

1. `npx tsc --noEmit` et `npx eslint .` sans erreur ; `npm run build` OK.
2. Revue du diff : périmètre respecté (aucun fichier hors spec), pas de sur-ingénierie, style cohérent.
3. QA visuelle du flux touché (navigateur sur le build local `vercel dev` ou la prod).
4. **Transition Labo** : le lot 10.7 a remplacé le contrôle legacy par la matrice de parité native, le dry-run d’import Supabase et un scan à zéro des usages runtime legacy. La migration réelle, les écritures Salesforce live et toute suppression Blob restent soumises à approbation.
5. Lot avec logique non triviale → au moins un test/check exécutable livré avec.

### Règles données aux agents (dans chaque spec)

- Ne modifier **que** les fichiers listés dans la spec du lot.
- Les surfaces legacy de Labo ont été **retirées au lot final 10.7** après les gates de parité et le scan runtime. Toute restauration est hors périmètre sans nouveau plan et approbation.
- Nouveaux endpoints en Node (pattern de `api/cleaner.js`) ; secrets via variables d'env, jamais en dur.
- Toute écriture (SF ou Postgres) passe par un endpoint qui vérifie le JWT Supabase.

### Légende statut

- ✅ **Fait** — livré, mergé, utilisable
- 🟡 **Partiel / bloqué** — livrable présent mais suite conditionnée (validation humaine, prérequis)
- ⬜ **À faire** — non démarré

---

## Phase 0 — Socle technique _(séquentielle, dérisque tout le reste)_ — ✅

### Lot 0.1 — Scaffold Vite + React + TS et déploiement hybride (archive de transition) — ✅

- Init Vite/React/TS à la racine, ESLint + Prettier, structure `src/os`, `src/apps`, `src/lib`.
- Archive de transition : déplacer `dashboard.html` vers `public/dashboard.html` (contenu **byte-identique**) ; adapter `vercel.json` pour la SPA, les fonctions et le middleware.
- Page d'accueil placeholder ("X OS").
- Archive de vérification : le déploiement de transition servait alors la SPA et les fonctions Cleaner legacy ; ce comportement a été remplacé par le cutover natif du lot 10.7.

### Lot 0.2 — Supabase : projet, schéma, auth — ✅

- Projet Supabase, migrations SQL : `profiles`, `settings`, `challenges`, `challenge_results`, `badges`, `action_journal` + RLS (lecture authentifiée, écriture service-role only).
- Supabase Auth avec lien magique email restreint au domaine **`xos-learning.fr`** ; trigger SQL de création de `profiles` à l'inscription.
- `src/lib/supabase.ts`, écran de login, garde de session dans la SPA ; helper Node `api/_auth.js` de vérification du JWT pour les futurs endpoints.
- `middleware.js` : accepter session Supabase **ou** Basic Auth legacy (seule modification autorisée de ce fichier).
- Archive de vérification : connexion par lien magique (OTP), profil en base et refus JWT ont été vérifiés pendant la coexistence de transition ; les routes natives sont désormais la surface Labo.

---

## Phase 1 — Bureau virtuel _(3 lots parallèles après 0.2)_ — ✅

### Lot 1.1 — Thème & design system — ✅

- `src/os/theme.css` : variables de la charte (fond `#0D173F`, accent `#8B5BFA`, alerte `#FFF96F`, bordures translucides, blur), fond d'écran dégradé animé, logo.
- Polices : copier les **woff2 Brockmann** (Regular, Medium, SemiBold, Bold) depuis `fonts/brockmann-complete-webfont/.../webfontkit/` vers `public/fonts/` ; convertir **Neue Montreal** (Regular, Medium, Bold) OTF → woff2 (`fonttools`) pour les chiffres/dashboards (`tabular-nums`). `@font-face` avec `font-display: swap`, fallback `system-ui`. **Interdits** : les .otf Brockmann desktop (licence distincte) et **Aeonik TRIAL** (EULA d'essai). Le dossier `fonts/` source reste hors build.
- Composants UI partagés de base (`src/components/ui/`) : bouton, carte glassmorphism, tag.
- **Vérifié par** : page de démo des composants + QA visuelle vs charte.

### Lot 1.2 — Window manager, Dock, registry — ✅

- `react-rnd` : fenêtres déplaçables/redimensionnables, feux tricolores (fermer/réduire/agrandir), focus/z-index, état des fenêtres ouvertes persisté en localStorage.
- Dock flottant avec zoom au survol, branché sur `src/os/registry.ts` (contrat `AppManifest` du plan v2).
- **Vérifié par** : 2 apps factices ouvertes simultanément — drag, resize, minimize, restore, focus corrects.

### Lot 1.3 — App Labo, alors nommée CRM Cleaner (archive) — ✅

- Ancienne fenêtre embarquée conservée dans l’historique Git uniquement ; le runtime actuel est le shell natif de Phase 10.
- **Archive** : les preuves de recette de l’ancien parcours restent dans les commits historiques et ne décrivent plus le runtime.

**Archive de jalon** : bureau + dock + ancienne version Labo utilisable avant la reconstruction native.

---

## Phase 2 — Launcher & Hub _(3 lots, 2.1 avant 2.2 ; 2.3 parallèle)_ — ✅

### Lot 2.1 — Recherche Cmd+K — ✅

- `api/search.js` : SOSL multi-objets (Account, Contact, Opportunity), JWT requis, pas de cache. _(Consolidé dans `api/launcher.js` le 2026-07-11 — consolidation C.)_
- Palette `cmdk` dans le shell (`Cmd+K`) : résultats groupés, ouverture fiche SF ou app X OS.
- **Vérifié par** : recherche d'un compte réel < 1 s, navigation clavier complète.

### Lot 2.2 — Actions `/log`, `/create`, `/clean` — ✅

- `api/log.js` : création de Task SF rattachée (compte/contact/opp) avec mention "via X OS par {nom}" + entrée `action_journal` ; création express de **Contact** (`/create`) ; `/clean` ouvre désormais le module Opportunités natif avec le paramètre `q` conservé. _(Consolidé dans `api/launcher.js` le 2026-07-11 ; Tasks/Contacts créés avec `OwnerId` = commercial connecté.)_
- Formulaires inline dans la palette.
- **Vérifié par** : Task et Contact visibles dans SF, entrée journal attribuée au bon utilisateur, échec propre sans JWT.

### Lot 2.3 — App Hub — ✅ _(livré 2026-07-11, PRs #29/#31/#32 — Hub réservé manager/admin dans le dock, déconnexion en barre de menu, label quota SF lisible)_

- `api/status.js` (ou route consolidée, voir `docs/ops/vercel-functions.md`) : limits SF + fraîcheur caches.
- UI Hub : statut, quotas, config seuils/exclusions (CRUD `settings` pour manager+admin), profil + déconnexion, **gestion des rôles (admin)**.
- Contrat : `docs/specs/roles-and-hub.md`. Bootstrap emails : `api/_config/access.js` (Théo=admin, Jérôme/Paul=manager).
- **Prérequis Hobby** : ✅ levé — 5 slots libres après consolidation C (2026-07-11).
- **Vérifié par** : quotas réels affichés, modification d'un seuil persistée et relue, CRUD refusé à un commercial, changement de rôle réservé admin.

---

## Phase 3 — Weekly Perf — ✅ _(3.0 → 3.3 livrés — dernière livraison 2026-07-11 nuit)_

### Lot 3.0 — Audit métriques activités — ✅ _(validé 2026-07-11)_

- Scripts SOQL + rapport : `docs/audits/lot-3.0-metriques-activite.md`.
- Définitions Pulse / Pipeline / Effort **actées** dans `docs/specs/weekly-perf.md`.
- Clarification inclusion : Jérôme = manager (hors classement commercial par défaut) ; Yanis = commercial (inclus).

### Lot 3.1 — `api/perf` — ✅ _(2026-07-11)_

- Agrégations par commercial × semaine (8 semaines glissantes) selon le contrat `docs/specs/weekly-perf.md` ; cache `s-maxage=900`.
- **Prérequis** : ✅ levé — 5 slots Vercel libres (consolidation C).
- Requêtes SOQL bornées à la fenêtre, dates/datetimes non quotées, baseline pré-fenêtre pour la première progression.
- **Vérifié par** : 7 tests API (authz, agrégats, vue équipe, syntaxe SOQL, baseline, cache).

### Lot 3.2 — UI Weekly Perf — ✅ _(livré 2026-07-11 — Codex Terra medium, mergé sur main : Pulse cards + sparklines, chart Généré vs Gagné (Recharts), Effort, vues Moi/Équipe, 404 tests)_

- `src/apps/weekly/` selon plan de design du contrat (Pulse cards, graphique Généré vs Gagné, Effort, vues Moi/Équipe).
- **Vérifié par** : QA visuelle + cohérence des chiffres avec 3.1.

### Lot 3.3 — Rituel équipe (remplace le Google Sheet) — ✅ _(livré 2026-07-11 nuit — Codex Terra medium : breakdown type de vente + ARR + bloc trimestre fiscal + vue Tableau avec Total/Moyenne, 414 tests ; « ventes exceptionnelles » retirée sur décision Théo)_

- **API** : breakdown du signé par `Type_de_vente__c` (nouvelle clé mapping), pipe sur-mesure, bloc trimestre (signé cumulé / forecast / target) ; targets stockées Supabase, éditables Hub.
- **UI** : cards rituel par commercial (RDV, opps détectées, CA signé + breakdown, jauge trimestre vs target) + toggle « Tableau » fidèle au tableur (totaux/moyennes).
- ~~Bloqué par 3 réponses Théo~~ **Débloqué 2026-07-11** : ARR = Catalogue × `Type_de_commission__c` Abonnement 2-5 ans ; forecast = signé trimestre fiscal (FY **juillet–juin**) + Σ Amount×Probability des opps ouvertes du trimestre ; targets = `settings` éditables Hub (mock au départ).
- **Vérifié par** : chiffres d'une semaine pilote identiques au tableur de référence ; targets modifiées dans le Hub reflétées sans redéploiement.

## Phase 4 — Call Manager — ✅ _(v1 + v2 livrés)_

- **Lot 4.0 — Audit Prospection & Appels** — ✅ : `docs/audits/lot-4.0-prospection.md`.
- **Lot 4.1 — `api/calls.js`** — ✅ : séances, progression, stats.
- **Lot 4.2 — UI Call Manager** — ✅ : runner, log, sessions.

### Call Manager v2 — Moteur de ciblage, relance & attribution _(contrat : `docs/specs/call-manager-v2.md`)_ — ✅

- **Lot v2.A — Adapter CRM + mapping + moteur SOQL** — ✅ : `api/_crm/mapping.js`, `api/_crm/salesforce.js`, `api/calls-list.js`, presets.
- **Lot v2.B — Log enrichi + Event + presets** — ✅ : `log_call` / `log_event` / follow-up / `api/presets.js`, attribution niveau 1 (`OwnerId`).
- **Lot v2.C — UI builder + runner v2** — ✅ : FilterBuilder, dédup, runner, Event panel, polish UI (checkboxes glass, picklist secteurs, max/entreprise, filtre Tier).
- **Auto-map `sf_user_id`** — ✅ _(2026-07-11, migration 013)_ : table `sf_user_map` (email → User SF, seedée depuis l'org), lookup dans `handle_new_user` à la création du profil, backfill des profils existants. Les 4 commerciaux seront mappés automatiquement à leur premier login.

### Vagues de stabilisation Call Manager _(2026-07-11, PRs #25-#27 — audit Fable 5, exécution Codex GPT-5.6 Terra)_ — ✅

- **Moteur** : pagination SOQL (listes silencieusement tronquées), post-filtres relance couverts par le fetch large, sémantique « tentatives » (les tasks Call sans `Resultat_call__c` comptent ; « dernier résultat » = dernière task porteuse d'un résultat ; `last_call_at` ignore les tasks futures).
- **Latence** : caches module-scope — token SF 30 min + retry 401, verifyJWT 5 min, profil 10 min, client Supabase mémoïsé ; hydratation non répétée ; SOQL contexte/détail parallélisés ; bulk front par vagues de 4.
- **Robustesse** : garde 409 anti double-log (exception : re-log légitime de la file de rappels), échecs rappel SF et NPA exposés (`recall_failed` / `npa_failed`), invités RDV par sélecteur d'équipe (`?resource=team`).
- **Architecture** : `api/calls.js` 1300 → 98 lignes (routeur), logique dans `api/_calls/{http,sessionsRead,sessionsWrite,logging}.js`. 362 tests (vs 297).
- **Incident corrigé** : colonne `do_not_call` re-créée en prod par erreur (audit sur main obsolète) puis revertée — prod conforme migrations 009→013.

## Phase 5 — Arena — ⬜

> **Direction révisée 2026-07-17** : Arena reste l'app challenges d'équipe mais **abandonne le leaderboard** au profit d'une dynamique collaborative + reconnaissance anonyme. Voir `docs/specs/combo-gamification-v1.md` pour la couche personnelle (XP/paliers/badges/streaks/nudges) déjà couverte par Combo V1. Voir §5 du plan portail pour la nouvelle direction.

---

## Combo V1 — Gamification & Nudges _(livré 2026-07-19/20, sprints G.10–G.16)_ — ✅

> Spec : `docs/specs/combo-gamification-v1.md`. Moteurs XP/badges/streaks/nudge learning écrits, testés (59 tests), **câblés aux événements réels** via l'orchestrateur `comboEvents.ts`. Design system consolidé (Button, Skeleton, EmptyState, GlassCard).

### Moteurs & orchestrateur — ✅

- `comboXp.ts` : XP 3 axes (Vitesse/Impact/Régularité), 18 seuils Bronze→Challenger, dédup anti-abus par actionId+jour, Impact = 10 XP/RDV.
- `comboBadges.ts` : 8 badges one-timer, `checkBadges` pur appelé depuis l'orchestrateur.
- `comboStreaks.ts` : 3 streaks (classique, productif, intense), paliers dérivés.
- `comboEvents.ts` : **orchestrateur unique** post-succès — `recordShortcut`, `recordRdv`, `recordLogCall`, `recordSessionComplete`. Appelé depuis RunnerView + CallManagerApp.
- Doublon `useComboXp.ts` supprimé — hook exporté depuis `comboXp.ts:304`.

### Nudge learning — ✅

- Machine d'état 4 phases (intensive → régulière → espacée → acceptée), seuils par raccourci (L/F=3, autres=5), cumul 30 total, `markAdopted()` sur usage clavier, `cmd-k` exclu.
- Câblé dans RunnerView via `registerMouseClick`, `markNudgeSeen`, `markAdopted`.
- Toast d'apprentissage affiché dans le runner.
- ⚠️ Reste : `useNudgeLearning.ts` = dead code (hook jamais importé, fonctions appelées directement). À supprimer.
- ⚠️ Reste : BUG-07 (validation dates comboStreaks) + BUG-08/10 (sessionStorage + validation runtime) non fixés.

### UI Combo — ✅

- Toasts de déblocage : `xp_palier_atteint`, `badge_one_timer`, `streak_palier_atteint` dans DesktopToasts.
- CommandBar : axes XP + 3 streaks + dernier badge.
- RecapView : ligne paliers + badge gagné en fin de séance.
- PreSessionFlow : nudge cadrage (rappels dus + inactivité >7j).
- Chips MEDDIC contextualisées par outcome (5 max, pas 12 fixes).
- MyTrophies : badges restants avec critères + hiérarchie visuelle des paliers.
- MEDDIC masqué du rendu (code conservé).

### Retours test utilisateur (2026-07-17) — 6/8 DONE

| #   | Item                                  | Statut                                                                            |
| --- | ------------------------------------- | --------------------------------------------------------------------------------- |
| F.1 | Sticky nom séance                     | ✅                                                                                |
| F.2 | Preview live filtres (debounce 300ms) | ✅                                                                                |
| F.3 | Timeline appels/contact               | ⚠️ Partiel (badge rappel + events panel, pas de timeline visuelle en mode normal) |
| F.4 | Séance ABM : sélecteur date           | ✅                                                                                |
| F.5 | Remove optimiste + séance 2           | ⚠️ Partiel (perfs OK, bouton relance via defer pas adjacent)                      |
| F.6 | Picklist raison de perte Labo         | ✅                                                                                |
| F.7 | Forecast sur Pace                     | ⏭️ Skip (décision archivée)                                                       |
| F.8 | Breakdown CA Lundi                    | ✅                                                                                |

### Design system — ✅

- Composants partagés `src/components/ui/` : Button, Skeleton, EmptyState, GlassCard, Tag, Select, Modal, ProgressBar, SegmentedControl, DatePicker, Checkbox + barrel.
- 65 boutons natifs migrés vers Button.
- Glassmorphism débloqué (backdrop-filter retiré de `.xos-window`).
- Crossfade 150ms entre fiches + `prefers-reduced-motion`.

---

### Lot 5.1 — Moteur de challenges — ⬜

- CRUD challenges (managers) sur catalogue de métriques (réutilise les agrégations 3.1/4.1 + `action_journal`, incluant des indicateurs de qualité de remplissage du CRM : complétude des fiches, CloseDate valide, raisons de perte renseignées) ; cron Vercel de recalcul → snapshots `challenge_results`, attribution `badges`.
- **Templates V1** (déjà figés dans `combo-gamification-v1.md` §6) : `cumul_rdvs` (cumulatif), `solidarite_lundi` (solidarité), `relais_rappels` (relais).
- **Pas de calcul de rang.** `challenge_results` stocke la valeur par participant, pas le rang calculé — le rendu public est anonymisé.
- **Badge 🤝 Relais** décerné côté Arena à tous les contributeurs d'un défi atteint ; le `kind` de notif associé (`relais`) est déjà défini dans `combo-gamification-v1.md` §3.1.
- **Vérifié par** : challenge de test sur une métrique réelle de qualité CRM, snapshot recalculé par le cron, badge collectif attribué en fin de période, **feed anonyme vérifié** (aucun nom sans opt-in).

### Lot 5.2 — UI Arena — ⬜

- **Feed anonyme** des réussites équipe (challenge atteint, palier XP franchi par un membre — si opt-in signature).
- **Vue défi en cours** : compteur agrégé équipe ("47/100 RDV"), pas de compteur individuel.
- **Médaille collective** (badge 🤝 Relais) partagée par tous les contributeurs d'un défi atteint.
- **Création de défi** (manager) : depuis la liste des templates + libre.
- **Historique** des défis passés (archives anonymes).
- **Tableau de bord** des indicateurs de qualité de saisie CRM (cumulé équipe, pas par personne).
- **Opt-in signature** : toggle par utilisateur dans `profiles` (`show_name_on_achievements boolean`).
- **Vérifié par** : QA visuelle + parcours complet création → participation anonyme → clôture → mur collectif.

### Dépendances externes à Arena

- Combo V1 (lots G.1-G.9) doit être livré pour fournir les `kind` de notifs émis par Arena. Pas de blocker dur côté data (les tables Supabase existent déjà), mais le moteur Arena ne peut être validé UX qu'après la V1 Combo.

### Hors scope Arena (couvert par Combo V1)

- Système XP/paliers/badges/streaks personnels → `combo-gamification-v1.md` §1.
- Nudges d'apprentissage, de cadrage, de fin de séance → `combo-gamification-v1.md` §2.
- Mur des réussites personnel ("Mes réussites") → `combo-gamification-v1.md` §5.
- Templates de note MEDDIC lite → `combo-gamification-v1.md` §2.2.

---

> **Décision deux apps (2026-07-11)** : Lundi garde le micro hebdo (rituel d'équipe) ; **Bilan** (ex-Business Review) porte le macro — portage X OS du dashboard V6 Hermes (`/Users/theosavoy/xos-dashboard`) : granularité Semaine/Mois/Trimestre/Année, navigation historique, comparaison auto N-1 (et N-2), filtres par commercial, CA par type de vente, funnel SDR, opps à l'attention. **Partage d'analyses** manager/admin → commercial (config + note, données recalculées ; table `shared_analyses`).
>
> **Branding (2026-07-23)** : l'app s'appelle **Bilan** — la régie théâtre, l'endroit d'où le metteur en scène monitore tout le spectacle. Cohérent avec la famille Labo / Combo / Lundi / Coulisses. ID registry `"review"` conservé pour les deep links. **Spec dev-ready** : `docs/specs/business-review.md` v2 (architecture, SOQL porté du V6, composants, lots).

- **Lot 6.0 — Audit macro** — ⬜ (partiel) : ~~FY XOS~~ **acté juillet→juin**, ~~picklists~~ **vérifiées** (`Type_de_vente__c`, `Resultat_call__c`). Reste : profondeur N-2, volumétrie SOQL, `sf_user_map` complet. **Validation Théo** sur les sections prioritaires — bloque 6.1.
- **Lot 6.1 — `api/review.js`** — ⬜ : routeur `?resource=kpis|breakdown|funnel|attention|calls|shared`, helpers `api/_review/{soql,kpis,breakdown,funnel,attention,calls,shared}.js`, cache 1 h, migration `shared_analyses` + RLS, authz commercial = analyses partagées uniquement.
- **Lot 6.2 — UI `src/apps/review/`** — ⬜ : shell + 6 sections (Cockpit, Activité, Performance, Funnel, Attention, Appels), PeriodSelector, OwnerFilter, ShareModal, SharedList, registry `"Bilan"`, deep link `?open=review&shared=<id>`, partage bout en bout.

## Phase 7 — Agent XOS (chat + Slack + Hermes) — ⬜

> **Vision** : faire de X OS le **go-to** de l'équipe — interface principale de travail, Slack comme **bus de messages** (persistance, temps réel, miroir mobile dans l'app Slack native). Le **cerveau** est **Hermes, une app Slack** installée dans le workspace XOS (mémoire + skills multi-utilisateurs, hébergée par Théo — infra opaque à X OS). X OS (Vercel) fournit l'UI chat, l'identité et le **transport Slack**. **X OS ne parle jamais à Hermes directement : tout passe par Slack.** Pas d'iframe `app.slack.com` (bloquée par `X-Frame-Options` / CSP `frame-ancestors`). Pas d'app « Navigateur » générique — hors périmètre.

### Décisions d'architecture (actées le 2026-07-10, discussion produit)

| Sujet                       | Décision                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Iframe Slack**            | ⛔ **Impossible** — `app.slack.com` refuse l'embarquement.                                                                                                                                                                                                                                                               |
| **App Navigateur**          | ⛔ **Hors périmètre** — pas de valeur ajoutée identifiée ; les intégrations passent par l'agent et les apps X OS dédiées.                                                                                                                                                                                                |
| **UI**                      | Fenêtre **chat custom** React (`src/apps/agent/`) : bulles, input, historique scrollable.                                                                                                                                                                                                                                |
| **Agent (cerveau)**         | **Hermes = une app Slack** installée dans le workspace XOS. Elle reçoit les DM via **sa propre** intégration Slack (Events API côté Hermes) et répond dans le fil. Mémoire par utilisateur + skills gérées **entièrement côté Hermes**, indexées par `slack_user_id`. Infra/hébergement Hermes **opaques** au repo X OS. |
| **Rôle de Vercel (`api/`)** | **Transport Slack uniquement** : poster/lire les DM du bot, recevoir les events pour le push temps réel au front. **Aucun appel direct à Hermes, aucun secret Hermes, aucune logique LLM** dans le repo X OS.                                                                                                            |
| **Backend messages**        | **Slack API** (Web API + Events API) via endpoints Node — token bot **jamais** exposé au navigateur.                                                                                                                                                                                                                     |
| **Canal par utilisateur**   | **DM user ↔ bot Hermes** (`conversations.open`), un fil par commercial ; historique via `conversations.history`.                                                                                                                                                                                                         |
| **Identité**                | Login Supabase (`@xos-learning.fr`) → `profiles` (email, rôle, `sf_user_id`, `slack_user_id`). Le `slack_user_id` sert à retrouver le bon fil DM ; côté Slack, **Hermes identifie le commercial par son `slack_user_id`** pour isoler contexte et mémoire.                                                               |
| **Temps réel**              | **Events API** (webhook `api/slack/events`) + push au front (SSE ou polling léger) — pas de Socket Mode (serverless).                                                                                                                                                                                                    |
| **Outils & process**        | Les **skills** de Hermes (branchées sur Salesforce, actions X OS via deep links, etc.) sont configurées **côté Hermes** — hors périmètre du repo X OS.                                                                                                                                                                   |
| **Actions UI**              | Les réponses Hermes peuvent inclure des **liens profonds** X OS (`?open=cleaner&…`, Cmd+K) dans le texte du message Slack.                                                                                                                                                                                               |
| **Prérequis org**           | Workspace Slack XOS unique ; **app Slack Hermes installée** (Théo) ; **app Slack X OS (transport) installée**.                                                                                                                                                                                                           |

```
[X OS — fenêtre Agent]  →  [api/chat + api/slack · Vercel]  ─┐
                                                             ↓
                                              [Slack · fil DM user ↔ bot Hermes]
                                                             ↑
                                        [Hermes = app Slack · mémoire + skills / user]
                                                             ↓
                              [Salesforce · X OS APIs · autres outils commerciaux]
```

_X OS et Hermes se connectent chacun à Slack ; ils ne se connectent jamais l'un à l'autre._

### Lot 7.0 — Cadrage Slack + Hermes — ⬜ _(bloqué : workspace + app Hermes)_

- **Slack (transport X OS)** : app sur [api.slack.com](https://api.slack.com) (scopes bot, Events API, OAuth) ; installation workspace XOS ; variables Vercel `SLACK_*`.
- **Hermes** : **app Slack Hermes installée dans le workspace** (scopes, mémoire, skills = **périmètre Hermes**, hors repo X OS) ; vérifier que le bot Hermes répond en DM.
- Flux d'onboarding : connexion X OS → liaison Slack → DM au bot Hermes → Hermes charge la mémoire du commercial (via `slack_user_id`).
- **Vérifié par** : DM Slack au bot Hermes → réponse ; validation Théo.

### Lot 7.1 — Liaison identité & OAuth Slack — ⬜

- Migration Supabase : colonnes `profiles.slack_user_id`, `profiles.slack_dm_channel_id` (nullable).
- `api/slack/oauth.js` : démarrage OAuth + callback, stockage du mapping pour l'utilisateur JWT connecté.
- `GET /api/slack/status` : état de liaison (connecté / non connecté) pour l'UI.
- **Vérifié par** : utilisateur X OS connecte Slack une fois ; `slack_user_id` persisté ; statut relu après reconnexion.

### Lot 7.2 — Backend chat & transport Slack — ⬜

- `api/slack/events.js` : vérification signature Slack ; réception des events du fil DM (messages postés par le bot Hermes) → push au front.
- `api/chat.js` :
  - `GET /api/chat/history` — historique du DM user↔bot via `conversations.history` (JWT requis).
  - `POST /api/chat` — message utilisateur → posté dans le DM Slack (`chat.postMessage`). Hermes (app Slack) le reçoit côté Slack et répond dans le fil ; la réponse remonte au front via events/polling.
- **Aucun appel à Hermes** : X OS ne connaît que Slack. Erreurs Slack gérées gracieusement.
- **Vérifié par** : message X OS → visible Slack + réponse du bot Hermes remonte dans l'UI ; JWT absent → 401 ; Slack injoignable → message d'erreur utilisateur sans crash.

### Lot 7.3 — App fenêtre « Agent XOS » — ⬜

- `src/apps/agent/` : UI chat (liste messages, input, états loading/erreur, indicateur « agent réfléchit… »).
- Enregistrement dans `src/os/registry.ts` (`id: "agent"`, icône dock dédiée).
- Écran « Connecter Slack » si `GET /api/slack/status` = non lié.
- Rafraîchissement temps réel v1 : polling 2–3 s ou SSE si livré dans 7.2.
- **Vérifié par** : parcours complet login X OS → liaison Slack → conversation avec le bot dans une fenêtre X OS ; QA visuelle cohérente charte XOS.

### Lot 7.4 — Skills Hermes & intégration process commerciaux — ⬜ _`Hermes` (config côté agent, hors repo X OS)_

- Skills Hermes branchées sur les outils réels (Salesforce, deep links Labo, quotas Hub…) et **mémoire par commercial** (historique, préférences, comptes suivis) — **entièrement côté Hermes**, indexées par `slack_user_id`.
- Réponses structurées (liens X OS, confirmations d'actions SF) pour coller aux workflows terrain.
- **Vérifié par** : scénarios métier validés par un commercial pilote (ex. « logue mon appel », « montre mes opps en retard », « ouvre le cleaner sur ce compte »).

**🎯 Jalon** : l'équipe traite son quotidien via le bot Hermes dans X OS (et Slack mobile sur le même fil), avec des actions qui s'intègrent aux process existants.

---

## Phase 8 — Login Salesforce _(lot dédié, indépendant)_ — ✅

Ajoute **« Se connecter avec Salesforce »** sur l'écran de login **EN PLUS** du lien magique — deux options coexistent, aucune ne remplace l'autre. Prépare aussi l'attribution niveau 2 (actions SF sous le nom de chacun, pas seulement `OwnerId` posé par l'utilisateur d'intégration).

- **Lot 8.1 — OAuth Salesforce (login + liaison user)** — ✅ : login Salesforce livré via le provider OIDC custom Supabase. Après ce login, `provider_refresh_token` est automatiquement transmis au backend, validé contre l'email + `sf_user_id`, puis chiffré AES-256-GCM ; le bouton « Lier Salesforce » reste un secours pour les sessions magic-link/reconnexions. Le flow dédié (`POST ?flow=salesforce-link` puis `GET ?flow=salesforce-callback`) utilise un état hashé/expirant. Migration 015, `SF_TOKEN_ENCRYPTION_KEY` et déploiement Production effectués le 2026-07-11. **Validé par Théo le 2026-07-23.**
- **Lot 8.1b — Attribution niveau 2 (écritures sous l'identité du commercial)** — ✅ : Call Manager, Launcher et Labo utilisent le refresh token SF **du commercial** quand il existe, avec fallback intégration. Cache 30 min par user + retry 401 sous la même identité. **Validé par Théo le 2026-07-23.**
- **Lot 8.2 — UI login à deux options** — ✅ : écran `src/auth/LoginScreen.tsx` aligné charte X OS (wallpaper boot, glass card, logo), bouton **« Se connecter avec Salesforce »** + séparateur + lien magique, gestion `?auth_error=…`.
- **Vérifié par** : login via SF → session X OS active, `sf_user_id` mappé ; login via lien magique inchangé ; un compte hors `xos-learning.fr` refusé.

## Phase 9 — Copilot _(pilotage pipeline & adoption CRM)_ — ⬜

> Contrat : `docs/specs/copilot.md`. **Ordre d'exécution : avant la Phase 5 (Arena)** — les numéros de phase sont des identifiants stables, pas l'ordre. Moteur de **règles déterministes** (pas de LLM) ; seuils dans `settings`, champs critiques dans le mapping CRM, actions 1-clic déléguées aux endpoints d'écriture existants.

### Lot 9.0 — Audit SOQL Copilot — ⬜ _(bloque 9.1)_

- Volumétrie : opps ouvertes par commercial, distribution de l'activité par opp (dernière Task/Event), délais réels entre étapes (`OpportunityHistory`), CloseDate dépassées.
- **Adoption CRM** : volumes réels d'appels loggés / Events / contacts et comptes créés par commercial ; trancher l'attribution des créations (`CreatedById` = intégration sur les chemins X OS → utiliser `OwnerId` ? à vérifier sur les données) ; taux de remplissage actuels des champs critiques candidats (Opp : Amount, CloseDate, étape ; Contact : téléphone, fonction ; Account : secteur, effectif).
- Calibrage des seuils par défaut (dormance, blocage, relance proposition) sur les distributions réelles → **validation Théo** des seuils et de la liste des champs critiques.
- Livrable : `docs/audits/lot-9.0-copilot.md`.

### Lot 9.1 — `api/copilot.js` — ⬜

- Routeur (pattern `api/calls.js`) : `?resource=pipeline|alerts|adoption|strategies`, JWT requis, cache `s-maxage=900`. 8ᵉ fonction Vercel (plafond 12 — OK, voir `docs/ops/vercel-functions.md`).
- Règles dans `api/_copilot/` (helpers non exposés) ; requêtes via l'adapter `api/_crm/` ; **aucun nom de champ SF en dur** (mapping) ; seuils lus depuis `settings` ; métriques d'adoption alignées sur les définitions Weekly Perf (pas de deuxième vérité).
- Aucune écriture SF propre : les actions 1-clic pointent vers les endpoints existants (logging Call Manager, `api/presets.js`, Launcher `/log`).
- **Vérifié par** : tests API (authz, chaque règle sur données de test, seuil modifié dans `settings` pris en compte, cohérence adoption vs `api/perf`).

### Lot 9.2 — UI Copilot — ⬜

- `src/apps/copilot/` + entrée `src/os/registry.ts` : vue pipeline triée par urgence (« à clôturer sous 30 j » en avant), file d'alertes avec action 1-clic, panneau adoption/qualité (vues Moi / Équipe manager+admin), suggestions de prospection → ouvre le Call Manager pré-configuré.
- **Vérifié par** : QA visuelle charte X OS + cohérence des chiffres avec 9.1 + une action 1-clic de bout en bout (alerte → Task SF `OwnerId` correct).

---

## Phase 10 — Labo _(reconstruction modulaire — priorité courante)_ — ⬜

> Contrats : `docs/specs/labo.md` et `docs/plans/labo-implementation.md`. Le legacy reste actif jusqu'au lot 10.7. La V1 livre le shell modulaire et le module Opportunités complet ; Doublons/Contacts/Comptes restent hors périmètre.

### Lot 10.0 — Audit, fixtures et matrice de parité — ⬜

- Audit Salesforce en lecture seule : volumétrie des opportunités ouvertes, pagination, owners, étapes et métadonnées de picklists.
- Fixtures anonymisées couvrant chaque règle et chaque action legacy ; matrice de parité transformée en tests rouges.
- Livrable : `docs/audits/lot-10.0-cleaner-v2.md` + `scripts/audit/cleaner_v2_audit.py`.
- **Vérifié par** : script compilé et exécuté si les credentials sont disponibles ; aucune écriture ; chaque capacité legacy reliée à un test.

### Lot 10.1 — Contrats, règles et lecture workspace — ⬜

- Contrats typés module/anomalie/capacités ; catalogue de règles déterministes ; seuils validés depuis `settings` ; champs SF uniquement dans `api/_crm/mapping.js`.
- `api/cleaner.js` routeur mince + `api/_cleaner/{core,opportunities}/` ; workspace commercial limité à son `sf_user_id`, vue équipe manager/admin.
- Analytics owner/étape/retard/raisons dérivées de la même vérité que la file de nettoyage.
- **Vérifié par** : tests unitaires de chaque règle, assertion négative « inactivité seule = aucune anomalie », authz 401/403, pagination et cohérence workspace/analytics.

### Lot 10.2 — Supabase, import Blob et idempotence — ⬜

- Migration suivante disponible (prévue `021_cleaner_v2.sql`, renuméroter si nécessaire) : métadonnées Labo, `source_id` d'import, `command_id`, `idempotency_key`, contraintes uniques et indexes.
- Script idempotent `scripts/migrate-cleaner-history.js` avec `--dry-run`, comptes source/cible et exit non nul sur écart.
- Historique v2 lu uniquement depuis `action_journal` après la bascule ; blobs conservés en sauvegarde jusqu'à accord explicite de suppression.
- **Vérifié par** : deuxième import fixture = 0 insertion ; migration réelle uniquement après accord ; comptes actions/cibles identiques.

### Lot 10.3 — Preview et exécution des corrections — ⬜

- Actions : owner utilisateur/owner du compte, CloseDate, étape, type de vente, changements multi-champs et fermeture en perdue avec raison compatible.
- Deux étapes obligatoires : preview serveur relisant les valeurs et exclusions, puis execute avec preview valide + clé d'idempotence.
- Token Salesforce personnel si disponible, fallback intégration existant ; résultats partiels et avant/après journalisés.
- **Vérifié par** : stale preview = 409 et zéro écriture ; double execute = une écriture maximum ; erreurs par enregistrement conservées.

### Lot 10.4 — Shell React, cockpit et onglets — ⬜

- Remplacement de l’ancienne frontière iframe dans `src/apps/cleaner/` par un shell modulaire : Accueil fixe, un onglet par module, état conservé.
- Cockpit hybride sans score global artificiel : anomalies, enregistrements concernés, criticité, évolution, résolution et fraîcheur.
- Registre statique/typé, chargement paresseux ; aucun moteur de plugin distant ni store global ajouté.
- **Vérifié par** : tests navigation/état/rôles, aucune iframe ou `postMessage`, QA visuelle tailles min/max de fenêtre X OS.

### Lot 10.5 — Opportunités : Nettoyage, détail et actions en lot — ⬜

- Vue `Nettoyage` : bandeau KPI compact B1, catégories, filtres, recherche, tableau dominant, tri/pagination, sélection page/tous les résultats.
- Panneau détail léger sur clic de ligne ; checkbox indépendante ; multi-sélection toujours disponible.
- Barre sticky puis panneau de correction → preview → confirmation → résultats ; échecs gardés sélectionnés.
- **Vérifié par** : filtres raisons OU intra-famille / ET inter-familles, persistance de sélection, toutes les écritures legacy présentes dans la matrice.

### Lot 10.6 — Opportunités : Synthèse, Historique et réglages Hub — ⬜

- Vue `Synthèse` dédiée : analyses legacy owner/étape/ancienneté/raisons + évolution/résolution factuelles ; clic → Nettoyage filtré.
- Vue `Historique` paginée : acteur, avant/après, cibles, résultats et liens SF.
- Éditeur typé des seuils Labo dans Hub pour manager/admin ; aucun constructeur de règles.
- **Vérifié par** : agrégats identiques aux fixtures, navigation filtrée, permissions Hub, historique Supabase uniquement.

### Lot 10.7 — Gate de parité, bascule et retrait du legacy — ⬜

- Exécuter toute la matrice de parité, importer et contrôler l'historique, puis basculer Launcher/registry vers le module natif.
- Scanner les usages runtime ; après zéro appel legacy, retirer les surfaces legacy et la règle middleware dédiée. Cette suppression est livrée : seules les routes natives `/api/cleaner`, `/api/status` et les autres fonctions X OS restent protégées.
- Mettre à jour README, inventaire Vercel, tests et documentation. Aucun déploiement, write live, migration réelle ou suppression Blob sans accord explicite.
- **Vérifié par** : `npm run test`, `npm run lint`, `npm run build`, `npx prettier --check .`, `git diff --check`, QA navigateur complète, scan runtime legacy à zéro.

**Dépendances** : 10.0 → 10.1 ; 10.2 parallèle à la lecture de 10.1 une fois les contrats figés ; 10.3 après 10.1+10.2 ; 10.4 parallèle à 10.2/10.3 sur fixtures ; 10.5 après 10.3+10.4 ; 10.6 après 10.2+10.5 ; 10.7 en dernier.

**Pilotage Foederati** : lot 10.1 règles pures uniquement, isolé et réversible. Si worktree, modèle, diff, erreurs typées ou résultat ne sont pas fiables, abandon immédiat du pilote et retour au flux Orca canonique pour tous les lots suivants.

---

## Phase 11 — Combo Power Prospection _(Telnyx + IA)_ — ⬜

> **Spec complète** : `docs/specs/combo-prospection-autonome.md` v2 (2026-07-23).
> **Sources** : `docs/audits/lot-11.0-telnyx.md`, `docs/prospecting-ux-pattern-catalog.md`, `docs/power-dialer-research.md`.

### Vision

Minari/Flunter + la touche Combo. Power dialer 3-5 lignes, enregistrement, transcription, résumé IA, ACW pré-rempli validé en 1 clic → Salesforce. Gamification branchée sur la prospection réelle (différenciateur unique). Pas de niveau autonome, pas de Bloctel (B2B), pas de séquences multi-canal.

### Lots (7 lots, 8-9 semaines)

| Lot  | Contenu                                                                    | Dépendance                |
| ---- | -------------------------------------------------------------------------- | ------------------------- |
| 11.0 | Audit & cadrage                                                            | ✅ Fait 2026-07-23        |
| 11.1 | Infrastructure Telnyx (REST, webhooks Ed25519, migrations)                 | Compte Telnyx + numéro FR |
| 11.2 | Moteur parallèle + UI live (orchestrator, SSE, PowerDialerView)            | 11.1                      |
| 11.3 | Enregistrement + transcription + résumé IA (GPT-4o-mini)                   | 11.1                      |
| 11.4 | ACW & consignation CRM (ACWOverlay, validation 1 clic, Task/Event/Note SF) | 11.2 + 11.3               |
| 11.5 | Gamification power (XP, badges, streaks)                                   | 11.4                      |
| 11.6 | Récap & stats (session, manager, Bilan)                                    | 11.4                      |

### Coût : ~1,41€/session → ~310€/mois pour 5 commerciaux

### Prérequis humains

- Compte Telnyx + KYC FR + numéro(s) outbound + crédits
- PSTN callback confirmé (V1)
- Clé API LLM (GPT-4o-mini)

---

### Compléments plan à prévoir (hors lots initiaux)

| Sujet                                  | Pourquoi                                                                      | Suggestion                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ~~Auto-map `sf_user_id` (magic link)~~ | Attribution niveau 1 sans OAuth SF                                            | ✅ **Fait 2026-07-11** — migration 013 (`sf_user_map` + trigger + backfill) |
| Extinction Basic Auth                  | Décision humaine fin Phase 2                                                  | Lot middleware une fois Hub + équipe basculée                               |
| Consolidation tokens CSS               | Résidus `boot.css` / `desktop.css` (charte en dur)                            | Lot theming non urgent (prépare multi-tenant)                               |
| **Plafond 12 fonctions Vercel Hobby**  | ✅ Désamorcé : **7/12, 5 slots libres** (consolidations B puis C, 2026-07-11) | `docs/ops/vercel-functions.md` — inventaire à jour                          |
| Rôles admin/manager/commercial         | Actés                                                                         | Migration `008` + `api/_config/access.js` + `docs/specs/roles-and-hub.md`   |

---

## Suivi

| Phase | Lots               | Statut                                                                                                                                                                                  | Parallélisme                          | Jalon                                                  |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| 0     | 0.1 → 0.2          | ✅                                                                                                                                                                                      | séquentiel                            | Socle déployé, auth lien magique OK                    |
| 1     | 1.1 ∥ 1.2 ∥ 1.3    | ✅                                                                                                                                                                                      | 3 agents                              | **V1 : bureau + Cleaner**                              |
| 2     | 2.1 → 2.2, ∥ 2.3   | ✅                                                                                                                                                                                      | 2-3 agents                            | **Launcher + Hub livrés**                              |
| 3     | 3.0 → 3.3          | ✅                                                                                                                                                                                      | séquentiel                            | **Weekly Perf complet en prod (rituel équipe inclus)** |
| 4     | 4.0 → 4.2 + v2.A–C | ✅                                                                                                                                                                                      | —                                     | **Call Manager v1+v2**                                 |
| C1    | Combo V1           | ✅ (BUG-07 ✅ fixé 2026-08-01, useNudgeLearning ✅ supprimé, reste F.3/F.5b polish)                                                                                                     | —                                     | **Gamification câblée + design system**                |
| 5     | 5.1 → 5.2          | ❄️ **Gelée** (décision Théo 2026-08-01 — Combo au centre, Arena non prioritaire. Débloquer nécessite migration gamification localStorage → Supabase, ~2 sem.)                           | —                                     | Arena                                                  |
| 6     | 6.0 → 6.1 → 6.2    | 🟡 **Code 6.1+6.2 existant en untracked** (API + UI, ~1700 LOC). Non testé, non commité. Reste : lot 6.0 audit macro (validation seuils Théo), tests, gate QC.                          | séquentiel                            | Bilan (cockpit macro)                                  |
| 7     | 7.0 → 7.4          | ❄️ **Gelée** (bloque sur workspace Slack + app Hermes)                                                                                                                                  | séquentiel (7.4 = Hermes)             | Agent XOS                                              |
| 8     | 8.1 → 8.2          | ✅ (validé Théo 2026-07-23)                                                                                                                                                             | indépendant                           | Login Salesforce                                       |
| 9     | 9.0 → 9.1 → 9.2    | ⬜                                                                                                                                                                                      | séquentiel — **priorité après Bilan** | Copilot                                                |
| 10    | 10.0 → 10.7        | 🟡 **Livré à ~90%** (shell modulaire + modules Opportunités + Recettes, legacy retiré, ~8600 LOC UI + ~5700 LOC API). Reste : lot 10.7 gate parité formel + doc cutover, ~demi-semaine. | —                                     | **Labo natif et modulaire**                            |
| 11    | 11.0 → 11.6        | ⬜ (audit 11.0 ✅ fait 2026-07-23. **Prérequis technique : découper Combo** (21K LOC à plat, RunnerView 2529 LOC) avant lots 11.2+. Bloque aussi sur compte Telnyx.)                    | backend/UI partiellement ∥            | **Telnyx Power Dialing**                               |

### Priorisation actualisée (décision Théo 2026-08-01)

> **Stratégie** : Combo est le produit avec le plus de potentiel. Consolider et construire autour de Combo (Telnyx, Copilot, Bilan). Arena gelée.

1. ~~Phases 0-4, Combo V1, Phase 8~~ ✅ · ~~BUG-07~~ ✅ · ~~useNudgeLearning~~ ✅ · ~~lint rouge~~ ✅ · ~~prettier aligné~~ ✅.
2. **6 Bilan** — committer le code existant, tester, gate QC. Priorité produit immédiate (analytique différenciante).
3. **10.7 Labo gate parité** — demi-semaine, finir le chantier.
4. **11 Telnyx Power Dialing** — transformation de Combo en power dialer réel. **Prérequis technique : découper `src/apps/calls/`** (modulaire comme Labo) avant 11.2. Prérequis externe : compte Telnyx + numéro FR.
5. **9 Copilot** — intégration naturelle avec Combo (« next action » pour le commercial).
6. **5 Arena** — ❄️ gelée (Combo V1 couvre la gamification personnelle ; Arena collaborative non prioritaire).
7. **7 Agent XOS** — ❄️ gelée (bloque Slack).
8. **Polish Combo résiduel** : F.3 (timeline visuelle), F.5b (bouton relance adjacent).
9. **Migration gamification localStorage → Supabase** — prérequis dur pour Arena (non planifié dans la fenêtre actuelle).

Défauts actés (véto possible) : Supabase région `eu-west` ; un lot = un worktree isolé, PR/merge après gate QC et accord ; **Slack = transport/persistance des messages** ; **Hermes = app Slack multi-user** (mémoire + skills), infra opaque ; X OS = UI + transport Slack, **jamais d'appel direct à Hermes**, pas de LLM embarqué ; écritures SF restent sur `api/` protégé JWT.

### Risques techniques identifiés (audit 2026-08-01)

- **Gamification 100% localStorage** : non portable entre machines, non auditable, Set de dédup sans borne. Bloque Arena. Migration Supabase = ~2 sem (non planifiée).
- **Combo 21K LOC à plat** : RunnerView 2529 LOC, 0 sous-dossiers. Pré-requis au découpage modulaire avant Telnyx (Phase 11).
- **`api/perf.js` 1630 LOC** : plus gros handler, non décomposé. Bilan (Phase 6) va dupliquer la logique de périodes si pas refactoré avant.
- **Pas de CI** : gates QC déclaratifs exécutés à la main. Le lint était rouge sur main (corrigé 2026-08-01).
- **Résolution du rôle dupliquée 3× côté front** : Desktop, CleanerApp, CallManagerApp — un `RoleContext` coûte 40 lignes.
- **`src/components/ui` testé à 11%** : design system partagé par 5 apps, 0 test sur DatePicker/TimePicker/Select/etc.
- **Vercel Hobby 9/12** (10/12 après Bilan commit). Voir `docs/ops/vercel-functions.md`.

Décisions humaines attendues en cours de route :

- ~~Domaine email autorisé pour le lien magique~~ → **`xos-learning.fr`** (acté le 2026-07-10).
- ~~Création du CNAME `xos.hellotheo.fr`~~ et configuration DNS du domaine sur le projet Vercel renommé **xos** → **Fait (actif)**.
- ~~Configuration de la redirect URL Supabase~~ → **Fait** (Phase 8 validée 2026-07-23).
- ~~Liste des emails managers / admin~~ → **actée 2026-07-11** (voir `api/_config/access.js`).
- ~~Validation des définitions Weekly Perf (3.0)~~ → **actée 2026-07-11** (`docs/specs/weekly-perf.md`).
- ~~URL de callback OAuth à ajouter sur la Connected App Salesforce~~ → **Fait** (Phase 8 validée 2026-07-23).
- ~~Basic Auth legacy~~ → **Déjà éteint** (middleware.js 100% JWT Supabase, audit 2026-08-01).
- ~~Migrations 014 en double~~ → **Faux** (un seul `014_sf_user_map_roles.sql`, audit 2026-08-01).
- **Workspace Slack XOS** + validation du flux « un DM agent par commercial » (lot 7.0) — bloque 7.1.
- **App Slack Hermes installée dans le workspace XOS** (scopes, mémoire, skills — côté Théo) — bloque 7.0/7.2.
- **Hobby vs Pro Vercel** : 9/12 utilisé, 10/12 après Bilan. Pro reporté par Théo (2026-08-01) — consolider si besoin.
- **Telnyx** : création compte, numéro outbound FR, crédits, décision WebRTC vs PSTN callback — bloque 11.1.
