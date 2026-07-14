# Audit complet X OS — 2026-07-14

**Base auditée** : `main` @ `9c45ee6` (fix labo refresh token). Un WIP non commité existe sur `src/apps/cleaner/shell/CleanerShell.tsx` + tests (agent parallèle, refonte accueil Labo) — **ne pas écraser, coordonner avant tout chantier touchant le shell Labo**.

**Méthode** : `tsc --noEmit` (✅ propre), `eslint` (2 erreurs, 22 warnings), `vitest` sur HEAD propre en worktree isolé (❌ 8 échecs), `knip` (fichiers/exports/deps inutilisés, vérifiés par grep), lecture ciblée des moteurs (secteurs Labo, adapter Salesforce, shell Labo, Combo/Runner, WindowManager, cleaner.js, useSession).

**Usage** : chaque chantier ci-dessous est autonome et calibré pour un agent spécialisé (recommandation : workers Sonnet, jamais Fable — cf. conventions du projet). Chaque chantier a un critère de vérification. Ordre conseillé : C1 → C2 → C3 (P0), puis le reste en parallèle.

---

## Synthèse


| #   | Chantier                                                                                               | Priorité | Domaine             |
| --- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------- |
|     |                                                                                                        |          |                     |
| C2  | JWT Supabase écrit dans le DOM par le shell Labo                                                       | **P0**   | Sécurité            |
| C3  | `npm test` rouge sur main : 8 tests obsolètes                                                          | **P0**   | CI / Tests          |
| C4  | Store `recetteJob` jamais démarré : bouton non désactivé, double-lancement, UI morte                   | **P1**   | Bugs / Labo         |
| C5  | Undo de fusion rejouable sans garde                                                                    | **P1**   | Moteur / Labo       |
| C6  | Troncatures SOQL silencieuses (LIMIT 2000)                                                             | **P1**   | Backend / Fiabilité |
| C7  | Incohérence de droits : lecture recette Secteurs refusée aux commerciaux                               | **P1**   | Produit / Backend   |
| C8  | Code mort + résidus flux preview pré-V17d + erreurs lint                                               | **P2**   | Code mort / Polish  |
| C9  | Fuites mémoire process-level (caches/Maps jamais purgés)                                               | **P2**   | Backend             |
| C10 | Performance rendu : WindowManager re-rend toutes les apps, 39 `backdrop-filter`                        | **P2**   | Perf / Fluidité     |
| C11 | Monolithes à découper (RunnerView 2357 l., WeeklyApp 2076 l., perf.js 1638 l., CallManagerApp 1419 l.) | **P3**   | Maintenabilité      |
| C12 | Design tokens : hex dupliqués hors `theme.css`                                                         | **P3**   | Design / UI         |
| C13 | Polish lint/hooks/a11y (warnings ciblés)                                                               | **P3**   | Polish / UX         |


---

## C1 — P0 · Jobs bulk secteurs incompatibles serverless + polling infini côté client

**Fichiers** : `api/_cleaner/recettes/sectors.js`, `src/apps/cleaner/modules/recettes/sectors/SectorsRecipeView.tsx`, `api/cleaner.js`

**Constat** :

1. `sectorJobs = new Map()` (`sectors.js:20`) est un store **en mémoire de process**. `startBulkSectorJob` répond `{jobId}` immédiatement et lance le job dans une promesse flottante (`void Promise.resolve().then(...)`, `sectors.js:699`). Sur Vercel serverless :
  - l'exécution peut être gelée dès que la réponse part → le job peut **ne jamais s'exécuter** ;
  - le `GET action=status` suivant peut atterrir sur **une autre instance lambda** → `job_not_found` (404) alors que le job existe ailleurs. Ça marche en dev (process unique), c'est cassé/aléatoire en prod.
2. Côté client, `runBulk` (`SectorsRecipeView.tsx:106-143`) poll dans un `while (!done)` **sans cap d'essais, sans timeout, sans vérification `res.ok`**. Sur un 404 `job_not_found`, `status.status` est `undefined` → **boucle infinie** à 1 req/1,5 s, UI figée sur « Fusion en cours ».

