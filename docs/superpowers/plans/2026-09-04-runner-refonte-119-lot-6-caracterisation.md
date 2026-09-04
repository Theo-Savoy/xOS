# Runner Combo — lot 6 caractérisation et filet de sécurité Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturer le comportement legacy du runner Combo avant la migration, avec des tests déterministes métier, des fixtures Playwright responsive/a11y et une matrice documentaire, sans modifier la production ni les fichiers chauds.

**Architecture:** Les tests d’intégration Vitest piloteront `CallManagerApp` avec un faux bridge Supabase et un routeur `fetch` local, tandis que les tests ciblés de `RunnerView`, `PowerStrip`, `runnerContext` et `dialerLogQueue` conserveront les contrats de surface et de clavier. Les scénarios Playwright utiliseront un helper réseau commun pour les états réellement atteignables et une fixture DOM déterministe pour les états Power wave/conversation impossibles à stabiliser sans Telnyx réel ; chaque scénario sera capturé aux largeurs contractuelles et avec hauteurs contraintes.

**Tech Stack:** Vitest 4 + Testing Library React, Playwright 1.61, TypeScript, fixtures JSON/DOM locales, Markdown.

## Global Constraints

- Lire `docs/runner-refonte-119-plan.md` intégralement avant toute édition — fait avant ce plan.
- Écrire uniquement des tests, fixtures et docs ; aucune modification de production.
- Ne jamais toucher `RunnerView.tsx`, `CallManagerApp.tsx`, `calls.css`, `calls-dialer.css`, `PowerStrip.tsx`, `ContactCardPanel.tsx`.
- Conserver la branche `runner-refonte-luna-lots` et ne pas ajouter de dépendance.
- Couvrir I1–I15 et distinguer dans la documentation les invariants verts des défauts connus attendus avant migration.
- Exécuter `npm run test`, puis `npm run lint`, puis `npm run build` après le dernier changement.
- Commiter chaque livrable avec `git add -A` et un message conventionnel.

---

### Task 1: Fixtures Vitest et caractérisation métier du runner legacy

**Files:**
- Create: `src/apps/calls/modules/runner/runnerCharacterizationFixtures.ts`
- Create: `src/apps/calls/modules/runner/RunnerView.characterization.test.tsx`
- Create: `src/apps/calls/CallManagerApp.characterization.test.tsx`
- Test: `src/apps/calls/modules/runner/dialerLogQueue.test.ts`
- Test: `src/apps/calls/modules/runner/runnerContext.test.ts`

**Interfaces:**
- Consumes: `CallManagerApp`, `RunnerView`, `PowerStrip` callbacks, `createDialerLogQueue`, `resolveContextContactId`, `pendingContactsAhead`.
- Produces: builders `makeContact`, `makeSession`, `makeContext`, `makeHubPayload`, plus tests nommés pour FIFO, rollback, claims, contexte, RDV, bulk, rappels/NPA, partage et exclusivité focus/bulk.

- [x] **Step 1: Écrire les builders de fixture et un harness de fetch minimal.**

  Les builders devront produire des `SessionContact` complètes avec des valeurs par défaut stables, accepter un `Partial<SessionContact>`, et éviter tout appel réseau réel. Le harness de test devra distinguer les GET hub/session/context et les POST par `action`.

- [x] **Step 2: Écrire les tests rouges des comportements attendus et défauts connus.**

  Les tests couvriront notamment : queue FIFO après deux soumissions rapides, restauration du snapshot sur rejet `log_call`, claim unique avec succès puis claim concurrent `contact_claimed`, contexte courant + trois suivants préchargés, transaction `log_call` puis `log_event`, vagues de 4 avec échec partiel, presets rapides/date et NPA, contact partagé exclu du pool et affiché comme pris, raccourcis ignorés dans les champs et pendant le bulk, et garde `L` pendant conversation Power. Les trois défauts explicitement listés par le contrat (sortie directe pendant vague, `L` capturé avant la conversation et runner `aria-hidden` réactif sous pré-session), plus l’exclusion `F` du bulk, sont marqués `it.fails` dans les tests concernés, avec un commentaire expliquant la migration qui doit les faire passer.

