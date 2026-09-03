# Bilan — Passe 2 : produit sélectionnable + nettoyage UX writing + canaux

Statut : **PLAN PASSE 2** — après livraison passe 1 (PR #96 mergée cdc51c4, passe sobriété + compare).
Base : `origin/main` (46242e4). Worktree devilish-dog aligné sur origin/main, branche distante supprimée.

## Diagnostic RDV Paul Rathouin (clos — pas un bug app)
- Chaîne vérifiée : `soql.js eventsForFy` (tous events, filtre RDV en JS `isRdvEvent` /rdv/i) → `fetchEventsWindow` → `aggregatePeople` (rdv = count, weekSet = semaines distinctes, rdvPerWeek = rdv/weeks) → `finalizePerson` → `ActivitySection` affiche `person.rdv` / `person.weeks` / `person.rdvPerWeek`.
- Aucun bug d'extraction/calcul/affichage. 5 RDV / 5 semaines = 5 events RDV réels sur 5 semaines distinctes (ou périmètre Salesforce ≠ snapshot Excel 21/07/2026 — déjà signalé par `RDV_LIMIT`).
- **Conclusion** : données absentes/réduites côté Salesforce, pas côté app. Pas de correctif code. Option produit (hors scope) : challenger la saisie RDV côté SF.

## Portée passe 2 (remarques Théo)

### P2-1. Produit : waterfalls + écart par produit, sélectionnables (onglets)
- **Objectif** : ne plus avoir « Waterfall catalogue FY25→FY26 » figé ; pouvoir choisir le produit (Catalogue / Sur-mesure / Conseil) pour :
  - le **waterfall** (Bridge NEW volume/ticket ? et surtout le waterfall catalogue RENEW/volume/ticket),
  - les **StatCards « Écart catalogue »** (Delta RENEW / Volume NEW / Ticket NEW / Total).
- **Implémentation** : dans `CatalogueBridgeSection` (ou un composant dédié), ajouter un sélecteur à onglets (3 produits) qui pilote :
  - le titre du waterfall (dynamique : `Écart {produit} {compare} → {fy}`, pas d'année en dur),
  - les données affichées (si l'API expose `catalogue` + `sur_mesure` + `conseil` pour le bridge).
- **API** : vérifier ce que `bridge.js` `catalogueBridge` calcule (actuellement `catalogue` seulement ?). Si seulement catalogue, étendre `catalogueBridge` (ou un `bridgeByProduct`) pour produire `{ catalogue, sur_mesure, conseil }` (RENEW/volume/ticket/total par produit). Conserver la rétrocompat (le champ `catalogue` reste).
- **UI** : un sélecteur (3 onglets) ; pas de titre d'année en dur ; titres : « Écart catalogue », « Écart sur-mesure », « Écart conseil ».

### P2-2. Comparaison des produits → « Vue globale par produit » + un seul tableau
- Titre actuel « Comparaison des produits » (renommé en passe 1) : Théo dit « le titre est pas bon, c'est vue globale par produit ».
- **Renommer** : « Vue globale par produit ».
- **3 tableaux → 1 seul avec sélecteur** : au lieu de 3 colonnes côte à côte (Catalogue / Sur-mesure / Conseil), un **seul tableau** avec un sélecteur de produit (ou une ligne par produit). Format : indicateurs (Fermées NEW, Signatures NEW, Closing, CA NEW, Ticket NEW, Cycle méd., Cycle moy.) × produit sélectionné, avec colonnes `{compare}` / `{fy}`.

### P2-3. Historique produit illisible → retravailler
- `ProductHistorySection` : tableau « Produit × exercice » (renommé « Historique produit ») avec colonne « Perdues » ajoutée. Trop dense/illisible.
- **Retravailler** : simplification (moins de colonnes ?), meilleur espacement, regroupement lisible par produit, suppression de l'en-tête redondant « Produit · FY » si inutile. Objectif : lisible d'un coup d'œil, même sens que passe 1 (sobriété).

### P2-4. Légende « Répartition des pertes NEW par offre » → noir à corriger
- Graph MarketSignal : la **légende verticale à gauche** (les noms d'offres Global/Catalogue/Sur-mesure sur l'axe Y ou la légende) est **noire**, illisible sur fond sombre.
- **Cause probable** : le `YAxis`/`Legend` de ce BarChart utilise une couleur par défaut (pas forcée), contrairement aux axes forcés en `var(--xos-text-secondary)`. À corriger (tick fill sur YAxis, et/ou Legend).
- Vérifier aussi les autres graphiques (Performance, Cycle, Canaux si ajouté).

### P2-5. Narratif nettoyé (compare sélectionnable ⇒ supprimer les conclusions figées)
- « Le test FY25→FY26 ne prouve pas l'aggravation… » (MarketSignal 205-209) : **supprimer** (couple figé, incohérent avec compare libre).
- Toute conclusion narrative figée (patterns, verdict, notes « le signal domine… ») : **retirer ou neutraliser** quand le couple affiché ≠ FY25→FY26 (déjà masqué côté test p, mais la note restait). Garder l'option « intégrer des commentaires à terme » en tête, mais **version épurée maintenant** : pas de phrase de conclusion qui suppose un couple précis.
- Conserver les disclaimers factuels (RDV_LIMIT, attribution) mais pas les lectures conclusives.

### P2-6. Concentration clients : Top 15
- `CONCENTRATION_TOP_N = 5` (channels.js:12) → **15** pour remplir la card.
- Impact : `top5_pct` (StatCard « Top 5 ») → renommer en top-N dynamique ou top15 ; `n_displayed` = min(15, len) ; UI « Top 15 sur n ». Vérifier types (`concentration.topN_pct`?) et UI (ChannelsSection 48-56).

### P2-7. Graphique canaux de vente
- Ajouter un graphique pour les canaux (actuellement table ChannelsSection). Type : barres par canal (CA, signatures, closing ?) avec sélecteur de métrique ou stacked. Source : `computeChannels` (channels.js) — `channels.items` (label, closed, won, amount, closing, closing_pct).
- UI : remplacer/augmenter la table par un graphique simple (barres CA ou signatures par canal), cohérent charte (axes forcés, tooltip allégé).

### P2-8. UX writing : « Canaux NEW » majuscules + tout en français
- Audit des libellés : « Canaux NEW » (et autres « NEW »/« RENEW » en majuscules dans les titres/labels) → **français** : « Canaux », « Nouvelles affaires » ou libellé métier cohérent. Passer en revue tous les titres/labels/notes pour remplacer les anglicismes/majuscules par du français propre.
- Règle : tout texte visible en français, majuscules seulement pour les sigles réellement courants (CA, ETP, SDR, PDG, FY, SOQL en note technique). « NEW »/« RENEW » → libellés français (ex. « Nouvelles affaires » / « Renouvellements », ou contexte « Signatures »).
- Attention à rester cohérent avec l'API (labels produits restent catalogue/sur_mesure/conseil côté data, mais l'affichage français).

### P2-9. Chasse aux éléments en dur → tout dynamique (inventaire vérifié)
Objectif : plus aucune année/période/conclusion codée en dur quand un couple est sélectionnable. **Inventaire réel (lu dans le code) :**

**A. Front — années/périodes en dur**
- `HistorySection.tsx:25`, `PerformanceSection.tsx:37`,`CycleSection.tsx:45` : empty states `seriesSpanLabel('FY22','FY26',…)` → **dynamique** (fenêtre depuis `data.fy`/`data.period`, pas `FY22→FY26` figé).
- `PerformanceSection.tsx:95-96` : chart title `Série empilée FY22→${data.fy}` → dynamique (borne basse = première année de la série, pas FY22).
- `ReviewPages.tsx:85,117,147,240` : `period.fy === 'FY26'` pour gating portfolio/diagnosis/productivity/narrative → **constantes** (ex. `ANNUAL_ONLY_FY = 'FY26'`) ou dériver de la config (le narratif reste FY26 tant que l'IA n'est pas active, mais la vérification doit être centralisée).
- `ReviewApp.tsx:98` : `referenceFy` même pattern.
- Notes « Les ratios par ETP exigent FY25 et FY26 complets. » (162) → libellé dynamique (les années de la config ETP) ou neutralisé.
- Commentaire `ReviewApp.tsx:2` « Business Review FY26 » → neutre.

**B. API — défauts FY/FY25/FY26 dans les computes**
- `channels.js:58 computeChannels(window, fy='FY26')` ; `commercial.js:248-249 (fy/compare defaults FY26/FY25)` ; `quality.js:24` ; `portfolio.js:79,154` ; `overview.js` (commentaire) ; `market.js:206,217-231,255` (currentFy FY26, test FY25→FY26, conclusion figée) ; `diagnosis.js:18-22` (share FY26, cycles FY26, fte FY25/FY26) ; `synthesis.js:171` (titre « NEW et RENEW reculent ensemble » + verdict) — **tous** doivent recevoir `fy/compare` explicites (déjà le cas pour market via options ; à généraliser) et ne plus retomber sur des constantes FY quand la sélection est ailleurs.
- `synthesis.js:69,171` : narratif (patterns/verdict) calé FY26 → **neutraliser** (retirer les conclusions figées ; garder un payload vide ou générique tant que l'IA n'est pas branchée — voir P2-10).

**C. FTE** : `fte-config.js:8-9 DEFAULT_FTE` FY25=4.17/2.0, FY26=2.0/1 → c'est de la config, pas un hardcode à supprimer, mais le gating/notes doivent lire la config, pas les années en dur.

**D. Règle** : tout titre/label/note/empty state qui dépend d'un couple → construit depuis les données (compare/fy/period), jamais d'année littérale. Centraliser les constantes (ex. `ANNUAL_ONLY_FY`) dans `review.period.ts`.

### P2-10. Préparer l'IA + commentaires — désactivé mais structuré
- **Ne pas ajouter de table maintenant** (YAGNI) : `shared_analyses.note` existe déjà pour le partage.
- **Structurer le payload** pour qu'une future brique IA/commentaires s'ajoute sans refonte :
  - ajouter un champ explicite `analysis` (= `{ status: 'none' }` par défaut) dans les payloads de sections — désactivé, documenté comme slot futur (commentaire IA par section/page) ;
  - garder les `InfoHint` (le « i ») comme emplacement futur pour le commentaire/analyse de section ;
  - ne rien afficher tant que `status: 'none'` (aucun rendu visible).
- **Consigne** : ne pas câbler d'UI de saisie ni de table ; uniquement le contrat (champ/slot) prêt pour l'implémentation IA ultérieure.
- Bonus : centraliser les disclaimers factuels (RDV_LIMIT, attribution) pour qu'ils restent, mais sans conclusion éditoriale.

## Vérification
- Tests : adapter `market.test.js` (loss_by_offer conserve), `ChannelsSection`/channels (TOP_N), `CatalogueBridgeSection` (onglets), `ProductCompareSection` (titre + tableau unique), `ReviewPages.test.tsx` (titres).
- Gates : `npm run test` / `npm run lint` / `npm run build`.

## Process
1. Plan validé par Alaric (+ retour Théo si besoin).
2. Implémentation Gemini (profil omp gemini-3.8-flash-high) sur worktree clone dédié, avec le plan en source de vérité.
3. Contrôle Alaric : diff inspecté, gates re-exécutées, recette visuelle Théo, PR.