**Correctif recommandé (le plus simple, supprime le problème au lieu de le patcher)** : supprimer entièrement le système de jobs serveur. Le client orchestre séquentiellement avec les actions unitaires **déjà existantes et robustes** : pour chaque secteur sélectionné, `POST action=preview_merge` (dry-run) puis `POST action=apply_merge` avec `expectedAccountIds` (la garde `stale_preview` existe déjà, `sectors.js:388-396`). Deux passes : d'abord tous les dry-runs (si un seul échoue → rien n'est écrit, sémantique V17d conservée), puis les applies. Progression réelle affichée localement (`i/total`), plus aucun état serveur, plus de polling.

- À supprimer alors : `startBulkSectorJob`, `runBulkSectorJob`, `getSectorJobStatus`, `sectorJobs`, `newJobId` (`sectors.js:585-720`), la route `action=status` et `action=bulk_apply` (`api/cleaner.js:133-137, 228`), `bulkApplySectors`/`startBulk` côté front.
- Alternative si le bulk atomique côté serveur est exigé : persister les jobs dans une table Supabase (`recette_jobs`) et faire avancer le job d'un pas à chaque poll du GET status. Plus lourd ; ne la choisir que sur demande explicite.

**Vérification** : test d'intégration simulant deux « instances » (deux imports isolés du module) : la fusion bulk aboutit et la progression est correcte ; test client : un 404 sur un poll ne produit pas de boucle infinie. Test manuel en preview Vercel : fusion de 2 secteurs aboutit et journalise.

---

## C2 — P0 · JWT Supabase écrit dans le DOM

**Fichier** : `src/apps/cleaner/shell/CleanerShell.tsx:165-168`

```tsx
<span data-testid="cleaner-session-state" data-access-token={accessToken ?? ''} />
```

**Constat** : le token d'accès Supabase (JWT porteur des droits API) est sérialisé dans un attribut DOM en production. N'importe quelle extension navigateur / capture DOM / outil de session-replay peut le lire. C'est un hook de test qui a fui.

**Correctif** : supprimer le span ; dans les tests, vérifier la propagation du token via un module mocké (spy sur les fetchs sortants ou sur les props des modules) au lieu du DOM. ⚠️ Le WIP en cours touche ce fichier et ses tests : coordonner.

**Vérification** : `grep -r "data-access-token" src` vide ; suite Labo verte.

---

## C3 — P0 · `npm test` rouge sur main (8 tests obsolètes)

**Fichiers** : `api/log.test.js` (7 échecs), `api/_calls/profileCache.test.js` (1 échec)

**Constat** (échecs reproduits sur HEAD propre, indépendants du WIP) :

- `fetchSFToken` est passé en **OAuth-utilisateur-uniquement** (`api/_crm/salesforce.js:365-372` : avec `{client, userId}`, plus aucun fallback org sans `allowOrgFallback: true` → `sf_auth_error`). Les tests de `api/log.test.js` moquent encore l'ancien flux org (refresh token via `fetch`) : les actions `log_call`/`create_contact` reçoivent 502 `sf_auth_error` au lieu de 200.
- `getProfile` renvoie désormais `sfAuthConnectedAt` et `userLinked` en plus ; l'assertion `toEqual` stricte de `profileCache.test.js:17` ne les attend pas.

**Impact** : CI rouge en continu ; les agents parallèles qui mergent sur main ne peuvent plus se fier à la suite. À traiter avant tout autre chantier.

