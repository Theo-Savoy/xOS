# Audit consolidation — 2026-07-17

**Objectif** : valider le chantier « mutualisation des composants » avant de continuer à construire.
**Périmètre** : architecture, vivier UI, code mort, duplications, organisation/commentaires.
**Méthode** : lecture directe + métriques shell (annexe B), `ts-prune`, croisement CSS↔TSX. Read-only.
**HEAD** : `9e836e7` (830 tests verts, lint 0 warning).

---

## 1. TL;DR — verdict

**Le chantier mutualisation est validé, et il est bien ciblé.** Le vivier existe déjà (`src/components/ui` : 6 composants propres, focus trap, a11y) mais il est **sous-utilisé** : les apps ont posé **134 `<button>` natifs** stylés à la main à côté de lui. Le vrai problème n'est pas l'absence de vivier, c'est qu'il est trop maigre pour couvrir les besoins réels — donc chaque app improvise. Le plan : l'engraisser avec ce que les apps ont déjà inventé en triple, puis interdire l'improvisation.

Les 5 chiffres qui résument :

| Constat | Mesure |
|---|---|
| Boutons natifs improvisés dans les apps | **134** (calls 68, cleaner 41, os 25) vs `Button` partagé utilisé dans 23 fichiers |
| Systèmes CSS parallèles | calls **428 classes** + pilotage 85, cleaner **166**, weekly **154**, ui partagé… **29** |
| Clients HTTP réinventés | **12 fichiers** construisent le header `Authorization: Bearer` à la main |
| CSS orphelin (borne haute) | **~104 classes** jamais référencées (41 calls, 33 cleaner, 23 weekly, 7 pilotage) |
| Code TS mort confirmé | ~15 exports (RdvGoalPicker, rdvCelebrate, APP_ICONS…) + `api/__pycache__` |

---

## 2. Architecture — état des lieux

### 2.1 Cartographie (LOC hors node_modules)

```
src/apps/calls    21 752 lignes / 75 fichiers   ← 44 % du front
src/apps/cleaner  10 676 / 52
src/apps/weekly    4 070 / 5   ← 5 fichiers seulement, dont un de 2 010 lignes
src/apps/hub       1 161 / 5
src/apps/demo        204 / 3   (dev-only, gated par import.meta.env.DEV — OK)
src/os             6 636 / 35
src/components     1 552 / 15  ← le vivier
api               20 119 / 76  (_calls, _cleaner, _crm, _weekly, _config)
```

### 2.2 Ce qui est sain (à préserver)

- **Séparation nette** `apps / os / components / api` avec un `registry.tsx` central : lazy loading par app, tailles par défaut, **gating par rôle** (hub réservé manager/admin) et apps démo exclues de prod.
- **API par domaine** (`api/_calls`, `_cleaner`, `_crm`, `_weekly`) avec helpers testés (`http.js`, `sessionsRead/Write`). 830 tests, lint 0.
- `components/ui/Modal` est **le meilleur modal du repo** (portal, focus trap, Escape, restauration du focus)… et il n'est utilisé qu'une fois.

### 2.3 Les points durs