- [x] **Step 3: Exécuter uniquement les nouveaux tests pour confirmer les rouges légitimes.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/RunnerView.characterization.test.tsx src/apps/calls/CallManagerApp.characterization.test.tsx`

  Expected: les assertions de comportement legacy passent ; les trois gardes `RunnerView` (sortie pendant vague, `L` pendant conversation et `F` dans bulk) et le garde pré-session `CallManagerApp` sont les seuls échecs attendus via `it.fails` dans ce sous-ensemble.

- [x] **Step 4: Stabiliser les fixtures sans production code.**

  Corriger les données de test, les attentes ou les mocks lorsqu’un échec vient d’un sélecteur ou d’un scénario mal isolé. Aucun changement ne doit être fait dans les six fichiers chauds.

- [x] **Step 5: Exécuter le sous-ensemble vert et vérifier les fichiers chauds.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/RunnerView.characterization.test.tsx src/apps/calls/CallManagerApp.characterization.test.tsx src/apps/calls/modules/runner/dialerLogQueue.test.ts src/apps/calls/modules/runner/runnerContext.test.ts`

  Expected: sortie Vitest à code 0 ; `git diff --name-only -- <six fichiers chauds>` ne retourne aucune ligne.

- [x] **Step 6: Committer le livrable de caractérisation métier.**

  Run: `git add -A && git commit -m "test(calls): characterize runner legacy behavior"`

### Task 2: Filet axe-like, reduced-motion, live regions et pré-session

**Files:**
- Create: `src/apps/calls/modules/runner/runnerA11y.test.tsx`
- Create: `src/apps/calls/runner-a11y.contract.test.ts`

**Interfaces:**
- Consumes: DOM rendu par `RunnerView`, `PreSessionFlow`, `EventPanel`, `PowerStrip`, plus les feuilles CSS existantes en lecture seule.
- Produces: contrôles sans nouvelle dépendance pour noms accessibles, ids dupliqués, éléments interactifs dans `aria-hidden`, live regions bornées et présence des règles reduced-motion ; les tests nomment explicitement les règles axe couvertes.

- [x] **Step 1: Écrire les assertions axe-like et live regions.**

  Le helper local analysera le DOM rendu (boutons/liens/champs, `aria-label`, `aria-live`, `role=status|alert`, ids uniques) et rejettera tout élément focusable situé sous `aria-hidden`. Il ne prétendra pas remplacer axe-core ; la documentation expliquera l’absence volontaire de dépendance et les règles couvertes.

- [x] **Step 2: Écrire le test reduced-motion.**

  Vérifier la présence de règles `@media (prefers-reduced-motion: reduce)` pour les transitions runner et Power, sans modifier les CSS chauds.

- [x] **Step 3: Écrire le garde pré-session.**

  Détecter que la surface runner ne doit pas rester clavier-active quand elle est sous le dialogue pré-session ; conserver un `it.fails` documentant l’état legacy actuel si le contrat n’est pas encore migré.

