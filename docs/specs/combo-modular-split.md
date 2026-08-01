# Lot 3a — Découpage Combo : shell + modules

## Objectif

Restructurer `src/apps/calls/` (99 fichiers, 25.6K LOC, 0 sous-dossiers) en une architecture modulaire mirror du pattern Labo (`src/apps/cleaner/`). **Aucune logique modifiée** — déplacement de fichiers + mise à jour des imports uniquement.

## Périmètre

**Fichiers autorisés** : tout sous `src/apps/calls/`. Aucun fichier hors de ce dossier.

## Structure cible

```
src/apps/calls/
├── CallManagerApp.tsx          ← reste à la racine (entry point, comme CleanerApp.tsx)
├── api.ts                      ← reste à la racine (client API partagé)
├── types.ts                    ← reste à la racine (types partagés)
├── calls.css                   ← reste à la racine
├── accountOwners.ts            ← reste à la racine (shared)
├── callerTracking.ts           ← reste à la racine (shared)
├── audienceBinPacking.ts      ← reste à la racine (shared)
├── selection.ts               ← reste à la racine (shared)
├── FilterBuilder.tsx           ← reste à la racine (shared)
├── filterControls.tsx          ← reste à la racine (shared)
├── filterControls.helpers.ts   ← reste à la racine (shared)
├── formControls.tsx            ← reste à la racine (shared)
├── formControls.helpers.ts     ← reste à la racine (shared)
├── noteTemplates.tsx           ← reste à la racine (shared)
├── noteTemplates.helpers.ts    ← reste à la racine (shared)
├── EmptyState.tsx              ← reste à la racine (shared)
├── ProgressBar.tsx             ← reste à la racine (shared)
├── ConfirmDialog.tsx           ← reste à la racine (shared)
├── ContextSideSkeleton.tsx     ← reste à la racine (shared)
├── DedupBanner.tsx             ← reste à la racine (shared)
├── BrandLinks.tsx              ← reste à la racine (shared)
├── ResultButtons.tsx           ← reste à la racine (shared)
├── EventPanel.tsx              ← reste à la racine (shared)
├── AccountSearchView.tsx       ← reste à la racine (shared)
├── CommandBar.tsx              ← reste à la racine (shared)
├── AccountSearchView.test.tsx  ← reste (test shared)
├── api.test.ts                 ← reste (test shared)
├── audienceBinPacking.test.ts  ← reste
├── selection.test.ts           ← reste
├── noteTemplates.test.tsx      ← reste
│
├── shell/
│   └── CallManagerShell.tsx    ← NOUVEAU (optionnel — si CallManagerApp.tsx > 1500 LOC après
│                                  extraction, extraire le shell de navigation. Sinon, skip.)
│
├── modules/
│   ├── runner/
│   │   ├── RunnerView.tsx
│   │   ├── RunnerView.types.ts
│   │   ├── runnerContext.ts
│   │   ├── PreSessionFlow.tsx
│   │   ├── RecapView.tsx
│   │   ├── RolloverDecisionView.tsx
│   │   ├── dialerLogQueue.ts
│   │   ├── runnerContext.test.ts
│   │   ├── dialerLogQueue.test.ts
│   │   ├── PreSessionFlow.test.tsx
│   │   ├── RecapView.test.tsx
│   │   ├── RolloverDecisionView.test.tsx
│   │   ├── RunnerView.nudgeToast.test.tsx
│   │   └── RunnerView.transition.test.tsx
│   │
│   ├── sessions/
│   │   ├── NewSessionView.tsx
│   │   ├── SessionsView.tsx
│   │   ├── ShareSessionPanel.tsx
│   │   ├── sessionLifecycle.ts
│   │   ├── sessionNaming.ts
│   │   ├── NewSessionView.test.tsx
│   │   ├── sessionLifecycle.test.ts
│   │   └── sessionNaming.test.ts
│   │
│   ├── pilotage/
│   │   ├── PilotageView.tsx
│   │   ├── PilotageHeatmap.tsx
│   │   ├── CallFunnelCard.tsx
│   │   ├── CallFunnelCard.helpers.ts
│   │   ├── pilotageApi.ts
│   │   ├── pilotageHeatmapLayout.ts
│   │   ├── pilotageKpis.ts
│   │   ├── pilotage.css
│   │   ├── pilotageHeatmapLayout.test.ts
│   │   └── pilotageKpis.test.ts
│   │
│   ├── gamification/
│   │   ├── comboXp.ts
│   │   ├── comboBadges.ts
│   │   ├── comboStreaks.ts
│   │   ├── comboEvents.ts
│   │   ├── comboKeyboard.ts
│   │   ├── comboOverlay.ts
│   │   ├── comboSounds.ts
│   │   ├── comboSoundPrefs.ts
│   │   ├── nudgeLearning.ts
│   │   ├── rdvCelebrate.ts
│   │   ├── ComboOnboardingDemo.tsx
│   │   ├── ComboSoundSettings.tsx
│   │   ├── RdvConfetti.tsx
│   │   ├── MyTrophies.tsx
│   │   ├── comboXp.test.ts
│   │   ├── comboBadges.test.ts
│   │   ├── comboStreaks.test.ts
│   │   ├── comboEvents.test.ts
│   │   ├── comboKeyboard.test.ts
│   │   ├── comboSoundPrefs.test.ts
│   │   ├── nudgeLearning.test.ts
│   │   ├── rdvCelebrate.test.ts
│   │   ├── MyTrophies.test.tsx
│   │   └── CommandBar.test.tsx   ← CommandBar est le HUD gamification, son test va ici
│   │
│   └── rdv/
│       ├── RdvSuiviView.tsx
│       ├── RdvStatusPanel.tsx
│       ├── RecallFields.tsx
│       ├── RecallFields.helpers.ts
│       ├── rdvSubjects.ts
│       ├── recallQueue.ts
│       ├── rdvSuivi.css
│       ├── rdvSubjects.test.ts
│       └── recallQueue.test.ts
```

