# Audit santé projet — 2026-07-16

**Branche** : `main` (HEAD = `0fc7edc`)
**Périmètre** : git/branches, Supabase (état prod), code health `src/apps/calls/`, autres modules, tests/lint, secrets
**Méthode** : lecture directe + commandes shell. Read-only, aucune modification, aucun push, aucun db push.

---

## 1. TL;DR

1. **Migration Supabase `030_combo_pre_session_engagement.sql` N'EST PAS APPLIQUÉE en prod.** `engaged_at` et `rdv_goal` manquent sur `call_sessions`. → API `create_session`, `update_session`, `get_session` crashent probablement ou retournent des erreurs silencieuses. **À corriger avant tout le reste.**
2. **Héritage divergent** : 25 migrations timestamps sur la prod (hors-repo) ont été "revertées" dans l'historique par un ancien run de `db pull` raté. → état de la prod non traçable depuis le repo.
3. **Code `PreSessionFlow.tsx` et CSS `calls.css` désynchronisés** : 58 classes CSS `.calls-pre-session*` définies, 28 utilisées dans le TSX. **~30 classes CSS orphelines**, signe de refontes parallèles non fusionnées. Glassmorphisme techniquement présent dans le CSS mais classes mal câblées côté TSX → rendu pourri que tu observes.
4. **5 worktrees parasites** au moment de l'audit : 2 créés par toi (`fix/c18-create-routing`, `fix/c27-routing-repro`) + 3 que j'ai créés pour l'audit puis nettoyés. **Plus que 2 maintenant.**
5. **10+ branches remote obsolètes** mergées dans main mais non supprimées. `worktree-fix-refresh-architecture` pointe sur une branche remote `gone`.

---

## 2. Git & branches

### 2.1 État actuel (après cleanup)

```
main                                                0fc7edc [origin/main]
.worktrees/c18-create-routing                       58153c4 [fix/c18-create-routing]
.worktrees/c27-routing-repro                        0fc7edc [fix/c27-routing-repro]
```

### 2.2 Branches locales — verdict

| Branche | SHA | Worktree | Verdict |
|---|---|---|---|
| `main` | `0fc7edc` | repo principal | **GARDER** — branche de prod |
| `feat/determinism-hardening` | `0fc7edc` | aucun | **SUPPRIMER** — alignée sur main, pas d'apport |
| `lot-a-backend` | `9d00638` | aucun | **À VÉRIFIER** — n'a pas bougé depuis longtemps, dev probable abandonné |
| `lot-b-front` | `672e876` | aucun | **À VÉRIFIER** — idem |
| `Theo-Savoy/auto-r-solution-issues-ouvertes-run-3-20260711T0009` | `7f576b0` | aucun | **À VÉRIFIER** — run auto d'il y a 5 jours |
| `fix/c18-create-routing` | `58153c4` | `.worktrees/c18-create-routing` | **WORKTREE ORPHELIN** — SHA 58153c4 ≠ main, mais sans usage actuel. Vérifier si le travail a été mergé ou abandonné. |
| `fix/c27-routing-repro` | `0fc7edc` | `.worktrees/c27-routing-repro` | **WORKTREE INUTILE** — aligné sur main, worktree peut être supprimé |

### 2.3 Branches remote obsolètes (déjà mergées dans main)

```bash
git branch -r --merged main | grep -v "HEAD\|main"
```

**À supprimer sur origin** (10+) :
- `origin/cursor/calls-recall-session-ux-aac5`
- `origin/cursor/cockpit-ux-followup-aac5`
- `origin/cursor/list-view-stay-on-log-aac5`
- `origin/cursor/opp-perdue-non-filter-aac5`
- `origin/cursor/recalls-runner-listbuilder-aac5`
- `origin/fix/combo-rdv-lundi-team-bar`
- `origin/fix/lundi-team-data`
- `origin/fix/opp-filters-js-filtering`
- `origin/fix/pilotage-heatmap-weekdays`
- `origin/fix/salesforce-auth-reconnect`
- `origin/fix/sf-user-only-ouath-ux` (typo dans le nom)

### 2.4 Branches remote non mergées (à examiner)

10 branches remote non mergées (toutes préfixées `origin/feat/combo-*` ou `origin/fix/combo-*`). **ACTION** : `git branch -r --no-merged main` puis examiner si elles sont vivantes ou mortes. Risque : elles contiennent peut-être des fix que tu n'as pas vus.

