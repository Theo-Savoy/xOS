# Audit de cohérence de la gamification Combo

Date de l'audit : 2026-07-18  
Périmètre : spec `docs/specs/combo-gamification-v1.md`, moteurs XP/badges/streaks/nudge learning, hooks de lecture, tests unitaires et points d'intégration UI.  
Méthode : revue statique exhaustive, recherche de tous les appels de production et exécution ciblée des tests/build (voir §9).

## Synthèse exécutive

**Verdict : non prêt pour la production. Le défaut critique est que les moteurs sont orphelins : aucun appel de production à `applyEvent`, `checkBadges`, `computeStreak`/composites ou `useNudgeLearning` n'existe. La UI affiche donc une gamification qui ne peut pas être alimentée par les actions réelles.**

- **10 bugs ou défauts moteur confirmés**, dont 1 critique, 5 majeurs et 4 moyens.
- **17 familles d'edge cases non couvertes** par les tests.
- **5 recommandations UX prioritaires**.
- Les **18 seuils XP** de Bronze à Challenger sont strictement identiques à la spec §1.3.
- `currentPalier` et `detectPaliers` sont corrects pour des entrées finies, non négatives et monotones.
- Les critères des **7 badges détectables par Combo** correspondent à la spec ; le huitième, `relais`, est correctement réservé à Arena.
- Le streak classique traite correctement aujourd'hui, hier, les doublons, un jour manquant et l'absence d'exception week-end.
- TypeScript est en mode strict et aucun `any`, `@ts-ignore` ou `@ts-expect-error` n'a été trouvé dans les fichiers audités.

## 1. Bugs et défauts confirmés

### BUG-01 — Critique — moteurs jamais branchés aux événements réels

- **Constat** : `applyEvent`, `checkBadges`, `computeStreak`, `computeProductifStreak`, `computeIntenseStreak` et `useNudgeLearning` ne sont référencés hors de leur définition que par leurs tests. Les succès de `logCall` et `completeSession` mettent à jour la UI mais n'alimentent aucun moteur (`src/apps/calls/CallManagerApp.tsx:959`, `src/apps/calls/CallManagerApp.tsx:991`, `src/apps/calls/CallManagerApp.tsx:1056`, `src/apps/calls/CallManagerApp.tsx:1077`). Les interactions clavier/souris du runner ne déclenchent pas non plus le nudge learning (`src/apps/calls/RunnerView.tsx:938`).
- **Comportement actuel** : les clés `xos-combo-xp:<userId>`, `xos-combo-streaks:<userId>` et `xos-combo-nudge-learning:<userId>` ne sont jamais alimentées par le produit. Command bar et « Mes réussites » lisent donc des zéros/états vides (`src/apps/calls/CommandBar.tsx:50`, `src/apps/calls/MyTrophies.tsx:17`).
- **Attendu** : les mutations doivent partir uniquement des événements validés : raccourci qualifié, `log_call` réussi, Task SF créée pour un RDV, et `complete_session` réussi.
- **Recommandation** : créer un orchestrateur unique post-succès qui applique atomiquement XP, badges et streaks puis émet les événements de notification. Brancher le nudge learning sur les actions souris et l'adoption clavier. Ajouter un test d'intégration du parcours complet.

### BUG-02 — Majeur — aucune règle anti-abus dans `applyEvent`

- **Constat** : l'API ne reçoit ni identifiant d'action ni date ; chaque appel incrémente directement le compteur (`src/apps/calls/comboXp.ts:122`, `src/apps/calls/comboXp.ts:125`). Elle ne peut donc pas garantir « un raccourci par action et par jour » ni « un seul jour de régularité par date » (`docs/specs/combo-gamification-v1.md:35`).
- **Comportement actuel** : deux appels `applyEvent(user, "shortcut")` comptent deux fois ; deux appels `day-logged` le même jour incrémentent deux fois. La régularité devient un cumul d'événements, pas un streak calendaire.
- **Attendu** : déduplication par `{userId, actionId, dateParis}` pour Vitesse et par `{userId, dateParis}` pour Régularité ; crédit Impact uniquement après succès complet du RDV.
- **Recommandation** : faire porter aux événements leur identifiant métier et leur date Europe/Paris, conserver les marqueurs de déduplication et dériver la régularité de `computeStreak` plutôt que de l'incrémenter librement.