## Règles

1. **`git mv`** pour chaque déplacement — préserve l'historique.
2. **Mettre à jour tous les imports** :
   - Imports entre fichiers déplacés : `./RunnerView` → `./modules/runner/RunnerView`
   - Imports depuis les fichiers restés à la racine : inchangés si le fichier est à la racine
   - Imports depuis l'extérieur (`../../components/ui`, `../../lib/...`) : inchangés (la profondeur relative ne change pas, `modules/runner/` est toujours sous `src/apps/calls/`)
   - Imports CSS : mettre à jour les chemins si nécessaire
3. **Ne modifier AUCUNE logique** — pas de refactor, pas de renommage, pas de suppression de code.
4. **CommandBar.tsx reste à la racine** (utilisé par CallManagerApp directement), mais son test va dans `modules/gamification/` car il teste principalement le HUD gamification. Si le test importe CommandBar depuis `../`, adapter l'import.
5. Les fichiers `.test.*` suivent leur fichier source dans le module correspondant.
6. `CallManagerApp.tsx` reste à la racine et importe depuis `./modules/runner/RunnerView` etc.

## Imports — schéma de profondeur

Les fichiers dans `modules/runner/` sont à `src/apps/calls/modules/runner/`.
Pour importer un fichier resté à la racine de `calls/` : `../../FilterBuilder`.
Pour importer un composant UI global : `../../../components/ui` (3 niveaux : runner → modules → calls → apps → src).

Vérifier chaque import avec `npx tsc --noEmit` après les déplacements.

## Gate QC (bloquant)

1. `npx tsc --noEmit` sans erreur.
2. `npm run lint` sans erreur (warnings OK).
3. `npm run test` — **tous les tests existants passent sans modification d'assertion**.
4. `npm run build` sans erreur.
5. `git diff --stat` : aucun fichier hors `src/apps/calls/` modifié.
6. Aucun fichier ne dépasse 1500 LOC (RunnerView reste à 3070 — c'est le lot 3b qui le décomposera).

## Ce qui n'est PAS dans ce lot

- Décomposition de RunnerView.tsx (3070 lignes) → lot 3b.
- Extraction de CallManagerShell → optionnel, seulement si CallManagerApp reste ingérable après le move.
- Changement de logique, de nommage ou de comportement.
