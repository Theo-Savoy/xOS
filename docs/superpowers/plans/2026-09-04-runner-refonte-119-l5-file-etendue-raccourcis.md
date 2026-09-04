# Runner Combo — L5 file étendue et raccourcis V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à `SessionWorkspaceV2` une surface outil de file étendue avec bulk métier et les raccourcis V2, en conservant les handlers existants et le runner legacy intact.

**Architecture:** Le rail `SessionQueue` reste la navigation principale. Un `QueueToolOverlay` monté au-dessus du workspace porte recherche, filtres, sélection et formulaire bulk ; il ne change jamais un mode d’affichage et il est démonté/interdit pendant une conversation Power. La garde focus/bulk et la confirmation dirty vivent dans la surface V2, tandis qu’un hook clavier unique reçoit `active` et délègue les résultats/soumissions au workspace contact.

**Tech Stack:** React + TypeScript, Vitest 4 + Testing Library React, primitives UI XOS existantes, CSS container-scoped sous `.calls-workspace--v2`.

**Spec:** `docs/runner-refonte-119-plan.md` §§3–6, décisions D1/D2/D11.

## Global Constraints

- Lire `docs/runner-refonte-119-plan.md` intégralement avant toute édition — fait avant ce plan.
- Prod reste LEGACY : ne pas changer le flag par défaut ni modifier `RunnerView.tsx`.
- Les handlers réseau de `CallManagerApp` restent inchangés ; le V2 appelle seulement les callbacks déjà présents dans `SessionWorkspaceProps`.
- `useDialerPool` et `pool.js` restent intacts ; aucune requête/API dans les composants de présentation.
- `QueueToolOverlay` est une surface outil accessible depuis la file, jamais un second mode Liste, et il est interdit pendant `PowerUiState = conversation`.
- Focus contact et formulaire bulk sont mutuellement exclusifs ; un formulaire bulk dirty exige une confirmation UI avant changement de contact ou sortie de surface.
- Raccourcis V2 `L`, `F`, `1–5`, `⌘↵` désactivés dans `input`, `textarea`, `select`, `EventPanel`, modales, formulaire bulk et conversation Power ; le hook ne s’installe que lorsque `active=true`.
- Utiliser uniquement les primitives et tokens existants ; aucun `<select>`/`<input>` natif hors kit, aucun token fantôme, aucun nouveau CTA primaire concurrent.
- Les trois expected fail du dépôt restent inchangés : deux `RunnerView.characterization` et un quatrième `it.fails` legacy.
- Après chaque sous-lot : `npm run test`, puis `npm run lint`, puis `npm run build` ; committer avec `git add -A && git commit -m "..."`.

---

### Task 1: File étendue V2 et exclusivité focus/bulk (L5A)

**Files:**
- Create: `src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.tsx`
- Create: `src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/SessionQueue.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/types.ts`
- Modify: `src/apps/calls/calls-workspace-v2.css`

**Interfaces:**
- Consumes: `SessionContact`, `SessionSummary`, `LogPayload`, `DeferPayload`, `SessionWorkspaceProps`, `listStatusDisplay` et les primitives `Button`, `Checkbox`, `EmptyState`, `GlassCard`, `Tag`.
- Produces: `QueueToolOverlayProps`, `QueueToolOverlay` et un bouton d’ouverture du rail ; le composant expose une sélection contrôlée et signale `onRequestFocus(contactId)` afin que le parent applique la garde dirty.

- [ ] **Step 1: Écrire les tests rouges de la surface outil.**

  Vérifier avec `SessionWorkspaceV2` que le bouton d’ouverture rend un overlay portant `role="dialog"`/`aria-label`, que le rail reste la région de navigation, qu’aucun bouton `Liste`/`Fiche` n’apparaît, que la recherche réduit les lignes et que les filtres `Tous`/`À faire`/`Appelés`/`Non contactés` changent les résultats. Vérifier aussi que la sélection multiple ne déclenche aucun focus contact tant que l’overlay est actif.