### BUG-03 — Majeur — unité Impact incohérente avec la source XP

- **Constat** : un événement RDV ajoute `qty`, donc 1 par défaut (`src/apps/calls/comboXp.ts:45`, `src/apps/calls/comboXp.ts:122`), et le test verrouille `impact === 1` (`src/apps/calls/comboXp.test.ts:54`). La spec annonce pourtant 10 XP par RDV (`docs/specs/combo-gamification-v1.md:32`).
- **Comportement actuel** : l'état et la UI exposent un compteur de RDV sous le nom XP Impact. Les seuils §1.3, eux, sont exprimés en « RDV cumulés » (3/7/15/30/60/100), ce qui révèle une ambiguïté de spec.
- **Attendu** : une seule unité canonique, soit points XP (10/30/70…), soit compteurs métier explicitement nommés.
- **Recommandation** : trancher la spec puis nommer le champ selon son unité. Si `impact` stocke des XP, multiplier par 10 et convertir les seuils ; s'il stocke des RDV, ne pas le présenter comme XP.

### BUG-04 — Majeur — seuil intensif erroné pour `L` et `F`

- **Constat** : un seuil global de 5 est appliqué à tous les raccourcis (`src/apps/calls/nudgeLearning.ts:30`, `src/apps/calls/nudgeLearning.ts:213`). La spec exige 3 clics pour Vue liste `L` et Vue fiche `F` (`docs/specs/combo-gamification-v1.md:209`).
- **Comportement actuel** : les nudges `L`/`F` apparaissent deux clics trop tard.
- **Attendu** : seuil par `ShortcutId`.
- **Recommandation** : remplacer la constante globale par une table exhaustive typée, testée aux bornes pour les 11 raccourcis ciblés.

### BUG-05 — Majeur — phase espacée déclenchée à 45 clics, pas 30 cumulés

- **Constat** : `markNudgeSeen` remet `mouseCount` à zéro après chaque rappel (`src/apps/calls/nudgeLearning.ts:253`, `src/apps/calls/nudgeLearning.ts:257`), puis la phase espacée exige 30 nouveaux clics (`src/apps/calls/nudgeLearning.ts:222`). Le test encode 5 + 10 + 30 clics (`src/apps/calls/nudgeLearning.test.ts:100`).
- **Comportement actuel** : le troisième rappel arrive au 45e clic total.
- **Attendu** : la spec demande un déclenchement à 30 actions cumulées (`docs/specs/combo-gamification-v1.md:184`, `docs/specs/combo-gamification-v1.md:197`).
- **Recommandation** : séparer `totalMouseCount` du compteur « depuis le dernier nudge », ou calculer le seuil restant sur un total qui n'est jamais remis à zéro.

### BUG-06 — Majeur — aucune transition sur adoption clavier

- **Constat** : le modèle ne sait enregistrer que les clics souris, les rappels vus et un reset (`src/apps/calls/nudgeLearning.ts:230`, `src/apps/calls/nudgeLearning.ts:253`, `src/apps/calls/nudgeLearning.ts:263`). `resetLearning` recommence l'apprentissage au lieu de marquer le raccourci adopté.
- **Comportement actuel** : même après usage du raccourci, l'utilisateur reste « non adopté » et peut recevoir les nudges suivants.
- **Attendu** : la décroissance ne concerne que chaque raccourci « non encore adopté » (`docs/specs/combo-gamification-v1.md:178`).
- **Recommandation** : ajouter un état/événement `adopted` déclenché par l'action clavier correspondante, avec test souris → clavier → silence persistant.

### BUG-07 — Moyen — `computeStreak` ne valide pas les dates

- **Constat** : `shiftDate` construit une `Date` puis appelle `toISOString()` sans validation (`src/apps/calls/comboStreaks.ts:14`). Un `todayParis` invalide peut lever `RangeError`; une unique date de log invalide peut même compter comme `bestEver = 1` car elle entre dans le `Set` puis le tri (`src/apps/calls/comboStreaks.ts:22`, `src/apps/calls/comboStreaks.ts:42`).
- **Comportement actuel** : crash ou streak historique faux selon la position de l'entrée invalide.
- **Attendu** : format strict `YYYY-MM-DD`, date calendaire réelle, politique explicite pour les données futures.
- **Recommandation** : valider/normaliser à la frontière et retourner un résultat sûr ou une erreur typée ; tester mois/jour impossibles, chaîne vide, timestamps et dates futures.