**Correctif** : mettre à jour les mocks de `log.test.js` pour simuler le chemin user-OAuth (profil avec `sf_refresh_token_encrypted`, mock du décryptage + échange de token — s'inspirer des tests verts `api/_crm/salesforce-user-token.test.js`) ; ajouter les 2 champs attendus dans `profileCache.test.js`. **Ne pas modifier le code produit** : le comportement runtime est le comportement voulu (« Product path is user-OAuth only »).

**Vérification** : `npm test` vert sur HEAD propre.

---

## C4 — P1 · Store `recetteJob` jamais démarré : garde-fous UI morts

**Fichiers** : `src/apps/cleaner/modules/recettes/sectors/SectorsRecipeView.tsx`, `src/apps/cleaner/modules/recettes/recetteJobStore.ts`

**Constat** : `runBulk` poll en boucle locale mais **n'appelle jamais `job.start()`**. Conséquences en cascade :

- `jobBusy` (`job.status === 'pending' || 'running'`) reste `false` pendant toute la fusion → le bouton « Fusionner N secteurs » **reste cliquable** → double-lancement possible d'écritures Salesforce concurrentes ;
- la barre de progression (`SectorsRecipeView.tsx:285-318`) ne s'affiche jamais et le libellé `Fusion en cours 0/0` est inatteignable ;
- l'effet « React to job completion » (`:152-166`) est du code mort ;
- le commentaire `:121-125` documente l'incohérence au lieu de la corriger.

**Correctif** : dépend du choix C1. Si C1 supprime les jobs serveur : piloter la progression via le store (`job.start` avec un poller local) **ou** supprimer `recetteJobStore` et tenir un simple état local `{running, processed, total, errors}` — un state local suffit, le store React-context n'a qu'un seul consommateur. Dans tous les cas : bouton désactivé pendant l'exécution.

**Vérification** : test RTL : pendant une fusion en cours (promesse non résolue), le bouton est `disabled` et la progression s'affiche ; un second clic ne déclenche pas de second POST.

---

## C5 — P1 · Undo de fusion rejouable sans garde

**Fichier** : `api/_cleaner/recettes/sectors.js:477-564` (`undoSectorMerge`)

**Constat** : l'undo restaure le snapshot V18 sans aucune vérification d'état courant ni marqueur « déjà annulé » :

- rejouable N fois (chaque replay ré-écrase l'Industry des comptes, y compris des modifications légitimes faites entre-temps dans Salesforce) ;
- pas de garde équivalente à `stale_preview` : si un compte a changé de secteur après la fusion, l'undo l'écrase silencieusement.

**Correctif minimal** : (1) au moment de l'undo, marquer l'entrée de journal comme annulée (ex. `payload.undoneAt` via update, ou vérifier l'existence d'une entrée `recette_sectors_undo_merge` référençant `originalJournalId`) et refuser un second undo avec 409 ; (2) optionnel mais recommandé : requêter l'Industry courante des comptes du snapshot et ne restaurer que ceux encore sur le label cible de la fusion, en reportant les autres comme `skipped`.

**Vérification** : tests unitaires : double undo → 409 ; compte modifié entre fusion et undo → non écrasé (si option 2 retenue).

---

## C6 — P1 · Troncatures SOQL silencieuses (LIMIT 2000)

**Fichiers** : `api/_cleaner/recettes/sectors.js:91`, `api/_crm/salesforce.js:5, 224-225, 450`

**Constat** : trois caps silencieux à 2000 :

1. `accountQuery()` : `LIMIT 2000` avec `ORDER BY Industry` — au-delà de 2000 comptes hors nomenclature, des **secteurs entiers disparaissent** de la recette sans avertissement, et les fusions ne traitent qu'une partie des comptes (la garde `stale_preview` ne voit pas ce qui n'est pas chargé).
2. `fetchOpportunityAccountIds` : `LIMIT 2000` sur les opportunités ouvertes/perdues → au-delà, les filtres tri-état `opp_ouverte`/`opp_perdue` du Call Manager produisent des **résultats faux** (comptes considérés « sans opp » à tort).
3. `SOQL_FETCH_CAP` sur les fetchs larges post-filtrés (documenté mais non signalé à l'utilisateur).

**Correctif** : au minimum, propager un indicateur `truncated: true` quand `records.length === cap` et l'afficher dans l'UI concernée (« Résultats partiels : affinez vos filtres »). Pour le cas 1, paginer via `queryMore` (le mécanisme `nextRecordsUrl` existe déjà dans `searchContacts`) est envisageable puisque le WHERE exclut déjà les secteurs canoniques (volumes faibles attendus) — décision à prendre selon la volumétrie réelle.

**Vérification** : test unitaire : réponse SF de `cap` enregistrements → `truncated: true` dans la réponse API ; test RTL : bandeau affiché.

---

## C7 — P1 · Droits incohérents sur la lecture de la recette Secteurs

**Fichiers** : `api/_cleaner/recettes/sectors.js:208-210`, `src/apps/cleaner/modules/recettes/sectors/SectorsRecipeView.tsx:191-195`

**Constat** : `loadSectorRecipe` exige `canApplyRecipes` (manager/admin) **en lecture**, alors que l'UI prévoit explicitement un mode lecture seule (`Tag « Prévisualisation seule »` quand `canApplyMerge === false`) et que `publicCapabilities` n'a de sens que si la lecture est plus permissive que l'écriture. En l'état, `canApplyMerge` est toujours `true` quand on arrive à charger la page : le tag « Prévisualisation seule » est inatteignable.

**Correctif** : décision produit à trancher (⚠️ demander à Théo avant d'implémenter) :

- **Option A** — la recette est manager/admin only : retirer le tag « Prévisualisation seule » et `publicCapabilities`, et masquer la recette pour les commerciaux dans le registre de modules ;
- **Option B** — lecture ouverte à tous : remplacer `authorizeRecipeContext` par `authorizeReadContext` dans `loadSectorRecipe` (le `loadScopedAccounts(context)` interne repasse alors en `requireApply: false`).

**Vérification** : test d'API : GET recette avec un profil commercial → 200 + `canApplyMerge: false` (option B) ou module invisible (option A).

---

## C8 — P2 · Code mort, résidus pré-V17d, erreurs lint

**Résidus du flux « preview » supprimé en V17d** (front `src/apps/cleaner/modules/recettes/sectors/api.ts`) :

- `previewSectorMerge` (:162), `applySectorMerge` (:175), `bulkPreviewSectors` (:215 — envoie `bulk_preview`, action **rejetée par le serveur** depuis V17d), `getSectorJobStatus` (:229), `pollJobStatus` (:255). Aucun n'est importé ailleurs. ⚠️ Si C1 adopte l'orchestration client, `previewSectorMerge`/`applySectorMerge` redeviennent utiles — exécuter C8 **après** C1.

**Code mort confirmé (défini et jamais importé ailleurs, tests compris)** :

- `src/apps/calls/api.ts` : `fetchSessions` (:58), `fetchStats` (:63), `skipContact` (:323)
- `src/apps/calls/filterControls.tsx` : `TagInput` (:384)
- `src/apps/calls/pilotageApi.ts` : `invalidateProspectionCockpitCache` (:123)
- `src/apps/cleaner/modules/opportunities/api.ts` : `OpportunityApiError` (:89)
- `api/_cleaner/opportunities/preview.js` : `buildOpportunityPreview` (:353)
- `api/_cleaner/core/validation.js` : `validateCleanerQuery` (:29) — **ne pas toucher** `assertValidCleanerQuery`, utilisé
- `src/apps/calls/RunnerView.tsx:369` : prop `contextLoading` renommée `_contextLoading` et jamais lue → retirer la prop de bout en bout (interface + appelants)

**Erreurs eslint (2)** :

- `src/crm/opportunityFilters.ts:50` : `prefer-const`
- `src/apps/calls/RunnerView.tsx:369` : `no-unused-vars` (couvert par le retrait ci-dessus)

**Dépendance** : `@vercel/blob` n'est utilisée que par `scripts/migrate-cleaner-history.js` (script one-shot de migration documenté dans le README, jamais exécuté en prod). Si la migration Blob→Supabase est terminée, supprimer script + test + dépendance ; sinon la déplacer en `devDependencies`. Demander à Théo l'état de la migration.

**Candidats à vérifier au cas par cas** (signalés par knip, usage indirect possible) : `src/apps/cleaner/modules/recettes/manifest.ts` `opportunitiesRecipe`/`sectorsRecipe` ; constantes de `api/_config/access.js` ; `mergeKpis` (`PilotageView.tsx:84`) ; `COMBO_ACTIONS`, `RDV_SUBJECTS`, etc. Règle : grep d'usage avant suppression, suppression = export + code + tests associés.

**Faux positifs knip à ne PAS supprimer** : `middleware.js` (entrée edge Vercel), les exports `GET`/`POST`/`OPTIONS` de `api/*.js` (conventions de routing Vercel), `scripts/*.check.js` (scripts manuels). Ajouter un `knip.json` déclarant ces entrypoints pour fiabiliser les prochains passages.

**Vérification** : `npx knip` sans nouveaux items après config ; `npm run lint` → 0 erreur ; `npm test` + `npm run build` verts.

---

## C9 — P2 · Fuites mémoire process-level

**Fichier** : `api/_crm/salesforce.js:8-9`

**Constat** : `sfUserTokenContexts` (Map clé = access token) et `sfUserTokenCache` ne sont jamais purgées hors tests : chaque refresh de token utilisateur ajoute une entrée `sfUserTokenContexts` sans retirer l'ancienne. Idem `sectorJobs` (`sectors.js:20`, disparaît si C1 est appliqué). Impact réel limité (les lambdas se recyclent) mais croissance non bornée sur instance chaude.

**Correctif** : dans `fetchUserSFToken`, supprimer l'entrée `sfUserTokenContexts` de l'ancien token quand on le remplace (`sfUserTokenCache.delete` existe déjà à :338 — supprimer aussi le contexte associé à `cached.accessToken`).

**Vérification** : test unitaire : après 2 refreshs forcés du même user, `sfUserTokenContexts.size === 1`.

---

## C10 — P2 · Performance de rendu et fluidité

**Fichiers** : `src/os/WindowManager.tsx`, CSS (`grep backdrop-filter` → 39 occurrences)

**Constats** :

1. `WindowManager` re-rend **toutes les fenêtres ouvertes** (apps lourdes incluses : Combo, Lundi, Labo) à chaque action du bureau : un simple `mousedown` de focus dispatch et reconstruit tout l'arbre. Aucune fenêtre n'est mémoïsée, et `onParamsChange` est une closure inline recréée à chaque rendu (casse toute mémoïsation en aval).
2. 39 `backdrop-filter` (glassmorphism) : coût GPU réel quand plusieurs surfaces vitrées se superposent (fenêtres empilées + dock + control center), cause classique de saccades au drag des fenêtres.

**Correctifs** :

1. Extraire le contenu de fenêtre dans un composant `WindowFrame` enveloppé de `React.memo`, avec des callbacks stables (`useCallback` par `appId` ou dispatch passé tel quel). Critère simple : cliquer sur une fenêtre pour la focus ne doit re-rendre que les 2 fenêtres dont le zIndex change.
2. Audit ciblé des `backdrop-filter` : conserver ceux des surfaces de premier plan (dock, control center, titlebar), remplacer par des fonds semi-opaques les surfaces internes des apps (cartes dans des fenêtres déjà vitrées — le flou y est invisible de toute façon). Mesurer avant/après avec le FPS meter de Chrome pendant un drag de fenêtre avec 3 apps ouvertes.

**Vérification** : React DevTools Profiler : focus d'une fenêtre → re-rendus limités aux fenêtres affectées ; drag fluide (&gt;50 fps) avec 3 fenêtres ouvertes sur machine de référence.

---

## C11 — P3 · Monolithes à découper (uniquement si un chantier les touche)

`src/apps/calls/RunnerView.tsx` (2357 l.), `src/apps/weekly/WeeklyApp.tsx` (2076 l.), `api/perf.js` (1638 l.), `src/apps/calls/CallManagerApp.tsx` (1419 l.), `src/apps/calls/PilotageView.tsx` (1011 l.).

Pas de refactor gratuit (périmètre chirurgical) : ces fichiers sont testés et fonctionnels. Règle proposée : tout chantier futur qui modifie substantiellement l'un d'eux en extrait d'abord la zone touchée (vue liste vs fiche du Runner ; sections de WeeklyApp ; helpers purs de perf.js déjà exportés/testables). Noter que RunnerView concentre aussi la majorité des warnings hooks (cf. C13).

---

## C12 — P3 · Design tokens : couleurs codées en dur

**Constat** : `src/os/theme.css` définit les tokens, mais les CSS d'apps dupliquent des hex bruts : `#f5c542` ×17, `#fff` ×12, `#ff7e8a` ×10, `#00a1e0` ×9 (bleu Salesforce), `#ffe566` ×7, `#6effbb` ×6… Toute retouche de palette exige aujourd'hui un chasse-remplace multi-fichiers.

**Correctif** : promouvoir les couleurs récurrentes en variables `--xos-*` dans `theme.css` (accent-warning, accent-danger, accent-salesforce, accent-success…) et remplacer les occurrences. Pur mécanique, zéro changement visuel attendu.

**Vérification** : diff visuel nul (captures avant/après des 4 apps) ; `grep -c "#f5c542" src` → 0 hors theme.css.

---

## C13 — P3 · Polish ciblé (lint hooks, a11y, DX)

- **Hooks deps (22 warnings)** : la plupart sont des resets volontaires keyés sur `focusedContact?.id` (RunnerView:658-690) — les documenter avec `// eslint-disable-next-line react-hooks/exhaustive-deps` + raison, comme déjà fait dans `SectorsRecipeView.tsx:165`. Deux cas méritent un vrai correctif : `CommandPreviewPanel.tsx:98` (useMemo `values` manquant — risque de preview affichant des valeurs périmées) et `:111` (cleanup sur `previousFocus.current` — restauration de focus a11y potentiellement cassée à la fermeture du panneau).
- **Fast refresh (9 warnings)** : fichiers mêlant composants et constantes/fonctions exportées (`filterControls`, `formControls`, `OpportunitiesTable`, `ControlCenter`, `FloatingReactions`, `WeeklyApp`) — déplacer les exports non-composants dans des fichiers voisins. DX uniquement, aucun impact prod.
- `**SectorsRecipeView**` : après C1/C4, harmoniser les messages d'erreur du poll (`La fusion a échoué côté serveur.` sans détail) avec le détail `errors[]` déjà affiché dans la modale d'échec.
- `**api/cleaner.js:204**` : `JSON.stringify(body).length > 1_000_000` re-sérialise le body déjà parsé sur chaque POST — lire `Content-Length` ou accepter le coût (mineur, à ne faire que si un agent passe par là).
- **Handlers `OPTIONS`** (`api/calls.js:96`, `api/launcher.js:293`) : la SPA est same-origin, aucun preflight n'est émis. Inoffensifs ; suppression possible dans C8 si l'on confirme qu'aucun client cross-origin n'existe.

---

## Points explicitement hors périmètre / à décision humaine

1. **WIP CleanerShell** : la refonte accueil Labo en cours (diff non commité) recoupe C2 et les tests Labo — synchroniser avec l'agent/PR concerné avant de lancer C2.
2. **C7** : choix produit (recette Secteurs visible ou non par les commerciaux).
3. `**@vercel/blob` / script de migration historique** : suppression conditionnée à la confirmation que la migration Blob→Supabase est terminée.
4. **Pagination réelle de `accountQuery` (C6)** : dépend de la volumétrie réelle (&gt;2000 comptes hors nomenclature ?) — trancher avec les chiffres de prod.

## Étalonnage tests (état de référence au 2026-07-14)

- `tsc --noEmit` : ✅ 0 erreur
- `eslint` : 2 erreurs / 22 warnings (détail en C8/C13)
- `vitest` : 742 ✅ / 8 ❌ (détail en C3) — objectif post-C3 : 750 ✅
- `knip` : 6 fichiers, 1 dépendance, 76 exports signalés (dont faux positifs — voir C8)

