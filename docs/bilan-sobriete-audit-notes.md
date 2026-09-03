# Bilan — Passe sobriété + UX writing (+ évolutions fonctionnelles)

État des lieux au lancement (2026-09-03, worktree devilish-dog, post PR #93).

## Remarques Théo (source)
1. Descriptions de chaque KPI → dans un hint "i" (InfoHint), pas dans le flux.
2. Badges CA NEW / CA total / Signatures NEW (ScopeTag) → sous-titre sobre, plus petit que le titre, couleur moins marquante.
3. "Motifs de gain déclarés par offre" (WinReasonsSection) : pas de Conseil → gain/perte PAR PRODUIT (Catalogue, Sur-mesure, Conseil).
4. Supprimer "Études externes du marché formation" (MarketStudiesSection + marketStudies.ts).
5. "Motifs déclaratifs" (ReasonsSection) ne sert à rien → supprimer. L'intéressant : gain/perte par produit + comparaison années précédentes.
6. Sélectionner l'année de comparaison → ajuste les KPIs comparatifs (compare paramétrable UI).
7. "Catalogue vs sur-mesure : comparaison d'exercices" (ProductCompareSection) : + Conseil, renommé "Comparaison des produits".
8. Titres de KPIs trop verbeux → passe UX writing complète.
9. Audit : trouver d'autres sujets.

## Inventaire UI (relevé Alaric, à croiser avec audit Grok)

### Header app (ReviewApp.tsx)
- review-title "Bilan" + review-subtitle "Business Review · FY juillet → juin"
- badge live "Données live · HH:MM"
- nav : Synthèse / Trajectoire / Commercial / Produit / Marché & acquisition / Diagnostic + Partages (Outils)

### Pages (ReviewPages.tsx) — headers + descriptions
- Synthèse : "Le fil directeur de la revue : résultat, décomposition, puis verdict."
- Trajectoire : "Les flux NEW et RENEW dans le temps, puis la lecture distincte du stock catalogue."
- Commercial : "Le bridge Owner cadre l'écart avant toute lecture de l'équipe active."
- Produit : "Comparer les offres sans perdre les volumes, les tickets ni la qualité des cycles."
- Marché & acquisition : "Motifs déclarés, références externes et canaux : des signaux, jamais une causalité." (+ "références externes" à retirer si section études supprimée → cohérence à faire)
- Diagnostic : "Fiabilité, limites d'attribution et règles de calcul visibles au même endroit."

### ScopeTag (components/ScopeTag.tsx)
- LABELS : total → "CA total", new → "CA NEW", signatures-new → "Signatures NEW"
- VARIANTS : accent (CA NEW) → le plus visible. À remplacer par sous-titre discret.

### Sections & titres/kickers (relevé partiel, à compléter)
- SynthesisSection : "Cadrage de l'exercice" + kicker "Quatre indicateurs : performance, offres, capacité, marché" + ScopeTag total + InfoHint key_point. StatCard labels/hints viennent de synthesis.js (cards: label/display/scope/hint).
- PerformanceSection : "Trajectoire NEW / RENEW" + ScopeTag total + kicker "CA total · FY22→FY26 · le stock ARR catalogue n'est pas un flux" ; StatCard "CA total FY26" / "CA NEW FY26" / "CA RENEW FY26" (scope tags embarqués dans StatCard via scope prop) ; chart "Série empilée FY22→FY26".
- BridgeNewSection : à relire (Synthèse).
- CapacitySection : "Capacité commerciale : bridge Owner puis équipe active" + kicker "CA NEW · FY25→FY26 · d'abord le cadrage, ensuite l'équipe active" ; "Bridge Owner NEW — cadrage de l'écart" ; "Équipe active — Paul / Christophe".
- SalesComparisonSection : à relire.
- ProductivitySection : à relire.
- ActivitySection : à relire.
- LeadershipSection : à relire.
- ProductCompareSection : "Catalogue vs sur-mesure : comparaison d'exercices" + kicker "CA NEW · FY25→FY26 · fermées, signatures, closing, ticket, cycles" ; colonnes Catalogue / Sur-mesure ; note "autre".
- CatalogueBridgeSection : "Bridge catalogue : RENEW, volume NEW, ticket NEW" + kicker "CA total catalogue · FY25→FY26 · décomposition RENEW + volume NEW + ticket NEW" ; StatCards "Delta RENEW" (hint share) / "Volume NEW" / "Ticket NEW" / "Total" ; "Waterfall catalogue FY25 → FY26" ; split bar RENEW/NEW.
- ConseilSection : à relire (Conseil = 8 signatures).
- CycleSection : à relire.
- ProductHistorySection : à relire.
- MarketSignalSection : à relire (test deux proportions, mix).
- WinReasonsSection : "Motifs de gain déclarés par offre" + ScopeTag signatures-new + kicker "Signatures NEW · motifs déclarés, pas de causalité · FY26" ; 2 cartes Catalogue / Sur-mesure (n=…). CONSEIL ABSENT.
- ReasonsSection (à supprimer) : "Motifs déclaratifs" + tables "Motifs de perte" / "Motifs de gain" (globaux).
- MarketStudiesSection (à supprimer) : "Études externes du marché formation" + MARKET_STUDIES constantes.
- ChannelsSection : à relire.
- PortfolioSection : à relire.
- HistorySection : à relire.
- DiagnosisSection : à relire.
- QualitySection : à relire.
- DefinitionsSection : à relire.
- PatternsSection / Conclusion : à relire.
- SharedSection : à relire.

## API et périodes (état)
- review.period.ts : FY_OPTIONS FY22→FY26 ; comparisonFy(fy) = FY N-1 (fallback si absent) ; periodQuery(fy,compare,semester) ; businessReviewPath(resource, selection) construit ?resource=&fy=&compare=&semester=.
- api/review.js : compare default 'FY25' ; parsePeriod valide FY22..FY26 ; resources bridge/commercial/market/diagnosis/synthesis utilisent compare ; product/cycles/overview prennent fy seul (séries multi-FY) ; portfolio/diagnosis ANNUAL_ONLY.
- Data brutes dispo par FY : fetchFyWindow → window[FY] = { won, closed, ... } (soql multi-FY). computeMarket(window) : loss_reasons/win_reasons globaux ; win_by_offer {catalogue, sur_mesure} (pas conseil) ; mix global/catalogue/sur_mesure (counts marché/produit/prix sur pertes NEW) ; share/test figés FY25→FY26 (test dur).
- computeProduct : par produit (catalogue/sur_mesure/conseil/autre) : closed, won, closing, amountNew, amountRenew, cycle médian/moyen. PAS de pertes par produit (closed inclut pertes, non ventilé gagné/perdu) → pour gain/perte par produit il faut une ventilation won/lost par produit (closed - won = perdu, mais amount perdu indispo si IsWon false ⇒ amount manquant sur les pertes ? Vérifier SOQL : que ramène fetch.js pour les closed).

## Faisabilité rapide (hypothèses à confirmer par Grok)
- gain/perte par produit : closed/won par produit dispo côté computeProduct (counts). Pertes = closed - won (counts). Amount perdu : dispo dans les records closed (Amount field) → un compute nouveau "productGains" par FY : won/lost counts + amount won (+ amount lost si dispo) par produit, séries multi-FY → comparaison N-1 ou N choisie.
- compare sélectionnable : le bridge/commercial/diagnosis/synthesis prennent déjà compare en query → exposer un select "Comparer avec : FY22..FY26" dans PeriodSelector (et semestre ?) → passer compare dans PeriodSelection, businessReviewPath, tous les payloads. ATTENTION : test market figé FY25→FY26, diagnosis calibré FY26, synthèse narrative FY26 → garde-fous : si compare != FY N-1, soit fallback sur les données brutes séries, soit garder le test figé avec note. À arbitrer.
- WinReasons Conseil : market.js filtre catWon/smWon uniquement → ajouter conseil (et autre ?) dans win_by_offer.
- La remarque 5 (supprimer ReasonsSection) → le gain/perte par produit remplace : probablement une nouvelle section sur la page Marché (ou Produit) utilisant un nouveau compute.
- MarketStudiesSection : suppression → retirer l'import + la sortie DOM + marketStudies.ts + la mention "références externes" dans le header de page.

## Profils agents Paseo (confirmés)
- Grok : cursor/grok-4.6 (agent, high) — audit/implémentation.
- Gemini : omp/google-antigravity/gemini-3.8-flash-high (full, medium) — implémentation.

## Process
1. Audit Grok read-only (agent 48d3866d-2417-4671-8d82-6ecebdca959c, lancé).
2. Consolidation plan (moi, avec remarques Théo + findings Grok).
3. Implémentation Gemini (après validation du plan par Théo ou en autonome si pas bloquant).
4. Gates : npm run test / lint / build.