### BUG-08 — Moyen — erreurs `sessionStorage`/flags hebdomadaires non capturées

- **Constat** : les lectures/écritures du store principal sont protégées (`src/apps/calls/nudgeLearning.ts:108`, `src/apps/calls/nudgeLearning.ts:121`), mais les accès de fréquence ne le sont pas (`src/apps/calls/nudgeLearning.ts:165`, `src/apps/calls/nudgeLearning.ts:173`, `src/apps/calls/nudgeLearning.ts:181`, `src/apps/calls/nudgeLearning.ts:190`) ; `resetLearning` appelle aussi `removeItem` sans protection (`src/apps/calls/nudgeLearning.ts:263`).
- **Comportement actuel** : mode privé, politique navigateur ou quota peuvent faire crasher `registerMouseClick` précisément quand un nudge régulière/espacée apparaît.
- **Attendu** : la gamification doit se dégrader silencieusement sans casser le runner.
- **Recommandation** : centraliser toutes les opérations storage dans un adaptateur sûr et exposer un statut de persistance pour le diagnostic.

### BUG-09 — Moyen — `cmd-k` est accepté malgré son exclusion explicite

- **Constat** : `ShortcutId` inclut `"cmd-k"` (`src/apps/calls/nudgeLearning.ts:11`), alors que la command bar `⌘K` est exclue des nudges (`docs/specs/combo-gamification-v1.md:215`).
- **Comportement actuel** : tout appelant peut créer et afficher un nudge interdit pour `⌘K` ; TypeScript l'encourage puisqu'il le considère valide.
- **Attendu** : l'union publique ne contient que les cibles V1.
- **Recommandation** : retirer `cmd-k` ou séparer les raccourcis connus des raccourcis effectivement « nudgeables ».

### BUG-10 — Moyen — entrées runtime invalides corruptibles dans `applyEvent`

- **Constat** : aucune validation de `userId`, `event` ou `qty` (`src/apps/calls/comboXp.ts:122`). Un événement inconnu arrivé depuis du JS/données désérialisées produit un axe `undefined`; une quantité négative, fractionnaire ou non finie viole la monotonie attendue.
- **Comportement actuel** : compteur négatif, saut arbitraire, propriété `undefined` ou valeur sérialisée incohérente ; `detectPaliers` peut ensuite manquer ou réémettre des franchissements.
- **Attendu** : événement discriminé vérifié à la frontière, quantité entière positive, userId non vide.
- **Recommandation** : refuser les entrées invalides avec un résultat typé et couvrir ces cas au runtime, même si TypeScript protège les appels internes.

## 2. Cohérence XP ↔ spec

### 2.1 Matrice des 18 seuils

| Palier | Spec Vitesse | Code | Spec Impact | Code | Spec Régularité | Code | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| Bronze | 10 | 10 | 3 | 3 | 3 | 3 | Conforme |
| Argent | 30 | 30 | 7 | 7 | 7 | 7 | Conforme |
| Or | 75 | 75 | 15 | 15 | 14 | 14 | Conforme |
| Platine | 150 | 150 | 30 | 30 | 30 | 30 | Conforme |
| Diamant | 300 | 300 | 60 | 60 | 60 | 60 | Conforme |
| Challenger | 500 | 500 | 100 | 100 | 100 | 100 | Conforme |

Références : spec `docs/specs/combo-gamification-v1.md:40`, implémentation `src/apps/calls/comboXp.ts:35`.

### 2.2 Fonctions de palier

| Fonction | Constat | Référence | Recommandation |
|---|---|---|---|
| `currentPalier` | Correcte sur valeurs finies/positives : renvoie le plus haut seuil atteint. | `src/apps/calls/comboXp.ts:84` | Ajouter les 18 bornes `seuil-1`, `seuil`, `seuil+1` et les valeurs invalides. |
| `detectPaliers` | Conforme à `previous < threshold && new >= threshold`, y compris plusieurs seuils/axes en un saut. | `src/apps/calls/comboXp.ts:109` | Valider la monotonie et décider si un saut doit notifier chaque palier ou seulement le plus haut. |
| `progressToNext` | Cohérente comme progression **intra-segment** ; à 30 Vitesse elle repart à 0 % entre Argent et Or. La spec illustre plutôt un cumul « 30/75 ». | `src/apps/calls/comboXp.ts:92`, `docs/specs/combo-gamification-v1.md:42` | Clarifier le contrat UX : pour « 30/75 », exposer `value`, `nextThreshold` et éventuellement un pourcentage cumulatif. |

