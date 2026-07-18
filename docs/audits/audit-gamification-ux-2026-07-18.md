# Audit UX — Gamification Combo & Nudges (V1)

**Périmètre** : audit read-only, aucun code modifié.
**Réfs** : `docs/specs/combo-gamification-v1.md` (spec), code sous `src/apps/calls/`.
**Note méthodo** : `AGENTS.md` n'existe pas dans ce repo au moment de l'audit — les critères "règles UX du repo" ont été dérivés de la spec (§0, §1.6) et des conventions observées dans `calls.css` (tokens `--xos-*`).

---

## Constat principal (à lire avant le détail)

Le modèle de données (XP, badges, streaks, machine d'état du nudge d'apprentissage) est **entièrement écrit et testé** (`comboXp.ts`, `comboBadges.ts`, `comboStreaks.ts`, `nudgeLearning.ts`), mais **la quasi-totalité n'est câblée à aucun événement réel de l'app** :

- `comboXp.ts`, `comboBadges.ts`, `comboStreaks.ts` portent l'en-tête `Pas d'UI, pas de notifs` — et de fait, `applyEvent()` / `checkBadges()` ne sont appelés **nulle part** en dehors de leurs propres tests. Aucun raccourci pressé, aucun RDV planifié, aucun jour loggué n'incrémente l'XP réelle.
- Le lecteur utilisé par la Command Bar et "Mes réussites" (`useComboXp.ts`) est un doublon explicitement marqué `// ponytail: temporary local duplicate ... pending the feat-gam-a-models merge` — il lit les mêmes clés `localStorage`, qui ne sont jamais écrites par un flux utilisateur réel.
- `useNudgeLearning()` (nudge d'apprentissage, §2.5) n'est importé/appelé par **aucun composant** — la machine d'état est correcte et testée, mais aucun bouton du runner n'appelle `onMouseClick()`. Le toast "Tu peux passer au contact suivant avec `K`" ne s'affiche donc jamais.
- `DesktopToasts.tsx` (`isToastNotification`) ne connaît que les kinds `session_goal_hit` et `goal_reaction` — aucun des kinds gamification (`xp_palier_atteint`, `badge_one_timer`, `streak_palier_atteint`) prévus en spec §3.1 n'existe.

**Conséquence pour l'utilisateur final aujourd'hui** : ouvrir la command bar ou "Mes réussites" affichera des compteurs à zéro indéfiniment, quel que soit le volume d'appels passés. La gamification est un moteur non branché, pas un produit fini.

---

## Notation par nudge (terrain / sobriété / actionnable / découvrable, sur 10)

| # | Nudge | Terrain | Sobriété | Actionnable | Découvrable | **Score global** |
|---|---|---|---|---|---|---|
| 1 | Cadrage pré-séance (§2.1) | — | — | 0 | 2 | **1/10** |
| 2 | Saisie / chips MEDDIC lite (§2.2) | 8 | 8 | 6 | 7 | **6/10** |
| 3 | Fin de séance / RecapView (§2.3) | 8 | 9 | 6 | 8 | **6/10** |
| 4 | Streak command bar (§2.4) | — | — | 1 | 0 | **1/10** |
| 5 | Apprentissage progressif (§2.5) | — | — | 0 | 0 | **0/10** |

**Moyenne des 5 nudges : 2,8/10.**

Les cases "—" signifient que le nudge n'a pas de rendu visible à juger sur ce critère (rien n'est affiché).

---

## Détail par nudge

### 1. Nudge de cadrage (pré-séance) — `PreSessionFlow.tsx`

**Verdict : absent.** J'ai lu l'intégralité du composant : c'est un launch-gate à 3 phases (Matière → Cap → Départ), sans aucune référence aux rappels dus, à l'ancienneté de la dernière séance, ou à un défi collectif.