- [ ] **Step 2: Exécuter uniquement les tests L5A pour constater l’échec attendu.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx`

  Expected: échec dû à l’absence de `QueueToolOverlay`/de son ouverture V2, sans erreur de syntaxe ni modification des tests legacy.

- [ ] **Step 3: Implémenter le composant minimal de file étendue.**

  Ajouter un overlay contrôlé par le parent, accessible depuis `SessionQueue`, avec recherche sur nom/poste/entreprise/email/téléphone, filtres de statut, sélection des contacts actionnables et bouton Tout sélectionner. Les lignes doivent afficher statut et claim ; un contact claimé par un autre agent doit être visible mais non actionnable. Quand `isPowerConversation` est vrai, ne pas monter l’overlay et désactiver son déclencheur.

- [ ] **Step 4: Implémenter la garde de focus/bulk.**

  Maintenir la sélection et l’état dirty du formulaire dans la surface V2. Tant que la sélection/formulaire bulk est actif, le clic sur une ligne du rail ne change pas le contact. Si le formulaire est dirty, afficher `ConfirmDialog` avant de fermer l’overlay ou d’accepter un nouveau contact ; Annuler conserve la note et Confirmer efface la sélection/formulaire puis applique le focus demandé.

- [ ] **Step 5: Ajouter les styles V2 et vérifier les invariants de structure.**

  Ajouter uniquement des sélecteurs descendants de `.calls-workspace--v2` pour l’overlay, ses filtres et son scroll. Réutiliser `--xos-space-*`, `--xos-radius-*`, les surfaces existantes et les container queries déjà établies ; ne pas ajouter de règle dans `calls.css` ou `calls-dialer.css`.

- [ ] **Step 6: Exécuter les tests L5A puis les trois gates.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.test.tsx`

  Expected: code 0 ; puis exécuter successivement `npm run test`, `npm run lint`, `npm run build` avec code 0 et les trois expected fail historiques seulement.

- [ ] **Step 7: Committer L5A.**

  Run: `git add -A && git commit -m "feat(calls): add V2 extended queue tool surface"`

### Task 2: Bulk métier, report, retrait et rappels (L5B)

**Files:**
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.tsx`
- Modify: `src/apps/calls/calls-workspace-v2.css`

**Interfaces:**
- Consumes: les callbacks existants `onLogMany`, `onDeferContacts`, `onRemoveContacts`, `onUpdateRecall`, les contacts/séances déjà reçus par V2 et `DatePicker`/`RecallFields`/`ConfirmDialog`.
- Produces: appels directs aux handlers existants avec `LogPayload`/`DeferPayload`, actions de rappel rapide/date, retrait protégé par claim et rendu de l’erreur partielle fournie par `error`.

- [ ] **Step 1: Écrire les tests rouges des handlers bulk.**

  Sélectionner plusieurs contacts pending puis vérifier que le bouton de consignation appelle une seule fois `onLogMany(ids, payload)` avec résultat, commentaire, rappel et NPA. Vérifier qu’un résultat RDV est indisponible pour une sélection multiple, que Reporter ouvre la date et appelle `onDeferContacts` avec `scheduledFor`, `targetSessionId` et `name`, et que les sélections claimées par autrui ne peuvent pas être retirées.

- [ ] **Step 2: Écrire le test rouge des rappels et erreurs partielles.**

  Vérifier qu’un preset rapide puis une date personnalisée appellent `onUpdateRecall` avec les IDs sélectionnés et la date ; vérifier qu’un `error` tel que `"2 consignés, 2 en échec — liste actualisée"` est visible dans la surface avec `role="alert"`. Le composant ne doit pas simuler ni appeler une API.

- [ ] **Step 3: Exécuter les tests L5B pour confirmer les rouges légitimes.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx`

  Expected: échecs limités aux callbacks/actions non encore câblés ; aucune modification des handlers parent.

- [ ] **Step 4: Ajouter le formulaire bulk minimal.**

  Utiliser `ResultButtons`, `RecallFields`, `Checkbox`, une zone de commentaire au style existant, `DatePicker` et `Select` pour les choix. Le formulaire appelle directement les callbacks reçus, vide sa sélection après soumission et garde le focus de session sur la file. Le report réutilise `hubSessions`, `nextContinuationName` et le contrat `DeferPayload` sans créer de session côté composant.

- [ ] **Step 5: Ajouter la protection métier et les erreurs partielles.**

  Exclure les contacts claimés par un autre utilisateur des actions de retrait, garder leur badge et expliquer le blocage. Afficher `error` sans masquer la file ; le batching par vagues de quatre reste exclusivement dans `CallManagerApp.handleLogMany`.