### 2.3 Alignement des axes et duplications

- Les axes partagent les mêmes six noms et le même ordre Bronze → Challenger (`src/apps/calls/comboXp.ts:35`) ; les valeurs diffèrent volontairement selon leurs unités. Impact et Régularité sont identiques sauf Or (15 RDV contre 14 jours), conformément à la spec.
- Il n'existe **pas** de duplication « Bronze régularité 3 jours = Lève-tôt » : Lève-tôt dépend d'une heure de démarrage (`src/apps/calls/comboBadges.ts:34`). Le doublon significatif est Impact Bronze = 3 RDV cumulés et Trois banderilles = 3 RDV dans une séance (`src/apps/calls/comboXp.ts:39`, `src/apps/calls/comboBadges.ts:33`) ; même nombre, fenêtres métier distinctes et donc cohérence acceptable.
- `useComboXp.ts` duplique intégralement les 18 seuils et l'algorithme de palier (`src/apps/calls/useComboXp.ts:35`, `src/apps/calls/useComboXp.ts:103`) au lieu d'importer `PALIERS/currentPalier`. Les valeurs sont encore identiques aujourd'hui, mais il y a deux sources de vérité.
- `ComboXpSummary.currentPalier` choisit le premier axe ayant un palier (`src/apps/calls/useComboXp.ts:135`), notion contraire à « pas de palier global » (`docs/specs/combo-gamification-v1.md:53`). Le champ n'est actuellement pas rendu, mais son contrat est trompeur ; le supprimer ou le remplacer par un record par axe.

## 3. Cohérence des 8 badges one-timer

| Badge | Critère spec | Critère code | Couverture test | Verdict / recommandation |
|---|---|---|---|---|
| Premier pas | 1re séance complétée | `sessionsCompletedCount >= 1` | Oui | Conforme (`comboBadges.ts:31`). |
| Éclair | 50 raccourcis dans une journée | `shortcutsUsedToday >= 50` | 49/50 | Conforme, mais le moteur amont journalier n'existe pas (`comboBadges.ts:32`). |
| Trois banderilles | 3 RDV même séance | `rdvInCurrentSession >= 3` | 2/3 | Conforme, sous réserve de RDV réellement validés (`comboBadges.ts:33`). |
| Lève-tôt | séance avant 9h Europe/Paris | booléen fourni par l'appelant | Cas vrai seulement | Critère conforme, mais aucune fonction ne calcule le fuseau/bord 08:59/09:00 (`comboBadges.ts:34`). |
| Marathon | séance ≥ 50 contacts terminée | `contactsCompletedInSession >= 50` | 49/50 | Conforme (`comboBadges.ts:35`). |
| Sang-froid | 10 NPA posées | `npaTotal >= 10` | 9/10 | Conforme (`comboBadges.ts:36`). |
| Relais | défi collectif atteint | jamais décerné par Combo | Test d'exclusion | Conforme au hors-scope Arena (`comboBadges.ts:47`, spec §6). |
| Mur des réussites | réussite signée opt-in | booléen fourni par l'appelant | Cas vrai seulement | Conforme (`comboBadges.ts:37`). |

Les huit IDs sont couverts par les tests, mais `comboBadges.test.ts` ne teste pas « l'état persistant » demandé par la spec (`docs/specs/combo-gamification-v1.md:393`) : `checkBadges` est pur et aucun service n'ajoute les IDs retournés à `ComboXp.badges`. La one-time-ness dépend entièrement d'un `currentBadges` externe non validé (`src/apps/calls/comboBadges.ts:40`). Recommandation : garder `checkBadges` pur, mais tester et intégrer une transaction « détecter + fusionner sans doublon + persister ».

## 4. Cohérence des 3 streaks

