# Audit — refonte UX du Bilan (app `review`)

Audit read-only du travail en cours sur la branche `enhance-bilan-interactive`
(base : merge PR #80, `4ec5b9d`). Aucun fichier de code n'a été modifié.

**Snapshot : 3 septembre 2026, 19h00.** Le worktree était en cours d'édition
pendant l'audit (une seconde session finissait l'implémentation). Les constats
ci-dessous décrivent l'état à 19h00 ; les portes ont été repassées à cette
heure-là et sont vertes.

---

## 1. Pages

`src/apps/review/pages/ReviewPages.tsx` — **6 pages d'analyse**, plus l'outil
Partages rendu directement par `ReviewApp`.

| Page | Sections |
|---|---|
| Synthèse | `SynthesisSection` (ou `PerformanceSection` hors FY26), `BridgeNewSection`, `PatternsSection` |
| Trajectoire | `PerformanceSection`, `HistorySection`, `PortfolioSection` |
| Commercial | `CapacitySection`, `SalesComparisonSection`, `ProductivitySection`, `ActivitySection`, `LeadershipSection` |
| Produit | `ProductCompareSection`, `CatalogueBridgeSection`, `CycleSection`, `ConseilSection`, `ProductHistorySection` |
| Marché & acquisition | `MarketSignalSection`, `WinReasonsSection`, `MarketStudiesSection`, `ReasonsSection`, `ChannelsSection` |
| Diagnostic | `DiagnosisSection`, `QualitySection`, `DefinitionsSection` |

Cohérence avec le plan Performance / Commercial / Produit / Diagnostic : oui,
avec deux découpages en plus. « Performance » a été scindé en Synthèse (le
verdict) et Trajectoire (les séries et le stock catalogue) ; « Marché &
acquisition » est sorti de Diagnostic pour regrouper motifs, études et canaux.
Le découpage tient : chaque page a un objet de lecture unique et une seule
ressource dominante, ce qui permet le chargement conditionnel par page dans
`ReviewApp.tsx:102-164`.

Chaque page porte un `PageHeader` avec titre, phrase de cadrage, `ScopeTag` et
`Tag` de période. Les lectures qui n'ont de sens que sur un exercice complet
FY26 (synthèse narrative, portefeuille au 30/06, matrice de diagnostic, ratios
par ETP) sont remplacées par un `AnnualOnlyNotice` explicite au lieu d'être
masquées — c'est le bon choix : l'absence est expliquée, pas escamotée.

## 2. Annexes supprimées

Les 8 annexes ne sont **ni jetées ni orphelines** : 7 ont été renommées en
sections de plein droit et une a été fusionnée. Diff ligne à ligne effectué,
le contenu est repris à l'identique.

| Annexe supprimée | Devenue | Écarts |
|---|---|---|
| `ActivityAnnex` (A3) | `sections/ActivitySection.tsx` | titre dé-annexé, table `--wide` |
| `JeromeAnnex` (A2) | `sections/LeadershipSection.tsx` | titre dé-annexé |
| `ReasonsAnnex` (A6) | `sections/ReasonsSection.tsx` | titre dé-annexé |
| `DefinitionsAnnex` (A1) | `sections/DefinitionsSection.tsx` | titre dé-annexé |
| `HistoryAnnex` (A4) | `sections/HistorySection.tsx` | libellé FY22→`data.fy` au lieu de FY26 en dur |
| `ProductFyAnnex` (A5) | `sections/ProductHistorySection.tsx` | filtre `['FY24','FY25','FY26']` en dur retiré, série complète FY22→`data.fy` |
| `QualityAnnex` (A8) | `sections/QualitySection.tsx` | titre dé-annexé |
| `CampaignsAnnex` (A7) | fusionnée dans `sections/ChannelsSection.tsx` | table canaux complète (le top-N tronqué a sauté) + bloc concentration |

Bonus notable : `ProductHistorySection` et `HistorySection` ne codent plus les
exercices en dur, ce qui les rend compatibles avec le sélecteur FY22→FY26.
`ChannelsSection` n'applique plus `n_displayed` et affiche `n_total` canaux —
cohérent avec la disparition de l'annexe « campagnes complètes ».

Le répertoire `src/apps/review/sections/annexes/` reste présent sur disque,
vide.

## 3. Semestre

**FY26 = 01/07/2025 → 30/06/2026, S1 = juil→déc, S2 = jan→juin : correct des
deux côtés.**

Le calcul est **backend**, le frontend ne fait que l'affichage et la requête.

- `api/_review/semester.js:11` — `semesterBounds(fyInt, semester)` compose les
  bornes à partir de `quarterBounds` existant (Q1→Q2 pour S1, Q3→Q4 pour S2)
  au lieu de recalculer des dates. Bon réflexe : une seule source de vérité
  pour le calendrier fiscal.