### 2.5 Branche remote `gone`

```
worktree-fix-refresh-architecture fe27d72 [origin/worktree-fix-refresh-architecture: gone]
```

**Branche locale pointe sur une remote qui n'existe plus.** Action : `git branch -d worktree-fix-refresh-architecture` ou rebase sur main.

### 2.6 Worktrees parasites

- `c18-create-routing` et `c27-routing-repro` sont des worktrees git internes au repo (`.worktrees/`). Ils sont laisses en place par d'anciens runs Cursor/autres agents. **ACTION** : vérifier l'usage, supprimer ceux qui sont alignés sur main.

---

## 3. Supabase — état migrations

### 3.1 Migrations locales vs appliquées

| Fichier local | Appliqué en prod ? | Action |
|---|---|---|
| `001_initial_schema.sql` → `028_recette_journal.sql` | ✅ OUI | — |
| `021_call_session_contacts_rdv_owner.sql` | ✅ OUI | — |
| `029_lock_rls_service_role_tables.sql` | ✅ OUI | — |
| `021_cleaner_v2.sql` | ❌ NON | code tourne sans → vérifier si nécessaire ou marquer `applied` |
| `029_notification_dedupe.sql` | ❌ NON | idem |
| **`030_combo_pre_session_engagement.sql`** | ❌ **NON** | **🔴 BLOQUANT — appliqée avant tout** |

### 3.2 Migration 030 — bloquant P0

**Cause** : la migration existe en local depuis le commit `d89a5e1` (17:59:15) mais n'a jamais été poussée vers la prod.

**Impact** :
- La table `call_sessions` n'a PAS les colonnes `engaged_at` ni `rdv_goal` en prod.
- L'API `api/_calls/http.js:175`, `:280` et `api/_calls/sessionsRead.js:101`, `:429` font tous des `.select("...engaged_at, rdv_goal")`. PostgREST renvoie une erreur ou la colonne est absente du résultat → tous les reads/write de sessions échouent silencieusement côté frontend.
- Conséquence : ta "redirection figée après création séance" — `data.session.engaged_at` est `undefined` au lieu de `null`, donc `shouldShowPreSession()` (src/apps/calls/sessionLifecycle.ts:12) retourne `false` parce que `undefined !== null`, et le code tombe sur `setView("sessions")` au lieu de `setView("pre-session")`.

**Fix** : marquer manuellement les migrations distantes timestamps comme `reverted` dans l'historique, puis `db push --linked --include-all`. **NOTE** : l'opération est destructive (modifie la table `_supabase_migrations`). À faire avec une fenêtre de maintenance ou après un backup logique.

### 3.3 Héritage divergent — état historique

La prod a eu 25 migrations timestamps (`20260710020943`, `20260710020954`, etc.) qui ont toutes été "reverted" dans `_supabase_migrations` par un ancien run de `db pull`. Ces timestamps ne correspondent à aucun fichier local. Action : demander à Supabase de fournir les SQL originaux ou faire un `db pull` après que les migrations locales soient alignées, pour récupérer le schéma actuel dans le repo.

---

## 4. Code health — `src/apps/calls/`

### F001 — Classes CSS orphelines (le bordel que tu vois)

**Symptôme** : la modale pré-séance a un rendu incohérent (glassmorphisme partiel, layout qui se superpose).

**Cause** :
- `src/apps/calls/calls.css` (4681 lignes) définit **58 classes** `.calls-pre-session*`
- `src/apps/calls/PreSessionFlow.tsx` (294 lignes) n'en utilise que **28**
- **~30 classes CSS orphelines** (jamais rendues par le TSX actuel), vestige de 2 refontes parallèles non fusionnées :
  - `.calls-pre-session__rail`, `.calls-pre-session__phases`, `.calls-pre-session__phase--done`, `.calls-pre-session__phase--active` → **le stepper 3 étapes est dans le CSS mais PAS dans le TSX**
  - `.calls-pre-session__underlay` → la "vraie" sous-couche glassmorphisme existe mais n'est pas wrappée
  - `.calls-pre-session__stage`, `.calls-pre-session__stage-kicker` → variants "stage" jamais utilisés
  - `.calls-pre-session__objective-picker`, `.calls-pre-session__objective-label` → ancien layout d'objectif