- Pas d'encart "Commence par les rappels : X dûs aujourd'hui" avec lien direct.
- Pas de message "Ça fait une semaine — on reprend avec tes presets ?".
- Le compteur de rappels existe bien ailleurs — `SessionsView.tsx` affiche un badge `Rappels {recallCount}` sur l'onglet — mais c'est un badge de navigation permanent, pas un nudge contextuel au moment de lancer une séance. Un utilisateur qui lance une séance "Nouvelle cible" depuis le hub ne voit jamais le nudge décrit en §2.1 à cet endroit précis.
- Le défi collectif est correctement absent (conforme à §6 — Arena non livrée), donc rien à reprocher sur ce point précis.

Le seul point positif : le wording de `PreSessionFlow.tsx` lui-même est propre et terrain ("Cap de la séance", "Objectif verrouillé au départ", "Prépare le premier appel") — aucun jargon type "engagement"/"audience". Mais comme le mécanisme cible du §2.1 n'existe pas dans ce fichier, il n'y a rien à noter positivement sur le critère "nudge".

### 2. Nudge de saisie — `RunnerView.tsx` + `formControls.tsx`

**Implémenté, mais non conforme à la spec sur deux points.**

- `NoteTemplateChips` (formControls.tsx:133) affiche `NOTE_TEMPLATE_CHIPS`, une liste **plate de 12 chips**, injectée sans aucun paramètre de contexte : `<NoteTemplateChips value={comments} onChange={setComments} />` (RunnerView.tsx:2085) — le composant ne reçoit jamais `resultat`/`outcome`.
  - Spec §2.2 : "5 chips cliquables ... contextualisés par résultat". Ici : 12 chips, toujours les mêmes, quel que soit le résultat sélectionné (RDV planifié, NPA, pas décroché…).
- Comportement correct sur le reste : le clic ajoute le tag avec virgule (`appendNoteChip`), pas de wizard/popover, et les chips ne s'affichent que si le commentaire est vide (conforme au critère d'acceptation §7.2 point 8).
- Terrain : les libellés eux-mêmes ("Décision ce trimestre", "Champion identifié") sont fidèles à la spec et ne fuient pas le jargon MEDDIC vers l'UI.

### 3. Nudge de fin de séance — `RecapView.tsx`

**Bien exécuté sur le ton, incomplet sur le contenu.**

Points forts :
- Les 4 fonctions (`computePaceNudge`, `computeRecordNudge`, `computeFollowUpNudge`, `computeAbandonedNudge`) respectent strictement la règle de sobriété : aucune formulation négative, pas de "tu n'as pas battu ton record". Le fallback "Tu es dans ta moyenne, X appels/min" applique bien le principe "si dans la moyenne, on l'affiche aussi, pas de frustration".
- Le nudge "séance 2" est actionnable : un formulaire (nom + date + bouton "Préparer la relance") apparaît directement sous le nudge dès que `followUpCount > 0`.

Écarts :
- **La ligne XP/palier/badge de séance est absente.** Spec §1.6 : "Récap de séance → 1 ligne par axe + palier actuel + badge one-timer gagné dans la séance". `RecapView.tsx` n'importe ni `useComboXp` ni aucun résumé combo — j'ai relu le fichier en entier, rien.
- Le "Top résultat" (`% appels décrochés — au-dessus de ta moyenne`) décrit en spec comme une ligne distincte n'est pas implémenté : `computeRecordNudge` conflate un fallback sur le débit d'appels/min à la place, ce n'est pas la même métrique que le taux de décroché vs médiane des 4 dernières séances.

### 4. Nudge de streak — `CommandBar.tsx`

**Absent du rendu, alors que le calcul existe.** La command bar affiche bien les 3 axes XP (`xp.axes`) et le dernier badge (`xp.lastBadge`), mais **aucune ligne streak** ("🔥 14 jours") n'apparaît — j'ai relu le fichier entier, il n'y a pas de `summarizeComboStreaks` importé dans `CommandBar.tsx`. Le modèle `comboStreaks.ts` existe et est testé, mais rien ne l'affiche à l'endroit prescrit par la spec §2.4.