| Streak | Seuil/critère | Comportement actuel | Verdict / recommandation |
|---|---|---|---|
| Classique | jours Europe/Paris avec ≥1 log validé | Aujourd'hui compte ; si aujourd'hui est vide, hier maintient la série ; un trou antérieur casse ; doublons éliminés ; meilleur historique calculé. | Conforme pour dates valides (`comboStreaks.ts:21`). Il manque validation et intégration. |
| Productif | séances récentes consécutives avec ≥3 RDV | Parcours de la fin du tableau tant que `rdvs >= 3`. | Conforme si l'appelant fournit les séances de la plus ancienne à la plus récente (`comboStreaks.ts:64`). L'ordre n'est ni documenté dans le type ni validé. |
| Intense | séances récentes consécutives à ≥X appels | Même algorithme, seuil par défaut 20. | Algorithme conforme (`comboStreaks.ts:69`), mais 20 est une décision non figée : la spec laisse X ouvert (`docs/specs/combo-gamification-v1.md:457`). |

Manquements associés :

- La spec dit que chacun des trois streaks a ses propres paliers Bronze → Challenger sans donner les seuils des composites (`docs/specs/combo-gamification-v1.md:169`). Le moteur streak ne propose aucune détection de palier ; la UI réutilise silencieusement les seuils Régularité pour les trois (`src/apps/calls/useComboXp.ts:144`). Recommandation : figer les deux tables composites ou documenter explicitement la réutilisation.
- La spec demande un toggle opt-in défaut ON (`docs/specs/combo-gamification-v1.md:155`) ; aucun état de préférence n'est présent dans les moteurs/hooks audités.
- La spec se contredit sur les jours vides : reset sans exception week-end (`docs/specs/combo-gamification-v1.md:154`) mais critère « ne casse pas un jour férié » (`docs/specs/combo-gamification-v1.md:402`). Le code applique strictement le premier principe ; la règle jour férié doit être clarifiée.

## 5. Machine d'état nudge learning

| Phase | Code | Écart à la spec |
|---|---|---|
| Intensive | `nudgesSeen = 0`, seuil global 5 | Correct pour K/J/⌘↵/?/1–5 ; incorrect pour L/F (3 attendus). « À chaque occurrence » n'est pas réellement possible : après le premier rappel vu, la phase change. |
| Régulière | `nudgesSeen = 1`, 10 clics depuis reset, flag session | Seuil conforme. Le test de session n'est jamais exercé avec changement de session (`nudgeLearning.ts:217`). |
| Espacée | `nudgesSeen = 2`, 30 clics depuis le deuxième reset, flag glissant 7 jours | Fréquence proche de « semaine », mais seuil cumulatif faux : 45 clics totaux. « Semaine » est interprétée comme 168 heures, non semaine calendaire (`nudgeLearning.ts:181`). |
| Acceptée | `nudgesSeen >= 3`, silence | Conforme après trois appels à `markNudgeSeen` (`nudgeLearning.ts:211`). Il manque la branche adoption clavier. |

La spec elle-même contient une tension : le tableau demande 10 actions depuis le dernier nudge en phase régulière (`docs/specs/combo-gamification-v1.md:183`), alors que l'exemple annonce un deuxième toast après seulement 5 clics supplémentaires (`docs/specs/combo-gamification-v1.md:196`). Les tests ont choisi 10 ; décision produit à figer avant correction.

## 6. Cohérence tests ↔ implémentation

### `comboXp.test.ts`

- Les assertions correspondent à l'implémentation actuelle, y compris `rdv -> +1` (`src/apps/calls/comboXp.test.ts:54`).
- Bons invariants : persistance simple, axe isolé, palier le plus haut, franchissement simple/multiple/multi-axe, progression avant/entre/après les paliers.
- Manques : 18 seuils exhaustifs, `detectPaliers` sur égalité/décroissance, anti-abus, poids Impact décidé, même jour, entrée inconnue/quantité invalide, localStorage indisponible/quota/corruption, concurrence, changement userId.

### `comboBadges.test.ts`

- Les huit badges sont couverts : sept critères positifs et exclusion explicite de Relais (`src/apps/calls/comboBadges.test.ts:15`).
- Les bornes numériques sont bien testées pour Éclair, Trois banderilles, Marathon et Sang-froid.
- Manques : 08:59/09:00 Europe/Paris, persistance réelle, tableau `currentBadges` corrompu/dupliqué, état incomplet au runtime, conditions positives simultanées avec badges déjà possédés.

