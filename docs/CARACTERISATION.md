# Caractérisation du runner Combo avant migration

État de référence : 4 septembre 2026, branche `runner-refonte-luna-lots`, avant
toute migration structurelle. Ce document fixe le comportement observable du
runner legacy pour le lot 6. Les handlers de `CallManagerApp` et les six
fichiers chauds sont restés en lecture seule.

## Protocole

Les tests Vitest utilisent les composants actuels et un routeur `fetch` local.
Les builders partagés sont dans
[`runnerCharacterizationFixtures.ts`](../src/apps/calls/modules/runner/runnerCharacterizationFixtures.ts).
Ils donnent des contacts, séances et contextes complets, stables et sans
requête externe. Le test d’intégration couvre l’ordre des POST, les snapshots
optimistes et les réponses HTTP 409/502.

La suite Playwright utilise une fixture DOM déterministe et les feuilles CSS
actuelles. Elle ne simule pas Telnyx : les états Power `wave` et
`conversation` sont des états visuels figés, afin de conserver une baseline
reproductible avant la migration du workspace.

## Matrice I1–I15

| Invariant | Preuve conservée | Résultat actuel |
| --- | --- | --- |
| I1 — FIFO, suivant = prochain pending | `RunnerView.characterization.test.tsx` — `follows the next pending contact...`; `CallManagerApp.characterization.test.tsx` — `keeps successive ... FIFO`; `dialerLogQueue.test.ts` | VERT |
| I2 — rollback optimiste d’un log rejeté | `CallManagerApp.characterization.test.tsx` — `rolls back the optimistic log...` (réponse 502 `sf_write_error`) | VERT |
| I3 — préchargement du contexte | `CallManagerApp.characterization.test.tsx` — courant + trois pending suivants ; `runnerContext.test.ts` — résolution et borne du préchargement | VERT |
| I4 — contacts partagés protégés | `CallManagerApp.characterization.test.tsx` — contact pris par Camille exclu du claim et affiché ; `PowerStrip.test.tsx` — exclusion de la projection Power | VERT |
| I5 — RDV appel + Event | `CallManagerApp.test.tsx` — `logs call and Event together when RDV planifié is selected` ; caractérisation du rejet Event dans `CallManagerApp.characterization.test.tsx` | VERT |
| I6 — claim concurrent | `CallManagerApp.characterization.test.tsx` — claim unique puis 409 `contact_claimed` et relecture de séance | VERT |
| I7 — bulk par vagues de 4 et erreurs partielles | `CallManagerApp.test.tsx` — `logs selected contacts in waves of four and aggregates failures` ; `CallManagerFixes.test.tsx` — bulk local | VERT |
| I8 — rappels rapides, date et NPA | `RunnerView.characterization.test.tsx` — `+7 j`, date du calendrier, NPA sans rappel ; `CallManagerApp.test.tsx` — synchronisation NPA non bloquante | VERT |
| I9 — résumé Power = projection réellement envoyée | `PowerStrip.test.tsx` — pending joignables, normalisation E.164, déduplication par numéro et exclusion claim ; `combo-power-dialing.spec.ts` adapté au libellé actuel | VERT, projection à centraliser lors de la migration |
| I10 — sortie pendant vague transactionnelle | garde nommé `it.fails` dans `RunnerView.characterization.test.tsx` | DÉFAUT LEGACY ATTENDU |
| I11 — clavier absent des champs/overlays/surface inactive | `RunnerView.characterization.test.tsx` — commentaire et champ texte ; `PreSessionFlow.test.tsx` — Escape et focus ; smoke a11y Playwright | VERT sur les surfaces couvertes |
| I12 — `L` ne quitte pas une conversation Power | garde nommé `it.fails` dans `RunnerView.characterization.test.tsx` ; reproduit la closure actuelle de `runComboAction` | DÉFAUT LEGACY ATTENDU |
| I13 — pas de double listener en pré-session | garde source `runner-a11y.contract.test.ts` sur le Runner sous `aria-hidden` | DÉFAUT LEGACY ATTENDU |
| I14 — reduced motion | `runner-a11y.contract.test.ts` vérifie les blocs `prefers-reduced-motion` dans les deux CSS ; Playwright émule `reduce` | VERT |
| I15 — raccourcis hors champs/bulk/conversation | `RunnerView.characterization.test.tsx` — champ texte et bulk exclusifs ; `RunnerView.power.test.tsx` — contrôles masqués pendant vague/conversation ; `PreSessionFlow.test.tsx` | VERT sur les chemins conservés |

Les trois lignes « défaut legacy attendu » sont des `it.fails` intentionnels.
Vitest les rapporte comme « expected fail » mais sort avec le code 0 : elles
documentent le comportement à faire passer en vert pendant la migration, sans
faire passer subrepticement une correction de production dans ce lot.

## A11y et limites de l’outil

Le dépôt ne contient pas `axe-core` ni `@axe-core/playwright`, et aucune
dépendance n’a été ajoutée pour ce lot. Le filet nommé axe-like contrôle donc
les règles de base suivantes : ids dupliqués, nom accessible des éléments
interactifs, élément focusable sous `aria-hidden`, et cohérence
`aria-live`/`role=status|alert`. Ce contrôle ne revendique pas la couverture
complète d’axe et devra être conservé ou remplacé par le scan axe du pipeline
après décision de dépendance.

Le reduced-motion est vérifié à la fois par source CSS et par
`matchMedia('(prefers-reduced-motion: reduce)')` dans les 6 états Playwright.
Les feedbacks d’erreur sont assertifs (`role=alert`), les états de progression
ou de file sont polis (`role=status`).

## Résultats des exécutions ciblées

Avant édition, `npm run test` donnait 169 fichiers, 1 500 tests, zéro échec.
Après les ajouts de caractérisation, le sous-ensemble Vitest est vert hors des
3 `it.fails` attendus ; la commande exacte doit être rejouée après le dernier
changement avant livraison finale. Les deux specs déterministes Playwright
passent avec **48 scénarios** : 42 captures responsive et 6 tests a11y, tous
aux largeurs contractuelles.

Le test historique `e2e/combo-power-dialing.spec.ts` a été adapté au wording
actuel (« numéros prêts » et quota masqué lorsqu’il reste plus de 7 appels).
Son exécution locale n’est pas utilisée comme preuve de ce lot lorsqu’un
serveur Vite déjà présent sur le port 5173 sert une autre application : dans
ce cas, l’attente échoue sur `Ouvrir Combo`, avant le scénario Power. Cela ne
change pas la preuve déterministe ci-dessus.

## Contrôle de non-régression de périmètre

Les fichiers suivants ont été lus seulement et ne doivent apparaître dans
aucun commit Luna :

- `src/apps/calls/modules/runner/RunnerView.tsx`
- `src/apps/calls/CallManagerApp.tsx`
- `src/apps/calls/calls.css`
- `src/apps/calls/calls-dialer.css`
- `src/apps/calls/modules/runner/PowerStrip.tsx`
- `src/apps/calls/modules/runner/ContactCardPanel.tsx`

Les changements livrés sont des tests, des fixtures, des captures et cette
documentation. Aucune refonte de structure, API ou handler n’est incluse.