Par ailleurs le toggle opt-in "Suivi du streak (recommandé)" mentionné en §2.4 n'existe dans aucune préférence Combo trouvée dans le code (`comboSoundPrefs.ts` ne couvre que les sons).

### 5. Nudge d'apprentissage — `nudgeLearning.ts` / `useNudgeLearning.ts`

**Mort dans le code.** La machine d'état (phases intensive → régulière → espacée → acceptée, seuils 5/10/30 clics, arrêt après 3 rappels vus) est correctement implémentée et couverte par `nudgeLearning.test.ts`. Mais :

- `useNudgeLearning(` n'apparaît dans aucun fichier `.tsx` du dossier `calls/` en dehors de sa propre définition.
- Aucun des boutons cibles listés en spec (Suivant/`K`, Précédent/`J`, Vue liste/`L`, Vue fiche/`F`, Logguer & suivant/`⌘↵`, Aide/`?`, résultats `1`-`5`) n'appelle `onMouseClick()`.
- Résultat : aucun utilisateur ne verra jamais le toast "Tu peux passer au contact suivant avec `K` — c'est 0,3s au lieu de 0,8s à la souris."

C'est le lot que la spec elle-même désigne comme "le plus risqué côté UX" (§8, lot G.4) — actuellement il est simplement absent de l'expérience.

---

## Cohérence visuelle

- **Tokens** : conforme. `calls-chip`, `calls-cmdk__xp`, `calls-trophies`, `calls-recap-nudges` utilisent tous `var(--xos-*)` / `color-mix(in srgb, var(--xos-accent) ...)`. Aucune couleur hardcodée type orange/coral trouvée dans les blocs liés à la gamification.
- **Hiérarchie Bronze → Challenger** : non lisible visuellement. `MyTrophies.tsx` et `CommandBar.tsx` affichent le palier en texte brut (`Vitesse · 30 · Bronze`), sans code couleur ni icône différenciée entre Bronze et Challenger — un utilisateur ne perçoit pas la progression d'un coup d'œil, il doit lire le mot.
- **Tooltips / explications sur badges manquants** : absents. `MyTrophies.tsx` liste uniquement les badges déjà débloqués (`badges.length === 0 ? "Aucun badge débloqué pour l'instant." : ...`) — aucune liste des badges restants à débloquer avec leur critère ("🎯 Trois banderilles : 3 RDV dans une même séance"). Le user profile demande explicitement d'expliquer pourquoi/comment débloquer — ce n'est pas fait.

---

## Liste des problèmes par sévérité

### Bloquant
1. **Moteur XP/badges/streaks jamais invoqué depuis l'UI réelle** — `comboXp.ts`/`comboBadges.ts`/`comboStreaks.ts` ne sont appelés par aucun handler d'événement (raccourci, RDV, log du jour). L'XP affichée reste à zéro en usage réel.
2. **Nudge d'apprentissage totalement débranché** — `useNudgeLearning` n'est appelé par aucun composant ; aucun toast d'apprentissage clavier n'apparaît jamais.
3. **Aucun toast de déblocage** — `DesktopToasts.tsx` ne reconnaît pas les kinds `xp_palier_atteint`/`badge_one_timer`/`streak_palier_atteint` ; le "bon moment" de célébration prévu §1.6 n'existe pas.
4. **Nudge de cadrage pré-séance absent** — pas d'encart rappels dus / reprise après 7 jours dans `PreSessionFlow.tsx`.
5. **Tag streak absent de la command bar** — `CommandBar.tsx` n'affiche que les 3 axes XP, jamais les streaks (🔥/🎯/⚡), contrairement à §2.4.