- [ ] **Step 6: Exécuter les tests L5A/L5B puis les trois gates.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.standardFlow.test.tsx`

  Expected: code 0 ; puis `npm run test`, `npm run lint`, `npm run build` successifs à code 0, avec les trois expected fail legacy inchangés.

- [ ] **Step 7: Committer L5B.**

  Run: `git add -A && git commit -m "feat(calls): wire V2 bulk queue actions"`

### Task 3: Raccourcis clavier V2 (L5C)

**Files:**
- Create: `src/apps/calls/modules/runner/sessionWorkspace/useSessionWorkspaceShortcuts.ts`
- Create: `src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.shortcuts.test.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/ContactWorkspace.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.tsx`
- Modify: `src/apps/calls/modules/runner/sessionWorkspace/types.ts`
- Modify: `src/apps/calls/calls-workspace-v2.css` only if shortcut hints need V2-scoped styles.

**Interfaces:**
- Consumes: `active`, `isTypingTarget`, `digitFromKeyboardCode`, `resultatFromDigit`, `PowerUiState`, `openQueueTools`, focus guard and the contact ACW submit/result callbacks.
- Produces: `useSessionWorkspaceShortcuts({ active, bulkOpen, powerUiState, onOpenQueue, onOpenContact, onPickResult, onSubmit })` with one capture listener and no listener when inactive.

- [ ] **Step 1: Écrire les tests rouges de raccourcis actifs.**

  Avec `active=true`, vérifier que `L` ouvre l’overlay, `F` le ferme et conserve/focalise le contact, `Digit1` à `Digit5` sélectionnent le résultat correspondant sur un contact pending, et `Meta+Enter` appelle la soumission ACW.

- [ ] **Step 2: Écrire les tests rouges des désactivations et I13.**

  Vérifier qu’aucune action ne part si la cible est un `input`/`textarea`, dans un `EventPanel`, sous `[role="dialog"]`, quand le bulk est ouvert, ou quand l’état Power est `conversation` (`L` ne doit jamais quitter la fiche). Rendre `active=false`, envoyer des événements clavier et vérifier qu’aucune action V2 ne part et qu’aucun second listener V2 n’est ajouté.

- [ ] **Step 3: Exécuter les tests L5C pour confirmer les rouges légitimes.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.shortcuts.test.tsx`

  Expected: échecs dus à l’absence du hook et des points d’entrée de raccourcis ; les tests de caractérisation legacy restent hors périmètre.

- [ ] **Step 4: Implémenter le hook clavier unique.**

  Installer un seul `document.addEventListener('keydown', ..., true)` conditionné par `active`. Tester d’abord modal/typing/bulk/conversation, utiliser `event.code` pour `Digit1–5`, empêcher le défaut uniquement lorsqu’une action V2 est réellement acceptée, puis déléguer les actions au parent. Ne pas réutiliser le listener de `RunnerView` et ne pas modifier le legacy.

- [ ] **Step 5: Exposer les actions ACW nécessaires sans nouvelle surface.**

  Ajouter à `ContactWorkspace` les callbacks/ref ou commandes contrôlées minimales permettant de sélectionner un résultat et de soumettre le formulaire courant. `⌘↵` ne doit rien faire pour un RDV incomplet, un contact traité ou `awaitingEvent`; la sélection `1–5` doit rester impossible dans le bulk.

- [ ] **Step 6: Exécuter tous les tests ciblés puis les trois gates finales.**

  Run: `npx vitest run --mode=test src/apps/calls/modules/runner/sessionWorkspace/QueueToolOverlay.test.tsx src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.shortcuts.test.tsx src/apps/calls/modules/runner/sessionWorkspace/SessionWorkspaceV2.powerMachine.test.tsx`

  Expected: code 0 ; puis `npm run test`, `npm run lint`, `npm run build` successifs à code 0, sans toucher aux expected fail legacy.

- [ ] **Step 7: Vérifier le périmètre et committer L5C.**

  Run: `git diff --name-only HEAD~2..HEAD -- src/apps/calls/modules/runner/RunnerView.tsx src/apps/calls/CallManagerApp.tsx src/apps/calls/calls.css src/apps/calls/calls-dialer.css src/apps/calls/modules/dialer/application/useDialerPool.ts src/apps/calls/modules/dialer/application/pool.js`

  Expected: sortie vide ; puis `git add -A && git commit -m "feat(calls): restore V2 runner keyboard shortcuts"`.

## Self-review against the contract

- L5A ne crée aucun `mode` ni arbre Liste/Fiche ; l’overlay reste attaché à `SessionQueue`.
- L5B appelle uniquement les callbacks reçus et laisse le batching de quatre au handler parent existant.
- L5C utilise un seul listener V2 conditionné par `active` et bloque exactement les surfaces I11/I12/I13/I15.
- Les fichiers legacy, les handlers réseau, le pool et les expected fail sont hors des écritures prévues.
- Chaque sous-lot a ses tests rouges/verts, ses trois gates et son commit conventionnel.