- Le filtrage porte sur la bonne date métier par flux : `CloseDate` pour
  `won`/`closed`, `CreatedDate` pour `created` (`semester.js:33-41`),
  `ActivityDate` pour les RDV (`semester.js:57`). Les clés FY sont conservées,
  donc les comparatifs N-1 restent alignés semestre à semestre.
- `api/review.js:100-113` — `withSemester` / `eventsWithSemester` s'appliquent
  après le fetch, sur la fenêtre, avant tout `compute*`. Aucune fonction de
  calcul n'a été touchée : le semestre est un filtre d'entrée, pas une
  seconde implémentation.
- `api/review.js:262-271` — semestre invalide → 400 `invalid_semester` ;
  semestre sur `portfolio` / `diagnosis` / `synthesis` → 400
  `annual_only_resource`. Le frontend ne demande jamais ces ressources en mode
  semestre (`ReviewApp.tsx:101,152-164`), la garde backend est la ceinture.
- `src/apps/review/review.period.ts` — bornes dupliquées côté front, mais pour
  un usage différent (afficher « 01/07/2025 → 31/12/2025 » dans le sélecteur),
  pas pour filtrer des données. Duplication acceptable, couverte par test des
  deux côtés.

## 4. ChartTooltip

`src/apps/review/components/ChartTooltip.tsx` — `GlassCard` + `Tag` + `ScopeTag`
du repo, aucune primitive réinventée. Il porte le périmètre (R5) et la source
de la donnée dans le tooltip lui-même, plus un delta optionnel vs période
comparable via `deltaKeys`.

Branché sur les 5 graphes de l'app :

- `sections/PerformanceSection.tsx:112`
- `sections/CycleSection.tsx:119`
- `sections/MarketSignalSection.tsx:132` et `:178`
- `components/WaterfallChart.tsx:83`

`RECHARTS_TOOLTIP_CHROME` neutralise le fond blanc natif de Recharts. Il est
appliqué sur 4 des 5 points de branchement — voir §12.

## 5. Recharts natifs restants

`grep -rn '<Tooltip' src/apps/review/ --include='*.tsx' | grep -v ChartTooltip.tsx`
remonte 5 occurrences, **toutes avec `content={<ChartTooltip …>}`**. Aucun
tooltip Recharts par défaut ne subsiste ; les `<Tooltip>` restants sont le
conteneur Recharts obligatoire, pas un rendu natif.

## 6. Fonctions Vercel

8 fonctions, inchangé :

```
api/auth.js  api/calls.js  api/cleaner.js  api/dialer.js
api/index.js api/launcher.js api/perf.js  api/review.js
```

Le semestre est passé en `?semester=` sur `api/review.js` et la logique vit
dans `api/_review/semester.js` (préfixe `_`, non déployé comme fonction).
Aucun nouveau `api/<nom>.js`. Plafond Hobby respecté.

## 7. Ressources `api/review.js`

13 ressources, toutes présentes : 11 business (`overview`, `bridge`, `product`,
`cycles`, `commercial`, `market`, `portfolio`, `channels`, `diagnosis`,
`synthesis`, `quality`) + 2 settings (`fte-config`, `definitions`). Aucune
suppression. Aucune ressource ajoutée pour le semestre — c'est un paramètre de
requête, pas une resource : bon appel, ça évite de doubler la surface API.

12 des 13 sont consommées par le front. `fte-config` ne l'est pas — situation
antérieure à cette refonte (déjà le cas à `HEAD`), hors périmètre.

## 8. Portes

Passées à 19h00 sur l'état courant du worktree :

| Porte | Résultat |
|---|---|
| `npm run test` | **156 fichiers, 1337 tests, 0 échec** |
| `npm run lint` | **0 erreur, 36 warnings** |
| `npm run build` | **vert** (`tsc --noEmit` + `vite build`) |

Note de méthode : à 18h56, tests et build étaient rouges (5 échecs, 3 erreurs
TS2305 sur `fyBounds` / `semesterBounds` / `periodRangeLabel`). Il ne s'agissait
pas d'un défaut mais d'un cycle TDD en cours : les tests étaient écrits avant
l'implémentation, arrivée quelques minutes plus tard. Les 36 warnings de lint
sont le fond de warnings du repo (`no-restricted-syntax` sur `<button>` natifs)
plus un nouveau, cf. §12.

## 9. Tests nouveaux

Les 4 fichiers sont cohérents et passent.

- `api/_review/semester.test.js` — vérifie les bornes S1/S2 en dates absolues,
  le filtrage par date métier propre à chaque flux, et le filtrage des RDV sur
  `ActivityDate`. Les cas limites sont testés aux bornes exactes (`2025-12-31`
  vs `2026-01-01`), ce qui est le seul endroit où le bug aurait pu se loger.