### Gênant
6. **Chips de note non contextualisées et en excès** — 12 chips fixes au lieu de 5 max contextualisés par résultat d'appel (§2.2).
7. **Récap de séance sans ligne XP/badge** — la célébration sobre post-effort prévue en §1.6 pour le récap n'est pas rendue.
8. **Métrique "Top résultat" non implémentée** — seul un fallback approximatif sur le débit d'appels/min tient lieu de comparaison au taux de décroché.
9. **Pas d'explication des badges à débloquer** — "Mes réussites" ne montre que l'acquis, jamais le critère des badges restants.
10. **Pas de hiérarchie visuelle des paliers** — Bronze et Challenger rendus de façon identique (texte brut).

### Nice-to-have
11. **Pas de toggle opt-in streak** dans les préférences (§2.4 prévoit un toggle par défaut ON).
12. **`useComboXp.ts` est un doublon temporaire marqué `ponytail:`** en attendant un merge de modèle — risque de divergence à surveiller si le vrai moteur (`comboXp.ts`) est branché sans supprimer ce doublon.

---

## Recommandations concrètes

1. **Câbler le moteur avant tout le reste.** Sans ça, aucune des notations ci-dessus ne peut s'améliorer côté utilisateur réel : appeler `applyEvent()`/`checkBadges()`/les fonctions de `comboStreaks.ts` depuis les handlers existants (pression raccourci clavier, `outcome === "RDV planifié"` + log réussi, jour calendaire avec ≥1 log). Une fois fait, supprimer le doublon `useComboXp.ts` et faire lire Command Bar / MyTrophies directement depuis `comboXp.ts`/`comboBadges.ts`/`comboStreaks.ts`.
2. **Brancher `useNudgeLearning`** sur les boutons Suivant/Précédent/Vue liste/Vue fiche/Logguer & suivant/Aide/résultats — c'est le lot que la spec elle-même juge le plus critique (G.4), et c'est actuellement le moins avancé malgré un modèle prêt.
3. **Étendre `isToastNotification`** dans `DesktopToasts.tsx` pour les 3 kinds célébratoires, avec mapping icône/texte, afin que le "bon moment" du déblocage existe réellement.
4. **Ajouter l'encart nudge de cadrage** dans `PreSessionFlow.tsx` (ou en amont, dans le hub avant lancement) : condition sur `recallCount` déjà disponible dans `CallManagerApp.tsx` (`recallCount` existe déjà, juste pas relié au pré-lancement).
5. **Ajouter la ligne streak** dans `CommandBar.tsx` en réutilisant `summarizeComboStreaks` (déjà utilisé par `MyTrophies.tsx` — copier le pattern).
6. **Contextualiser les chips par `resultat`** : passer `outcome` à `NoteTemplateChips` et filtrer à 5 chips max pertinents (ex. si "RDV planifié" → maturité/temporalité ; si "Pas décroché" → rien ou message court).
7. **Ajouter la ligne XP/badge au récap** (`RecapView.tsx`) en diffant l'XP avant/après séance, conforme à §1.6.
8. **Différencier visuellement les paliers** — un jeu de couleurs/icônes croissant (ex. teinte accent plus saturée par palier, via `color-mix` existant) plutôt que du texte plat, et lister les badges restants avec leur critère dans `MyTrophies.tsx`.

---

## Ce qui fonctionne bien (à ne pas casser)

- Le ton du récap de séance respecte scrupuleusement la règle anti-moralisation.
- Les tokens couleur sont proprement utilisés partout, aucune dérive vers des couleurs hardcodées.
- Le wording du launch-gate pré-séance (`PreSessionFlow.tsx`) et de la recherche de comptes (`AccountSearchView.tsx`, `NewSessionView.tsx`) a déjà adopté le vocabulaire terrain recommandé en §4 ("Comptes précis (ABM)", "Aperçu : N séances").
- Les chips de note ne s'affichent que si le commentaire est vide — comportement exactement conforme au critère d'acceptation.
