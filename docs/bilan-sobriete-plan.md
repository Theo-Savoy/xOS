# Bilan — Passe sobriété UI + UX writing + évolutions fonctionnelles

Statut : **PLAN CONSOLIDÉ** (audit Grok lu, décisions Alaric prises — en attente validation Théo).
Worktree : devilish-dog (branche devilish-dog). Base : 8b68bf9 (PR #93 mergée).

## Décisions (arbitrages Alaric sur les 10 points de l'audit Grok)

| # | Décision | Choix | Justification |
|---|---|---|---|
| D1 | Couper MarketStudiesSection + marketStudies.ts | **Oui** | Théo 4. Page Marché : retirer « références externes » de la description |
| D2 | Couper ReasonsSection | **Oui** (si gain/perte par produit dans le même sprint) | Théo 5. La table globale top-8 est perdante ; le découpage produit la remplace |
| D3 | Gain/perte = motifs, volumes, les deux ? | **γ allégé** | Le plus fidèle à Théo 3+5 : motifs win+loss × 3 produits (fy + compare) ET colonne « Perdues » dans l'historique produit. Une seule nouvelle section « Gain / perte par produit » |
| D4 | Fusionner ConseilSection dans « Comparaison des produits » | **Oui** | Évite 3 vues Conseil. `ConseilSection` supprimée ; colonne Conseil dans Comparaison des produits + ligne déjà dans Historique produit |
| D5 | Compare : borner | **FY22 min, strictement < fy** | `fyRange` vide si compare > fy ; FY21 jamais. |
| D6 | market.test / diagnosis / narratif si fy ≠ FY26 ou compare ≠ FY25 | **Masquer** test p= hors (FY26, FY25) ; diagnosis/patterns masqués hors FY26 (déjà le cas) | Le test ne se recrée pas sur un couple arbitraire ; on ne mens pas |
| D7 | Scope : où ? | **Sous-titre discret par section** | Retirer badges h1/StatCard/tooltip. Adapter ReviewPages.test.tsx |
| D8 | Cartes prose Paul/Christophe | **Supprimer** (SalesComparison 132-148) | Prose sans données, noms en dur |
| D9 | Productivité si ETP absent pour compare | Empty dédié « ETP non configurés pour {compare} » | Ne pas laisser croire que les données sales manquent |
| D10 | Ordre | **Sobriété d'abord ; compare + motifs ensuite ; titres restants en dernier** | Moins de conflits de strings (audit) |

## Lots d'implémentation

### Lot 1 — Sobriété (UI/copy, effort bas, impact fort)
Fichiers : `ScopeTag`, `StatCard`, `InfoHint`, `ChartTooltip`, toutes les sections, `ReviewApp`, `ReviewPages`.
- Remplacer `ScopeTag` par un sous-titre discret `<p class="review-section-scope">` (petit, moins marqué) — **par section seulement**, pas h1/StatCard.
- Kickers redondants avec titre+scope → **supprimer** ; les définitions utiles → **InfoHint** (i).
- `StatCard.hint` : garder seulement les infos non redondantes, sinon → InfoHint.
- `InfoHint.tsx:12` : retirer `title=` (double tooltip navigateur + custom).
- Empty states : « Sélectionnez deux exercices… » → « Pas de comparaison sur cette fenêtre. » (Bridge 28, Capacity 31, Catalogue 31).
- Supprimer les kickers 0-info : Synthesis 39, Patterns 39, ProductCompare 133-135, CatalogueBridge 72-74, Capacity 76-78, MarketStudies (supprimée), Diagnosis 43-44, WinReasons 78-79, ReasonBars 19-20.

### Lot 1b — Capture Théo (tooltip cycles + carte Test + légendes) — AJOUTÉ
- **ChartTooltip allégé** : supprimer les deltas « vs période comparable » (compareLabel/deltaKeys) et le footer source « Salesforce · … » partout où c'est du bruit pour un survol (CycleSection tooltip, et le composant global). Ne garder que label + valeur + n éventuel. (La capture = tooltip Cycles FY23 : Médiane 41 j +19 j / Moyenne 106 j +12 j / « Salesforce · cycles NEW exploitables ».)
- **Retirer la StatCard « Test »** (MarketSignalSection.tsx:101-109, `p = — · deux proportions, bilatéral`) : carte sans valeur ajoutée quand p indisponible ; le test reste mentionné dans la note de la ligne (MarketSignal 205-209) ou entièrement retiré si déjà couvert.
- **Fix légendes noires illisibles** : le `<Legend />` du BarChart « Répartition des pertes NEW par offre » (MarketSignal 143-153) rend les textes en noir sur fond sombre → forcer la couleur via CSS `.recharts-legend-item-text` (couleur texte standard) — vérifier aussi les autres Legend (Performance, Cycle).
- Hints restants trop denses → réduire à l'essentiel (valeur, pas d'explications redondantes).