- `src/apps/review/review.period.test.ts` — bornes FY, découpe semestrielle,
  libellé de plage inclusif (30/06, pas 01/07), comparatif N-1, et l'URL API
  produite.
- `src/apps/review/components/PeriodSelector.test.tsx` — bascule FY↔semestre,
  conservation de l'exercice au changement de mode, options FY22→FY26,
  affichage des bornes.
- `src/apps/review/components/ChartTooltip.test.tsx` — rendu complet (valeur,
  scope, delta, source), non-rendu quand inactif, neutralisation du chrome
  Recharts.

Côté API, `api/review.test.js` a gagné les deux cas de refus : semestre
invalide et semestre sur ressource annuelle.

## 10. Conservation et scopes (R3 / R5 / R11)

Conformes.

- **R3** — `ConservationBadge` présent dans 22 des 24 sections. Les deux
  exceptions sont `LeadershipSection` (lecture PDG hors classement, sans
  payload `conservation` — déjà le cas dans `JeromeAnnex`) et `SharedSection`
  (outil, pas d'analyse). Aucun payload n'a perdu son champ `conservation` :
  les `compute*` n'ont pas été touchés.
- **R5** — `ScopeTag` dans 24 sections sur 24 (hors `SharedSection` et le
  fichier de test). Il est en plus remonté au niveau des titres de page via
  `PageHeader`, et **dans le tooltip lui-même** — le périmètre survit désormais
  au survol d'un graphe, ce qui va au-delà de la règle.
- **R11** — `ConseilSection` inchangée, toujours branchée sur `ProductPage`.

Le filtrage semestriel s'applique en amont des `compute*`, donc les invariants
`total == NEW + RENEW` sont recalculés sur la fenêtre filtrée : la conservation
reste vraie période par période.

## 11. Sections orphelines

**Aucune.** Les 24 sections du disque sont toutes importées par
`pages/ReviewPages.tsx`, à l'exception de `SharedSection`, importée
directement par `ReviewApp.tsx:33`. Rien à supprimer.

Seul reliquat : le répertoire vide `src/apps/review/sections/annexes/`.

## 12. Retouches mineures

Aucun piège bloquant : pas d'export manquant, pas d'import cassé, pas de
section référencée-mais-supprimée, pas de ressource API perdue. Reste quatre
points cosmétiques.

1. **`src/apps/review/sections/MarketSignalSection.tsx:132`** — ce `<Tooltip>`
   est le seul des cinq à ne pas recevoir `{...RECHARTS_TOOLTIP_CHROME}`. Le
   `GlassCard` s'affichera sur le fond blanc par défaut de Recharts. Fix :
   ajouter le spread, comme ligne 179.
2. **`src/apps/review/sections/CapacitySection.tsx:137-139`** — la note affiche
   « ETP sales : X → Y » y compris en mode semestre, où le CA de la table est
   semestriel alors que l'ETP reste annuel. Fix : préciser « ETP annuels » dans
   la note, ou masquer la phrase hors mode FY.
3. **`src/apps/review/sections/annexes/`** — répertoire vide à supprimer du
   disque (git ne le suit pas, mais il traîne dans l'arborescence).
4. **`src/apps/review/components/ChartTooltip.tsx:17`** — l'export de
   `RECHARTS_TOOLTIP_CHROME` à côté du composant déclenche un warning
   `react-refresh/only-export-components` (c'est le 36e warning, les 35 autres
   préexistaient). Assumable : sortir la constante dans un fichier dédié
   coûterait plus qu'il ne rapporte. À laisser, sauf si la politique du repo
   est zéro nouveau warning.

Point d'observation, pas un défaut : `api/review.js` renvoie désormais un objet
`period` dans chaque payload business, que le front ne type ni ne consomme.
Utile au débogage et aux analyses partagées ; à typer dans `review.types.ts`
s'il doit servir à l'affichage, à laisser tel quel sinon.

---

## Verdict — A : cohérent, portes vertes, feu vert pour commit et push

La refonte tient sur les trois axes qui comptent. Le découpage en 6 pages
remplace une transposition slide-par-slide par une navigation dont chaque
page a un objet de lecture propre. Aucun contenu n'a été perdu : les 8 annexes
sont intégrées, vérification faite ligne à ligne, et deux d'entre elles y
gagnent la fin de leurs exercices codés en dur. Le semestre est calculé
côté backend, réutilise `quarterBounds` existant, filtre la bonne date métier
par flux, et refuse explicitement les lectures qui n'ont pas de sens en
infra-annuel plutôt que de les servir fausses.

Les règles du plan sont respectées : conservation recalculée sur la fenêtre
filtrée, périmètre visible jusque dans les tooltips, contrainte des 8 fonctions
Vercel tenue en passant le semestre en paramètre de requête.

Les quatre retouches du §12 sont cosmétiques et peuvent suivre dans un commit
séparé. Seule la première (§12.1) a un effet visible à l'écran.