- [x] **Step 4: Exécuter le sous-ensemble a11y.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/runnerA11y.test.tsx src/apps/calls/runner-a11y.contract.test.ts`

  Expected: code 0, avec uniquement les défauts pré-migration attendus encapsulés par `it.fails`.

- [x] **Step 5: Committer le livrable a11y.**

  Run: `git add -A && git commit -m "test(calls): preserve runner accessibility guardrails"`

### Task 3: Fixtures Playwright responsive et captures d’états

**Files:**
- Create: `e2e/fixtures/runnerStates.ts`
- Create: `e2e/runner-responsive.spec.ts`
- Create: `e2e/runner-a11y.spec.ts`
- Modify: `e2e/helpers/auth.ts` only if a shared route helper is required; keep it test-only.

**Interfaces:**
- Consumes: `mockAuthenticatedSession`, Playwright `Page`, the current Combo session route contract, and inline fixture markup/classes matching the runner states.
- Produces: `RUNNER_WIDTHS = [320, 500, 719, 720, 899, 900, 1200]`, constrained heights, scenarios standard/bulk/Power off/ready/wave/conversation, stable screenshot names, and a page-level a11y smoke helper.

- [x] **Step 1: Écrire la fixture DOM déterministe et ses états.**

  `runnerStates.ts` exposera une fonction `runnerStateMarkup(state)` pour `standard`, `bulk`, `power-off`, `power-ready`, `power-wave`, `power-conversation`, avec une racine `.calls-app` et les classes réelles nécessaires aux container queries. Les états wave/conversation seront purement déterministes et explicitement signalés comme fixture visuelle, sans simuler Telnyx.

- [x] **Step 2: Écrire le test responsive rouge.**

  Pour chaque largeur et état, appeler `page.setViewportSize`, charger le markup, vérifier les invariants de layout observables (colonnes/overflow/rail replié/CTA visible) et appeler `expect(locator).toHaveScreenshot` avec un nom incluant état, largeur et hauteur.

- [x] **Step 3: Générer les captures avec le même environnement.**

  Run: `npx playwright test e2e/runner-responsive.spec.ts --update-snapshots`

  Expected: les PNG sont créés sous `e2e/baselines/` avec le préfixe `runner-` ; relancer sans `--update-snapshots` doit comparer les captures.

- [x] **Step 4: Ajouter le smoke a11y/reduced-motion Playwright.**

  Émuler `prefers-reduced-motion: reduce`, vérifier l’attribut `data-reduced-motion`, l’absence d’éléments focusables dans les régions `aria-hidden`, les noms des CTA et les live regions ; conserver les mêmes sept largeurs.

- [x] **Step 5: Exécuter le sous-ensemble Playwright.**

  Run: `npx playwright test e2e/runner-responsive.spec.ts e2e/runner-a11y.spec.ts`

  Expected: code 0, toutes les captures déjà présentes et aucune erreur console/page.

- [x] **Step 6: Committer le livrable Playwright.**

  Run: `git add -A && git commit -m "test(e2e): add runner responsive state fixtures"`

### Task 4: Documentation des résultats et matrice

**Files:**
- Create: `docs/CARACTERISATION.md`
- Create: `docs/MATRICE-RESPONSIVE.md`

**Interfaces:**
- Consumes: noms de tests, résultats des commandes, captures et défauts connus observés dans les tâches précédentes.
- Produces: une preuve traçable I1–I15, la distinction vert/attendu en échec, le protocole de reproduction et une matrice largeur × hauteur × état × capture.

- [x] **Step 1: Rédiger CARACTERISATION.md.**

  Documenter chaque invariant avec test(s), source observée, résultat, données de fixture, et limites. Indiquer explicitement les quatre `it.fails` pré-migration et le fait que les handlers réseau restent inchangés.

- [x] **Step 2: Rédiger MATRICE-RESPONSIVE.md.**

  Lister les largeurs `320/500/719/720/899/900/1200`, au moins les hauteurs `620` et `420`, chaque état majeur, les attentes de layout et le nom de capture correspondant.

- [x] **Step 3: Vérifier la documentation contre le dépôt.**

  Run: `rg -n "I1|I15|320|500|719|720|899|900|1200|power-conversation|reduced-motion" docs/CARACTERISATION.md docs/MATRICE-RESPONSIVE.md`

  Expected: chaque invariant et chaque largeur contractuelle apparaissent au moins une fois, sans promesse de migration déjà réalisée.

- [x] **Step 4: Committer le livrable documentaire.**

  Run: `git add -A && git commit -m "docs(calls): record runner characterization matrix"`

### Task 5: Gates finaux et contrôle de périmètre

**Files:**
- Verify: six fichiers chauds, `git status`, tous les tests/fixtures/docs créés.

- [x] **Step 1: Vérifier qu’aucun fichier chaud n’a changé.**

  Run: `git diff --name-only origin/main...HEAD -- src/apps/calls/modules/runner/RunnerView.tsx src/apps/calls/CallManagerApp.tsx src/apps/calls/calls.css src/apps/calls/calls-dialer.css src/apps/calls/modules/runner/PowerStrip.tsx src/apps/calls/modules/runner/ContactCardPanel.tsx`

  Expected: sortie vide.

- [x] **Step 2: Exécuter les gates dans l’ordre demandé.**

  Run: `npm run test`

  Expected: code 0, zéro fichier/test en échec normal et quatre `it.fails` attendus, explicitement documentés.

  Run: `npm run lint`

  Expected: code 0 et zéro erreur ESLint.

  Run: `npm run build`

  Expected: code 0, `tsc --noEmit` puis build Vite terminés.

- [x] **Step 3: Vérifier les commits et le statut final.**

  Run: `git log --oneline --decorate -6` puis `git status --short --branch`

  Expected: les commits conventionnels des livrables sont présents, aucun changement non commité utile ne subsiste, et la branche est `runner-refonte-luna-lots`.

## Self-review against the contract

- I1–I8 : couverts par les tests intégration et les fixtures queue/context.
- I9–I13 : couverts par les tests Power, le garde de projection et le garde pré-session ; les défauts actuels sont explicitement attendus tant qu’aucune production n’est modifiée.
- I14–I15 : couverts par les tests reduced-motion, live regions, champs/overlays et raccourcis.
- Responsive : sept largeurs exactes, deux hauteurs contraintes, six états de capture.
- Interdits : aucune production, aucune dépendance, aucun fichier chaud.