### `comboStreaks.test.ts`

- Bons cas : aujourd'hui, hier, jour manquant, vide, meilleur historique, doublon, week-end sans exemption, séries composites et seuil intense par défaut (`src/apps/calls/comboStreaks.test.ts:4`).
- Manques : date invalide, date impossible, date future, ordre arbitraire documenté, passage mois/année/bissextile, historique intense vide, `NaN`/valeurs négatives, seuil intense invalide, détection des paliers composites.

### `nudgeLearning.test.ts`

- Les quatre phases et l'arrêt après trois rappels sont exercés (`src/apps/calls/nudgeLearning.test.ts:65`).
- Le test « espacée après 30 clics » valide l'implémentation mais pas la spec, car il remet implicitement le compteur à zéro après les 5 puis 10 premiers clics (`src/apps/calls/nudgeLearning.test.ts:100`).
- Manques : seuils L/F, adoption clavier, exclusion cmd-k, 30 cumulé total, cap une fois/session, expiration hebdomadaire, changement userId, storage absent/plein/jetant, store corrompu, double dismiss, concurrence multi-onglets.

### `useComboXp.test.ts` et hook nudge

- `useComboXp.test.ts` vérifie les paliers du duplicat, badges inversés, streaks et isolation de deux clés utilisateur (`src/apps/calls/useComboXp.test.ts:30`).
- Aucun test React ne vérifie un changement de `userId`, un événement `storage`, une mutation pendant que la vue reste ouverte ou la mise à jour après `applyEvent`.
- `useNudgeLearning.ts` n'a pas de test dédié et aucun consommateur de production (`src/apps/calls/useNudgeLearning.ts:9`).

## 7. Edge cases non couverts — 17 familles

| # | Cas | Risque actuel | Fichier:ligne | Recommandation de test |
|---:|---|---|---|---|
| 1 | Changement `userId` dans un composant monté | lecture d'un autre store au prochain rendu, sans test de fuite/état affiché | `useComboXp.ts:125`, `useNudgeLearning.ts:13` | rerender user A → B → logout et vérifier isolation/absence de données A |
| 2 | Multi-device | aucune synchronisation, par design local-first | `comboXp.ts:51` | documenter explicitement le comportement, tester seulement l'isolation locale |
| 3 | Logout sur appareil partagé | données personnelles restent dans localStorage | `comboXp.ts:51`, `nudgeLearning.ts:47` | décision produit : conserver ou purge explicite ; test de politique |
| 4 | localStorage absent/refusé | XP retombe à zéro ; écriture silencieusement perdue | `comboXp.ts:59`, `comboXp.ts:76` | adapter qui lève sur getter/getItem/setItem |
| 5 | Quota plein | `applyEvent` retourne un succès non persisté | `comboXp.ts:76`, `nudgeLearning.ts:121` | setItem qui lève `QuotaExceededError`, résultat doit signaler la non-persistance |
| 6 | sessionStorage refusé | crash possible en phase régulière | `nudgeLearning.ts:165` | chaque opération storage doit lever séparément |
| 7 | Store JSON corrompu ou mauvais types | fallback partiel côté moteur, coercions côté UI duplicat | `comboXp.ts:63`, `useComboXp.ts:83`, `nudgeLearning.ts:108` | fuzz minimal : null, tableau, strings, négatifs, phase forgée |
| 8 | Date `todayParis` invalide | `RangeError` possible | `comboStreaks.ts:14` | vide, `not-a-date`, 2026-02-30 |
| 9 | Date de log invalide/future | `bestEver` faux ou crash selon l'ordre | `comboStreaks.ts:42` | invalide seule, invalide mélangée, demain |
| 10 | Frontières calendrier | risque de régression au changement mois/année/bissextile | `comboStreaks.ts:14` | 31/12→01/01, 28/02→01/03, 29/02 |
| 11 | Événement XP runtime inconnu | axe `undefined`/état incohérent | `comboXp.ts:124` | forcer donnée désérialisée hors union TS |
| 12 | Quantité XP 0/négative/fractionnaire/non finie | compteurs non monotones ou invalides | `comboXp.ts:122` | table de validation et refus explicite |
| 13 | `checkBadges` avec état incomplet/null | faux négatifs silencieux ou crash sur null | `comboBadges.ts:30` | frontière runtime avec schéma validé |
| 14 | `currentBadges` corrompu | badge déjà gagné potentiellement redécerné | `comboBadges.ts:40` | IDs inconnus, doublons, valeur non-tableau |
| 15 | Concurrence deux onglets sur XP | read-modify-write perd une mutation | `comboXp.ts:123` | deux lectures du même état puis deux écritures, vérifier absence de lost update |
| 16 | Concurrence deux onglets sur nudge | clics/rappels vus perdus, flags désynchronisés | `nudgeLearning.ts:155` | adapters intercalant deux transactions |
| 17 | Mise à jour UI même onglet | pas de subscription/rerender garanti après écriture | `useComboXp.ts:155` | rendre CommandBar ouverte, muter store, attendre affichage mis à jour |