**Impact** : 
- Le stepper que tu vois sur l'écran n'est PAS celui des 3 phases promises — c'est un H2 géant "Aujourd'hui, tu appelles" + une grille 2 colonnes (briefing-head + briefing-grid)
- Le glassmorphisme fonctionne pour le fond du panel (`.calls-modal__panel` ligne 537 a `backdrop-filter: blur(28px) !important`) mais l'inner ne suit pas → tu vois le cockpit au travers
- Les animations "stage forward/backward" du CSS (lignes ~700) ne sont jamais déclenchées par le TSX

**Action** : **refondre le TSX pour utiliser UNIQUEMENT les classes CSS du wizard 3 phases** (rail/phases/phase), supprimer les classes orphelines du CSS (~30 classes), tester le rendu.

### F002 — Pre-session n'utilise pas le focus management attendu

**Symptôme** : `useComboOverlay` (focus trap + Escape handling) est importé et appelé ligne 62, mais le reste du focus management est dispersé entre `panelRef`, `phaseTitleRef`, `previousPhaseRef`.

**Cause** : `src/apps/calls/PreSessionFlow.tsx:62` appelle `useComboOverlay(true, panelRef, onCancel)` + lignes 82-90 gèrent `previousPhaseRef.current === phase` pour refocus. **3 refs différents pour gérer le focus** est probablement sur-ingénieré.

**Impact** : focus peut sauter entre phases, surtout pour les utilisateurs clavier/lecteur d'écran.

**Action** : centraliser la gestion du focus dans `useComboOverlay` (étendre le hook si nécessaire) ou dans une seule ref `panelRef` qui prend tout en charge. Réduire à 1 ref au lieu de 3.

### F003 — Pas d'animation directionnelle entre phases

**Symptôme** : passage `briefing → activation` brutal (pas de slide/fade).

**Cause** : `calls.css:557` définit `.calls-pre-session--handoff` (animation au moment du launch, pas entre phases). Pas d'animation pour les transitions de phase dans le CSS actuel utilisé par le TSX.

**Impact** : UX dégradée — l'utilisateur ne sent pas la progression entre les 2 étapes.

**Action** : ajouter une animation de transition `briefing ↔ activation` (slide horizontal 200ms ou fade court) en utilisant `key={phase}` sur le wrapper pour forcer React à remonter le composant.

### F004 — `useCallback` / `useRef` / `useMemo` import inutilisés ou redondants

`PreSessionFlow.tsx` importe `useCallback, useEffect, useMemo, useRef, useState` mais utilise seulement `useEffect, useMemo, useState` + 4 refs explicites. `useCallback` est importé mais utilisé 1 fois (launch). Imports propres mais `useRef` x4 pourrait être simplifié (voir F002).

**Action** : après refonte F001/F002, nettoyer les imports.

### F005 — `ts-prune` / code mort potentiel

`ts-prune` n'a pas été exécuté (pas installé). Mais la grep rapide montre :
- `src/apps/calls/comboOverlay.ts` (et son usage `useComboOverlay`) — vérifier que le hook est utilisé ailleurs que dans PreSessionFlow
- `src/apps/calls/sessionLifecycle.ts` — exporte `shouldShowPreSession`, `sessionDayKey`, `isStaleSession` ; à grep tous les usages

---

## 5. Code health — autres modules

### G001 — `src/components/ui/Select.tsx` importé 1 seule fois

**Symptôme** : `Select` n'est utilisé que par 1 fichier.

**Cause** : pas un problème en soi (composant UI réutilisable), mais à vérifier qu'il n'a pas été créé pour un besoin supprimé.

**Action** : grep les usages, confirmer que c'est intentionnel (probable — composant UI atomique).

### G002 — Lint warnings `react-refresh/only-export-components` (19)

**Symptôme** : 19 warnings ESLint, tous sur des fichiers qui mélangent composants + constantes/fonctions exportées.

**Cause** : `react-refresh` (Vite HMR) ne peut pas rafraîchir un module qui exporte à la fois un composant et autre chose (constante, hook, util). 12 fichiers concernés, dont `CallManagerApp.tsx`, `PilotageView.tsx`, `RunnerView.tsx`, `WeeklyApp.tsx`, `ControlCenter.tsx`, `FloatingReactions.tsx`.

**Impact** : HMR dégradé — modifications peuvent forcer un full reload au lieu d'un module swap rapide.

**Action** : extraire les constantes/fonctions non-composant dans des fichiers `.ts` séparés (ex: `CallManagerApp.types.ts`, `CallManagerApp.constants.ts`). P1, pas bloquant.