1. **Fichiers monstres** — le top 5 hors CSS :
   - `RunnerView.tsx` **2 261** lignes (vue + formulaires + raccourcis + helpers)
   - `WeeklyApp.tsx` **2 010** lignes (l'app entière dans un fichier : fetch, 3 tooltips de chart, Skeleton local, state)
   - `CallManagerApp.tsx` **1 685** lignes — god-component : routing (vu avec le bug params d'hier), fetch, state de 8 vues, rollover
   - `api/perf.js` **1 638** lignes
   - `calls.css` **4 409** lignes
2. **Deux conventions d'app** : cleaner a sa propre architecture interne (`shell/CleanerShell` + `moduleRegistry` + manifests par module) — un mini-xOS dans xOS — pendant que calls/weekly sont monolithiques. Ni l'un ni l'autre n'est faux, mais il faut choisir le pattern de référence avant de construire la prochaine app.
3. **Warning build réel** : `RecettesModule` importé statiquement par `CleanerShell` ET dynamiquement par son manifest → le code-splitting du module recettes est inopérant (`INEFFECTIVE_DYNAMIC_IMPORT` à chaque build).

---

## 3. Le vivier UI — validation du chantier

### 3.1 L'existant (`src/components/ui`)

`Button` (2 variants), `GlassCard`, `Tag`, `Select` (single/multi), `Checkbox`, `Modal` — 29 classes CSS, une page catalogue `ui-demo` (« Design system ») déjà branchée dans le launcher en dev. **La fondation est bonne.**

### 3.2 Adoption réelle par app

| App | Button | GlassCard | Tag | `<button>` natifs | `<input>` natifs |
|---|---|---|---|---|---|
| calls | 15 fichiers | 17 | 10 | **68** | 35 |
| cleaner | 3 | 3 | 3 | **41** | 5 |
| weekly | 1 | 1 | 1 | 1 | 0 |
| os | 1 | 1 | 1 | **25** | 6 |

Lecture : calls utilise le vivier **et** improvise massivement à côté (13 classes `.calls-*btn*` custom). weekly n'improvise pas de boutons mais a réécrit tout le reste (154 classes CSS, tooltips, skeleton). os improvise pour le dock/launcher/control center.

### 3.3 Les réinventions à rapatrier (le vivier cible)

C'est la liste concrète de ce que les apps ont déjà payé 2-3 fois et qui doit monter dans `components/ui` :

1. **Boutons** : variants manquants (`ghost`, `danger`, `icon-only`, tailles) — c'est *parce que* Button n'a que primary/secondary que les 134 natifs existent.
2. **Modal/overlay** : 3 implémentations — `ui/Modal` (portal, complet), `calls-modal` + `useComboOverlay` (maison, plein écran glass), `ScoreHelpModal` (cleaner, inline). → un seul Modal avec variant `glass`/plein écran, `useComboOverlay` fusionné dedans.
3. **Pickers** (`calls/formControls.tsx`) : `DatePicker`, `SessionTypePicker`, `ChipGroup` (filterControls) — génériques à 90 %, seuls les libellés sont métier.
4. **Chips / segmented control** : `ChipGroup` (calls), `ReasonChips` (cleaner), chips d'objectif du wizard — même pattern, 3 CSS.
5. **EmptyState** : composant dans calls + classes `*empty*` réécrites dans les 4 feuilles.
6. **Skeleton / loading** : `ContextSideSkeleton` (calls), `Skeleton` (weekly), classes `--loading` (cleaner).
7. **ProgressBar** : local à calls, utilisable partout (hub l'imiterait pour les objectifs).
8. **Client HTTP authentifié** : 12 fichiers fabriquent le header Bearer (calls/api.ts a le seul `apiFetch<T>` typé ; hub, weekly, os/Launcher, notifications font du fetch nu). → `src/lib/apiClient.ts` unique (auth, gestion d'erreur, typage JSON).
9. **Helpers dates Paris** : `todayParisIso`/`formatIsoDateFr` vivent dans `calls/formControls.helpers.ts` et sont réimplémentés dans weekly, cleaner et 3 fichiers d'api (`todayParisDate` côté serveur). → `src/lib/dates.ts` + miroir `api/_lib/dates.js`. C'est aussi une **classe de bugs** connue (épisodes timezone).
10. **Tokens de design** : `theme.css` est maigre ; les feuilles d'app compensent avec **162 rgba/hex codés en dur** (calls 99, cleaner 47, weekly 16). → enrichir la palette `--xos-*` (surfaces, glass, borders, radius, sémantique danger/success) pour que les composants mutualisés aient un socle.

---

## 4. Code mort

### 4.1 Exports TS confirmés morts (0 usage hors export/test)

- `calls/formControls.tsx` : **`RdvGoalPicker`** (remplacé par les chips du wizard pré-séance)
- `calls/rdvCelebrate.ts` : `readRdvGoal`, `writeRdvGoal`
- `calls/EventPanel.tsx` : type `EventDraft`
- `os/AppIcons.tsx` : `APP_ICONS`
- `cleaner/modules/opportunities/filterState.ts` : `OPPORTUNITY_PAGE_SIZE`
- `crm/index.ts` : ~8 constantes/types exportés sans consommateur (`SECTEUR_FAMILIES`, `PIPE_DECROCHE`, `RECALL_ELIGIBLE_RESULTATS`, …) — probablement des exports « au cas où » du barrel.

(`ts-prune` brut : 48 entrées, dont ~30 faux positifs de barrels `index.ts` — la liste ci-dessus est vérifiée à la main.)

### 4.2 CSS orphelin (borne haute, à confirmer classe par classe)

~104 classes définies jamais référencées : 41 calls, 33 cleaner, 23 weekly, 7 pilotage. Attention aux faux positifs de classes construites dynamiquement (`__phase--${state}`) — compter ~70-80 vraies mortes. Même famille que les 30 classes pré-séance purgées hier.

### 4.3 Divers

- **`api/__pycache__/`** : 2 `.pyc` de l'ère Python du dashboard — à supprimer (+ `.gitignore`).
- `scripts/*.py` : debug Salesforce assumé (déjà noté à l'audit santé), à laisser mais hors du bundle de toute façon.

---

## 5. Organisation & commentaires

- **Densité de commentaires : 0-2 %** partout. Le code est plutôt lisible et les rares commentaires sont les bons (intentions : gating de rôles dans registry, marqueur `null` vs `undefined` dans sessionLifecycle). Pas de dette majeure ici — la recommandation est une **règle d'or**, pas un rattrapage : commenter les invariants et les pièges (timezone, params round-trip…), jamais le « quoi ».
- **Langue** : FR pour le métier côté src, EN côté migrations/api — mix toléré, inutile de réécrire l'existant.
- **Nommage CSS** : BEM-ish préfixé par app (`calls-`, `cleaner-`, `xos-`) — cohérent. Les composants mutualisés gardent le préfixe `xos-`.
- Le pattern `.helpers.ts` (G002, hier) est le bon gabarit pour extraire sans casser le HMR.

---

## 6. Plan de consolidation priorisé

### Lot 1 — Fondations (≈ 1 jour, à faire avant tout nouveau dev)

1. **`src/lib/apiClient.ts`** : `apiFetch<T>` unique (Bearer, erreurs, JSON typé), calqué sur celui de calls. Migrer les 12 call-sites. *Vérifié par : grep « Authorization » = 1 seul fichier client.*
2. **`src/lib/dates.ts`** (+ `api/_lib/dates.js`) : `todayParisIso`, `formatIsoDateFr`, `parisDayKey`… *Vérifié par : plus d'`Intl.DateTimeFormat` hors lib.*
3. **Tokens** : enrichir `theme.css` (surfaces, glass, sémantique) — remplacement des rgba durs au fil de l'eau, pas de big-bang.

### Lot 2 — Le vivier (≈ 2-3 jours, mergeable app par app)

4. **Button v2** : variants `ghost`/`danger`/`icon`, tailles. Migration calls d'abord (68 occurrences), puis cleaner, os.
5. **Modal unifié** : fusionner `useComboOverlay` dans `ui/Modal` (variant plein écran glass), migrer `calls-modal` et `ScoreHelpModal`.
6. **Promouvoir dans `ui/`** : `EmptyState`, `Skeleton`, `ProgressBar`, `ChipGroup`→`SegmentedControl`, `DatePicker`.
7. **La page `ui-demo` devient le contrat** : tout composant mutualisé y figure avec ses variants ; on n'ajoute pas un composant au vivier sans sa vignette.
8. **Verrou anti-régression** : règle ESLint `no-restricted-syntax` interdisant `<button>` nu sous `src/apps/` (hors `components/ui`). C'est elle qui empêche le retour à l'improvisation.

### Lot 3 — Dégraissage (≈ ½ jour + fil de l'eau)

9. Supprimer les ~15 exports morts + `api/__pycache__`.
10. Purge CSS orpheline app par app (vérif manuelle des classes dynamiques avant chaque suppression).
11. **Règle du jeu** pour les monstres : pas de chantier dédié, mais tout dev qui touche `RunnerView`/`WeeklyApp`/`CallManagerApp` en extrait la partie qu'il modifie (le routing params de CallManagerApp est le premier candidat : hook `useComboNavigation`).
12. Corriger l'import statique/dynamique de `RecettesModule` (1 ligne dans `CleanerShell`) pour réactiver le code-splitting.

### Ce que je ne recommande PAS

- Réécrire les CSS d'app dans un framework (Tailwind & co) : le système BEM + tokens fonctionne, le problème est la duplication, pas la techno.
- Uniformiser de force cleaner sur le pattern monolithique (ou l'inverse) tant qu'aucune nouvelle app n'est en chantier — trancher au moment du prochain module.
- Un « design system » packagé séparément : `components/ui` + `ui-demo` suffisent à cette échelle.

---

## Annexe A — Chiffres bruts

- `<button>` natifs : calls 68 (15 fichiers), cleaner 41 (12), os 25 (5), weekly 1.
- `<input>` natifs : calls 35, os 6, cleaner 5.
- Classes CSS définies : calls 428 + pilotage 85, cleaner 166, weekly 154, ui 29, desktop 49.
- Classes bouton custom : calls 13, weekly 1, controlCenter 1.
- rgba/hex durs : calls 99, cleaner 47, weekly 16 (vs 318/211/133 usages de tokens).
- Header Authorization construit dans : calls/api, calls/pilotageApi, cleaner/opportunities/api (×3), cleaner/recettes/sectors/api, hub/HubApp (×3), hub/TargetsEditor (×2), weekly/WeeklyApp, auth/useSession, os/Desktop, os/Launcher (×5), os/notifications (×3), os/salesforceLink.

## Annexe B — Commandes reproductibles

```bash
# LOC par dossier
for d in src/apps/* src/os src/components api; do find $d \( -name '*.ts*' -o -name '*.js' -o -name '*.css' \) | xargs wc -l | tail -1; done

# Boutons natifs par app
grep -r '<button' src/apps/calls --include='*.tsx' | grep -v test | wc -l

# Exports morts
npx ts-prune -p tsconfig.json | grep -v "used in module"

# CSS orphelin (borne haute)
grep -oE '^\.[a-z][a-z0-9_-]+' src/apps/cleaner/cleaner.css | sed 's/^\.//' | sort -u \
  | while read c; do grep -rq "$c" src/apps/cleaner --include='*.tsx' || echo "$c"; done

# Header auth dupliqué
grep -rln "Authorization.*Bearer" src --include='*.ts*' | grep -v test
```