## 8. Qualité de code et cohérence inter-fichiers

### Points propres

- `tsconfig.json:16` active `strict`, avec `noUnusedLocals` et `noUnusedParameters` (`tsconfig.json:17`).
- Aucun `any`, `@ts-ignore` ou `@ts-expect-error` dans les six fichiers moteur/hooks et les trois composants UI revus.
- Les modèles XP, badges et streaks sont courts, purs hors persistance XP et lisibles.
- `detectPaliers` centralise correctement l'ordre et les seuils dans `comboXp.ts`.

### Dettes et duplications

- **Deux modèles XP** : `comboXp.ts` est le moteur, tandis que `useComboXp.ts` se présente encore comme un « temporary local duplicate » (`src/apps/calls/useComboXp.ts:1`). Il duplique types, état vide, 18 seuils, calcul du palier, clé storage et labels.
- **Trois abstractions storage différentes** : `comboXp.ts`, `useComboXp.ts` et `nudgeLearning.ts` ont des politiques de validation/erreur divergentes (`comboXp.ts:59`, `useComboXp.ts:83`, `nudgeLearning.ts:108`).
- **Badges non transactionnels** : les badges vivent dans `ComboXp`, mais `comboBadges.ts` ne dépend pas de ce modèle ; aucun service ne fusionne/persiste le résultat.
- **Streaks sans propriétaire de persistance** : `useComboXp.ts` lit `xos-combo-streaks:<userId>` (`src/apps/calls/useComboXp.ts:79`), mais aucun fichier de production ne l'écrit.
- **Cast de confiance dans la UI** : `readJson` fusionne du JSON arbitraire puis le caste en `T` (`src/apps/calls/useComboXp.ts:88`) ; les compteurs ne sont pas validés comme nombres finis non négatifs.

Recommandation d'architecture : un module de domaine unique exporte types, seuils, normalisation et fonctions pures ; un seul repository localStorage par utilisateur gère version, transaction logique, validation et erreurs ; un hook React s'abonne à ce repository. Éviter une généralisation excessive : cette consolidation suffit pour supprimer les duplications actuelles.

## 9. Manquements UX/moteur et 5 recommandations UX

1. **Rendre la progression réelle et fraîche** — brancher le moteur aux succès réseau puis fournir un store réactif. Aujourd'hui, CommandBar et MyTrophies lisent seulement un snapshot (`CommandBar.tsx:50`, `MyTrophies.tsx:17`).
2. **Afficher les unités et la destination** — conserver les trois lignes de compteur, mais montrer par axe le prochain seuil (« Vitesse 30/75 raccourcis ») sans palier global. La UI actuelle n'affiche ni dénominateur ni progression (`CommandBar.tsx:164`).
3. **Compléter les surfaces promises** — ajouter les trois streaks simultanés à la command bar et les lignes XP/palier/badge gagné au récap. La command bar ne rend que les axes (`CommandBar.tsx:161`) et `RecapView` ne reçoit aucune donnée de gamification (`RecapView.tsx:10`).
4. **Éviter le mur vide trompeur** — la spec promet un mur jamais vide après la première séance (`docs/specs/combo-gamification-v1.md:343`), mais la UI affiche explicitement « Aucun badge » (`MyTrophies.tsx:48`). Tant que l'intégration n'est pas fiable, proposer un état explicatif ; après intégration, garantir Premier pas à la première séance.
5. **Respecter l'apprentissage sans harcèlement** — figer la cadence 5/10/30, appliquer 3 clics à L/F, arrêter immédiatement sur adoption clavier, ne jamais accepter cmd-k, et honorer le désengagement/storage indisponible. Aucun toast de nudge learning n'est aujourd'hui monté dans l'UI.