### G003 — Pas de TODO/FIXME/HACK

**Bonne nouvelle** : 0 TODO/FIXME/XXX/HACK dans `src/`. Code propre.

### G004 — Fichiers sans tests

Plusieurs fichiers sans test : `src/auth/useSession.ts`, `src/crm/secteurValues.ts`, `src/components/BootScreen.tsx`, `src/os/Dock.tsx`, etc. Pour la plupart ce sont des composants UI ou des hooks simples — acceptable mais à prioriser si on y touche.

---

## 6. Tests & lint

- **828 tests passent** (96 fichiers), aucun fail, aucun skipped
- **Lint** : 0 erreur, 19 warnings (G002)
- **Build** : OK

---

## 7. Sécurité

- **Aucun secret en clair** trouvé dans le repo (grep `BEGIN.*PRIVATE KEY`, `sk_live`, `Bearer eyJ` → 0 résultats)
- `.env.local` et `.env.vercel` ont les valeurs vides (sanitisés par le système)
- `029_lock_rls_service_role_tables.sql` est appliqué → l'accès PostgREST direct aux tables `call_sessions`, `call_session_contacts`, `call_session_members`, `call_target_presets`, `perf_*`, `recette_journal` est bloqué. **Bonne nouvelle côté sécurité.**

---

## 8. Plan de nettoyage priorisé

### P0 — Bloquant, à faire maintenant

1. **Appliquer la migration `030_combo_pre_session_engagement.sql` en prod** — marquer les timestamps distants comme `reverted`, puis `supabase db push --linked --include-all`. Bloque tout le flow pré-séance. **Estimation : 30 min,risque modéré.**

2. **Refondre `PreSessionFlow.tsx` pour utiliser les classes CSS wizard 3 phases** (rail/phases/phase/stage) — supprime 30 classes orphelines du CSS, fixe le rendu, fixe l'UX. **Estimation : 2-3h (Codex worker), risque modéré (refonte UI).**

### P1 — Cette semaine

3. **Supprimer les branches remote obsolètes** (10+ dans la liste §2.3) et la locale `worktree-fix-refresh-architecture` qui pointe sur `gone`. `git fetch --prune origin` puis suppression manuelle. **Estimation : 15 min, risque faible.**

4. **Nettoyer les worktrees parasites** : supprimer `.worktrees/c27-routing-repro` (aligné sur main) et vérifier `.worktrees/c18-create-routing` (SHA 58153c4, divergé). **Estimation : 15 min.**

5. **Centraliser le focus management** dans `useComboOverlay` (F002). **Estimation : 1h.**

### P2 — Quand on y touche

6. **Lint warnings** (G002) — extraire les constantes, ~30 min de refactor par module touché. **Estimation : 2-3h total.**

7. **Aligner l'historique des migrations Supabase** (récupérer les SQL des timestamps distants via `db pull` une fois les migrations locales alignées, ou via support Supabase). **Estimation : 1h + délai support.**

8. **Audit des branches remote non mergées** (10+) pour identifier les fix perdus. **Estimation : 30 min.**

---

## Annexes

### A. Commandes exécutées (reproductibles)

```bash
git worktree list
git branch -vv
git branch -r --merged main
git branch --no-merged main
git log --oneline -15
supabase migration list --linked
supabase projects list

grep -c "^.calls-pre-session" src/apps/calls/calls.css
grep -oE "calls-pre-session[a-z_-]*" src/apps/calls/PreSessionFlow.tsx | sort -u
comm -23 /tmp/css_classes.txt /tmp/tsx_classes.txt

grep -rn "TODO\|FIXME\|XXX\|HACK" src/ --include="*.ts" --include="*.tsx" | wc -l
grep -c "!important" src/apps/calls/calls.css
npm run lint
npm run test
```

### B. Fichiers clés référencés

- `src/apps/calls/PreSessionFlow.tsx` — composant actuel (294 lignes, 2 phases)
- `src/apps/calls/calls.css` — feuille de style (4681 lignes, 95 classes `.calls-pre-session*`)
- `src/apps/calls/CallManagerApp.tsx` — machine à états principale
- `src/apps/calls/sessionLifecycle.ts` — helpers `shouldShowPreSession`, `sessionDayKey`
- `api/_calls/http.js` — API `create_session`, `update_session`, `get_session` (référencent `engaged_at`, `rdv_goal`)
- `supabase/migrations/030_combo_pre_session_engagement.sql` — migration NON appliquée