### Lot 2 — Coupes (études + motifs globaux)
- `MarketStudiesSection.tsx` + `marketStudies.ts` supprimés ; import retiré de `ReviewPages`.
- `ReasonsSection.tsx` supprimé ; import retiré.
- Page Marché : description « Motifs déclarés, références externes et canaux… » → « Motifs déclarés et canaux… » (ReviewPages 238-241).
- Grille Marché : WinReasons passe full-width (plus de ∥ MarketStudies).
- api : `market.js` continue de calculer loss_reasons/win_reasons globaux **mais** l'UI ne les affiche plus (pas de suppression API pour éviter les tests cassés) — ou suppression propre selon effort. Trancher à l'implémentation (faible impact : `computeMarket` reste utilisé par MarketSignal).

### Lot 3 — Fonctionnel : gain/perte par produit (+ Conseil dans motifs)
API :
- `market.js` : ajouter `conseilWon` ; `win_by_offer.conseil` (et voire `autre` si opportun) ; **new `loss_by_offer`** × {catalogue, sur_mesure, conseil} avec `reasonsTable` sur les NEW perdues par produit ; exposer `mix.conseil` (déjà calculé, droppé à l'export).
- `computeMarket(window, { fy, compare })` : currentFy = `fy` (plus préférence FY26) ; test marché calculé sur le couple donné **ou** masqué — voir D6 (garder le couple FY25→FY26 si compare ≠ FY25, sinon masquer).
Impacts types : `review.types.ts` MarketPayload : `win_by_offer` étendu + `loss_by_offer` + `mix.conseil`.
UI :
- `WinReasonsSection` → renommée « Gain / perte par produit » : 3 colonnes (Catalogue, Sur-mesure, Conseil), chacune avec win_reasons + loss_reasons (ou 2 blocs win/loss × 3 produits), `n=`, empty si n_total=0.
- `ProductHistorySection` : + colonne « Perdues » (= closed − won, NEW).
- `ConseilSection` supprimée de ProductPage (fusionné — D4).

### Lot 4 — Compare sélectionnable (UI + API)
Front :
- `review.period.ts` : `PeriodSelection` + champ `compare` ; `periodQuery` lit l'état ; `businessReviewPath` encode compare ; `periodTitle` affiche le vrai couple ; `comparisonFy` remplacé par l'état (garder fallback N-1 si non renseigné).
- `PeriodSelector.tsx` : second Select « Comparer avec : » (FY_OPTIONS, strictement < fy, min FY22, exclut fy).
- `ProductCompareSection.tsx:215` : `compare` depuis `PeriodSelection`/payload (supprimer `comparisonFy` en dur).
- `ReviewPages` ProductPage : passer `period.compare` à ProductCompare.
- Hints « N-1 » / « période comparable » → libellé réel (BridgeNew 81-86, synthesis.js:123, ChartTooltip compareLabel).
API :
- `api/review.js:252` : défaut `compare` = `comparisonFy(fy)` (plus FY25 fixe) — ou validation côté router : `compare` doit être < fy et ≥ FY22.
- `market.js` : voir Lot 3 (computeMarket reçoit fy/compare).
- `diagnosis / patterns` : masqués hors FY26 (déjà le cas) — **garder**.
- `fte-config` : ETP FY25/FY26 seulement → `ProductivitySection` : empty dédié « ETP non configurés pour {compare} » (D9).

### Lot 5 — Passe writing des titres restants (après lots 1-4, les strings bougent une fois)
Selon audit B (P1/P2), appliquer les renommages :
- Cadrage de l'exercice → **Cadrage** · Bridge NEW : décomposition volume / ticket → **Écart NEW** · Lectures structurantes de l'exercice → **Lecture** · Trajectoire NEW / RENEW → **NEW et RENEW** · Historique FY22→FY26 → **Série** · Portefeuille : quatre statuts exclusifs au 30/06 → **Portefeuille au 30/06** · Capacité commerciale : bridge Owner puis équipe active → **Écart Owner** · Bridge Owner NEW — cadrage de l'écart → **Cadrage Owner** · Comparaison sales : activité, conversion et ticket → **Paul / Christophe** (tableau) · Capacité et productivité sales (ETP) → **Productivité** · Activité par personne → **Par personne** · Activité PDG — hors classement commercial → **PDG** · Catalogue vs sur-mesure : comparaison d'exercices → **Comparaison des produits** (Théo 7) · Bridge catalogue : RENEW, volume NEW, ticket NEW → **Écart catalogue** · Cycles de vente NEW : médiane, moyenne et exclusions → **Cycles NEW** · Conseil : volumes et CA par exercice → (supprimée, D4) · Produit × exercice → **Historique produit** · Signal marché : part des pertes « marché / client » → **Pertes marché / client** · Motifs de gain déclarés par offre → **Gain / perte par produit** (Lot 3) · Acquisition et concentration → **Canaux** · Matrice de diagnostic : mesure et attribution → **Facteurs** · Qualité des données → **Qualité** · Contrats de calcul → **Définitions** · Marché & acquisition (nav) → **Marché**.
Notes dupliquées : « motifs déclarés, pas de causalité » ×5 → 1× (i de la page Marché) ; « Le bridge montre d'où vient l'écart… » ×3 → 1× ; `key_point` Synthesis 36 + Patterns 36 → 1×.
Empty « Aucun conseil » → « Pas de ventes Conseil ».

## Vérification
- `npm run test` / `npm run lint` / `npm run build` (gates repo).
- Adapter les tests existants : `ReviewPages.test.tsx:27-83` (badges h1 → supprimer asserts CA total/CA NEW), `ReviewPages.test.tsx:233-240` (interdire titres-constats — déjà une tension avec synthesis.js:171), `review.period.test.ts:56-87` (compare N-1 → état), `market.test.js:47-69` (win_by_offer étendu).
- E2E : `playwright.config.ts` (Bilan si couvert — P0 restes).

## Risques
- Comparer FY24 vs FY26 en croyant lire le test p≈0,27 → masqué (D6).
- Diagnosis −591,6 k€ (chiffre slide) → masqué hors FY26 (déjà).
- ProductCompare oublié (comparisonFy en dur) → corrigé Lot 4.
- n Conseil motifs faible → empty > graphique (géré dans WinReasons).
- Semestre + compare libre : cartes synthèse OK (même semestre N-x) ; ETP/portfolio/diagnosis annual-only — ne pas débloquer.

## Historique
- 2026-09-03 : audit Grok (agent 48d3866d) livré — rapport A-E complet /tmp/bilan_grok_audit.md + sections B/C/D/E.
- Notes d'état : docs/bilan-sobriete-audit-notes.md (relevé Alaric avant audit).