Autres manquements fonctionnels :

- Aucun kind `xp_palier_atteint`, `badge_one_timer` ou `streak_palier_atteint` n'est présent dans le code de production, malgré `docs/specs/combo-gamification-v1.md:222`.
- Aucun toggle de suivi streak n'est trouvé.
- Aucun mécanisme ne garantit l'absence de notification si les notifications sont désactivées, puisque les événements eux-mêmes ne sont pas intégrés.
- Le récap implémente rythme/record/follow-up/abandon (`src/apps/calls/RecapView.tsx:74`) mais pas le « top résultat au-dessus de la moyenne » de la spec (`docs/specs/combo-gamification-v1.md:142`).

## 10. Ambiguïtés internes de la spec à trancher

| Sujet | Contradiction | Décision recommandée |
|---|---|---|
| Impact | 10 XP/RDV (`spec:32`) mais paliers en nombre de RDV (`spec:44`) | Stocker des événements/compteurs métier, dériver les XP de présentation ou convertir tous les seuils en XP. |
| Bronze | seuil Bronze Vitesse = 10 (`spec:46`) mais « Bronze dès le premier raccourci » (`spec:405`) | Garder Bronze à 10 et afficher « progression vers Bronze » dès 1, ou ajouter un état débutant explicitement. |
| Libellé progression | exemple « Bronze · 30/75 » (`spec:42`) alors que 30 atteint Argent | Afficher « Argent · 30/75 vers Or » ou supprimer le nom atteint dans cette formulation. |
| Jour férié | reset sur toute journée vide (`spec:154`) mais streak ne casse pas un jour férié (`spec:402`) | Choisir une règle unique, calculable sans calendrier caché. |
| Nudge régulier | tableau = 10 depuis dernier nudge (`spec:183`), exemple = 5 clics de plus (`spec:196`) | Conserver 10, plus sobre, puis corriger l'exemple. |
| Intense/composites | seuil intense X ouvert et paliers composites non chiffrés (`spec:167`, question ouverte §10) | Figer `20 appels` et une table de paliers avant d'exposer les labels. |

## 11. Plan de correction recommandé

1. **P0 — Connecter le domaine** : orchestrateur post-succès, déduplication, unité Impact décidée, persistance badges/streaks, hook réactif, tests d'intégration.
2. **P0 — Corriger le nudge** : table de seuils par raccourci, total cumulatif séparé, événement d'adoption, retrait cmd-k, appels UI.
3. **P1 — Durcir les frontières** : validation runtime des événements, dates et stores ; erreurs storage non bloquantes et observables ; stratégie de concurrence.
4. **P1 — Supprimer le duplicat** : `useComboXp.ts` importe le domaine et ne contient plus de seuils/types parallèles.
5. **P1 — Finir l'UX** : streaks command bar, récap gamifié, notifications respectant les préférences, état vide cohérent.
6. **P2 — Figer la spec** : résoudre les six ambiguïtés du §10 puis transformer chacune en test d'acceptation.

## 12. Vérification

Commandes demandées :

```sh
NODE_ENV=test npm run test -- src/apps/calls/comboXp.test.ts src/apps/calls/comboBadges.test.ts src/apps/calls/comboStreaks.test.ts src/apps/calls/nudgeLearning.test.ts src/apps/calls/useComboXp.test.ts
NODE_ENV=test npm run build
```

Résultats du 2026-07-18 après `npm ci --no-audit --no-fund` :

- **Tests ciblés : succès — 5 fichiers, 59 tests passés, 0 échec** (Vitest 4.1.10, 715 ms).
- **Build : succès — `tsc --noEmit` puis Vite, 835 modules transformés**. Deux avertissements non bloquants et hors périmètre ont été émis : import dynamique inefficace dans Cleaner et chunks > 500 kB.
- `git diff --check` : succès, aucune erreur d'espace.
