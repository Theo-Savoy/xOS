# Bilan — Plan d'implémentation « Business Review FY26 interactif »

> Cible : transformer l'app `review` (« Bilan ») du Portal XOS en équivalent interactif **complet** du document `Business_Review_FY26.pdf` (18 slides principales + 8 annexes).
> Branche : `enhance-bilan-interactive` (worktree `enhanced-albatross`).
> Rédigé le 2026-09-03 après lecture intégrale du PDF et du code réel.
> Doc frère : [`bilan-audit-gap.md`](./bilan-audit-gap.md) — ce qui est réutilisable vs ce qui manque.
> Spec historique de l'app actuelle : [`specs/business-review.md`](./specs/business-review.md) (cockpit macro v2, périmètre différent).

Ce plan est écrit pour être exécutable par un agent qui n'a lu ni le PDF ni le code. Chaque lot liste les fichiers à créer/modifier, les tests à écrire et la commande de vérification.

---

## 1. Ce que le document contient (et donc ce que l'app doit rendre)

Le deck est une revue analytique de l'exercice FY26 (01/07/2025 → 30/06/2026), construite sur un **snapshot Salesforce figé au 21/07/2026** complété par un fichier `Suivi détaillé FY26.xlsx` (RDV hebdomadaires par personne). Il ne s'agit pas d'un tableau de bord d'activité : c'est un raisonnement en quatre temps — *performance globale → décomposition (produit, commerciaux, marché) → portefeuille et canaux → diagnostic de fiabilité*. L'app doit reproduire ce raisonnement, pas seulement les chiffres : chaque section porte un **titre-conclusion**, un **périmètre explicite** et une **limite de lecture**.

Trois propriétés structurent tout le reste :

1. **Le périmètre change d'une slide à l'autre.** Certaines lisent le CA total (NEW + RENEW), d'autres le NEW seul. Le deck l'affiche systématiquement dans le sous-titre. L'app doit faire pareil (voir §3, règle R5).
2. **Rien n'est causal.** Le deck répète « le bridge montre d'où vient l'écart, pas pourquoi il existe », « motifs déclarés, pas causalité », « impacts non additifs ». Les libellés de l'app doivent conserver ces réserves.
3. **Stock ≠ flux.** L'ARR catalogue (2,235 M€ à l'ouverture) est un stock ; les 1,005 M€ signés sur le catalogue sont un flux. Les additionner est l'erreur la plus grave possible sur cette app.

---

## 2. Chiffres de référence vérifiés (fixture d'or)

Ces valeurs ont été recalculées à partir du PDF et servent de **fixture de test** pour tous les lots. Elles proviennent du snapshot du 21/07/2026 : une requête live donnera des valeurs légèrement différentes (voir §7, piège P8). Les tests unitaires doivent porter sur ces fixtures, jamais sur Salesforce en direct.

### 2.1 Historique FY22→FY26 (annexe A4)

| FY | CA total | CA NEW | CA RENEW | Détections NEW | Fermées NEW | Sign. NEW | Closing NEW | Cycle méd. | Cycle moy. |
|----|----------|--------|----------|----------------|-------------|-----------|-------------|------------|------------|
| FY22 | 2,874 M€ | 2,483 M€ | 0,391 M€ | 488 | 390 | 176 | 45,1 % | 22 j | 94 j |
| FY23 | 3,377 M€ | 2,050 M€ | 1,327 M€ | 402 | 342 | 102 | 29,8 % | 41 j | 106 j |
| FY24 | 3,129 M€ | 1,406 M€ | 1,723 M€ | 401 | 371 | 103 | 27,8 % | 41 j | 107 j |
| FY25 | 1,949 M€ | 1,068 M€ | 0,881 M€ | 279 | 248 | 63 | 25,4 % | 43 j | 115 j |
| FY26 | 1,681 M€ | 0,904 M€ | 0,777 M€ | 197 | 186 | 56 | 30,1 % | 22 j | 136 j |

**Conservation vérifiée** : `total == NEW + RENEW` sur chaque ligne (FY26 : 0,904 + 0,777 = 1,681 ✓ ; FY25 : 1,068 + 0,881 = 1,949 ✓).

**Dérivée exploitable** : `pertes NEW = fermées NEW − signatures NEW`. FY24 : 371 − 103 = 268. FY25 : 248 − 63 = 185. FY26 : 186 − 56 = 130. Ces dénominateurs sont ceux du test statistique marché (§2.5).

### 2.2 Bridges

| Bridge | Décomposition | Somme |
|--------|---------------|-------|
| Total FY25→FY26 | −163,7 k€ NEW + −104,7 k€ RENEW | −268,4 k€ ✓ |
| NEW FY25→FY26 (slide 4) | −118,6 k€ volume + −45,1 k€ ticket | −163,7 k€ ✓ |
| Catalogue total FY25→FY26 (slide 10) | −333,7 k€ RENEW + −173,6 k€ volume NEW + −84,3 k€ ticket NEW | −591,6 k€ ✓ |
| Owner NEW FY25→FY26 (slide 6 / A2) | +309,4 k€ Paul+Christophe · −276,6 k€ Jérôme · −196,5 k€ commerciaux partis | −163,7 k€ ✓ |

**Répartition du recul catalogue** : 333,7 / 591,6 = **56,4 % RENEW**, 257,9 / 591,6 = **43,6 % NEW** ✓.

### 2.3 Formule de bridge volume/ticket — attention, le deck se trompe de nom

Le deck écrit « bridge prix-volume symétrique ». **La formule réellement utilisée n'est pas symétrique**, c'est une décomposition séquentielle de type Laspeyres :

```
effet_volume = (q_N − q_N-1) × ticket_N-1
effet_ticket = (ticket_N − ticket_N-1) × q_N
```

Vérification sur les deux bridges du deck :

- **NEW global** : ticket FY25 = 1067,9/63 = 16,951 k€ ; ticket FY26 = 904,2/56 = 16,146 k€.
  volume = −7 × 16,951 = **−118,7 k€** (deck : −118,6) ; ticket = −0,805 × 56 = **−45,1 k€** (deck : −45,1) ✓
- **Catalogue NEW** : ticket FY25 = 716,2/33 = 21,703 k€ ; FY26 = 458,3/25 = 18,332 k€.
  volume = −8 × 21,703 = **−173,6 k€** (deck : −173,6) ; ticket = −3,371 × 25 = **−84,3 k€** (deck : −84,3) ✓

La vraie formule symétrique (`Δq × (p₁+p₂)/2` et `Δp × (q₁+q₂)/2`) donnerait −115,8 / −47,9 sur le NEW global : la somme serait juste, la répartition fausse de ~3 k€. **Implémenter la formule séquentielle ci-dessus**, et garder le mot « symétrique » hors des libellés UI (préférer « décomposition volume / ticket »).

### 2.4 Produit × exercice (annexe A5, slides 9–11)

| Produit · FY | Fermées NEW | Sign. NEW | Closing NEW | CA NEW | Cycle méd. | Cycle moy. | n cycle |
|--------------|-------------|-----------|-------------|--------|------------|------------|---------|
| Catalogue · FY24 | 174 | 32 | 18,4 % | 401 k€ | 87 j | 163 j | 25 |
| Catalogue · FY25 | 108 | 33 | 30,6 % | 716 k€ | 64 j | 164 j | 27 |
| **Catalogue · FY26** | **110** | **25** | **22,7 %** | **458 k€** | **68 j** | **242 j** | **18** |
| Sur-mesure · FY24 | 144 | 49 | 34,0 % | 774 k€ | 34 j | 73 j | 44 |
| Sur-mesure · FY25 | 102 | 25 | 24,5 % | 291 k€ | 28 j | 70 j | 24 |
| Sur-mesure · FY26 | 65 | 27 | 41,5 % | 313 k€ | 17 j | 70 j | 21 |
| Conseil · FY24 | 49 | 20 | 40,8 % | 229 k€ | 32 j | 74 j | 17 |
| Conseil · FY25 | 30 | 4 | 13,3 % | 53 k€ | 94 j | 78 j | 3 |
| Conseil · FY26 | 9 | 3 | 33,3 % | 129 k€ | 14 j | 12 j | 3 |

CA total par produit FY26 : catalogue 1,005 M€ (dont 458,3 NEW + 546,5 RENEW), sur-mesure 313,0 k€ (100 % NEW), conseil 354,6 k€ (129,0 NEW + 225,6 RENEW).

**Conseil FY26 = 8 signatures totales (3 NEW + 5 RENEW)**, jamais « 3 signatures » seul.

### 2.5 Marché (slide 12)

Part des pertes déclarées « marché / client » : FY24 **67,2 %** (180 pertes sur 268) → FY26 **78,5 %** (102 pertes sur 130). Test bilatéral exploratoire FY25→FY26 : **p = 0,267**.

Reconstruction du test (le deck n'imprime pas la valeur FY25) : deux proportions, FY25 ≈ 135/185 = 73,0 %, FY26 = 102/130 = 78,5 %, z ≈ 1,11, p bilatéral ≈ 0,267 ✓. À revalider contre les données réelles au lot 4 ; si l'écart dépasse ±0,01 sur p, c'est le dénominateur FY25 qu'il faut vérifier en premier.

Conclusion à afficher, mot pour mot : **« le signal marché domine sans prouver l'aggravation »**.

Répartition FY26 par offre (les trois motifs somment à 100 %, le deck n'en imprime que deux) :

| Périmètre | Marché / client | Produit / réponse XOS | Prix (déduit) |
|-----------|-----------------|------------------------|---------------|
| Global | 78,5 % | 16,9 % | 4,6 % |
| Catalogue | 76,5 % | 17,6 % | 5,9 % |
| Sur-mesure | 78,9 % | 18,4 % | 2,6 % |

### 2.6 Capacité et productivité sales (slides 6–7)

| Production sales (hors Jérôme, hors SDR) | FY25 | FY26 | Évolution |
|---|---|---|---|
| ETP sales moyens | 4,17 | 2,00 | −52 % |
| CA NEW sales | 733,6 k€ | 846,4 k€ | +15 % |
| Signatures NEW | 49 | 50 | +2 % |
| Détections | 265 | 184 | −31 % |
| CA NEW / ETP | 176 k€ | 423 k€ | **+140 %** |
| Signatures / ETP | 11,8 | 25,0 | **+113 %** |
| Détections / ETP | 63,6 | 92,0 | **+45 %** |

FY25 = 4,17 ETP moyens (5 en juillet et décembre, 4 les autres mois). FY26 = 2,00 ETP + 1 SDR compté séparément.

### 2.7 Activité FY26 par personne (annexe A3)

| Personne | Rôle | RDV | Sem. | RDV/sem | Détections | Taux dét. | Fermées NEW | Sign. NEW | Closing NEW | CA NEW |
|----------|------|-----|------|---------|------------|-----------|-------------|-----------|-------------|--------|
| Paul | commercial | 243 | 45 | 5,40 | 65 | 26,7 % | 81 | 21 | 25,9 % | 528 k€ |
| Christophe | commercial | 174 | 41 | 4,24 | 119 | 68,4 % | 98 | 29 | 29,6 % | 318 k€ |
| Jérôme | PDG | 101 | 42 | 2,40 | 11 | 10,9 % | 7 | 6 | 85,7 % | 58 k€ |
| Yanis | SDR | 253 | 18 | 14,06 | 2 | 0,8 % | 0 | 0 | n/a | 0 k€ |

Jérôme FY25→FY26 (annexe A2) : détections 14→11, fermées 22→7, signatures 14→6, closing 63,6 %→85,7 %, ticket 23,9→9,6 k€, CA NEW 334,1→57,6 k€ (−276,6 k€).

Standards de comparaison affichés par le deck : détection 50 %, closing 35 %.

### 2.8 Portefeuille (slide 15)

Statuts exclusifs au 30/06/2026 : **Gagnés 23 / 389,1 k€** (première signature FY26) · **Fidélisés 50 / 1,292 M€** (nouvelle signature) · **Engagés 44 / 966,4 k€** (contrat actif sans signature) · **Perdus 31 / 746,1 k€** (échéance sans actif ni signature).

Deux conservations vérifiées, à encoder comme assertions :

- `gagnés + fidélisés == CA total FY26` : 389,1 + 1292,0 = **1681,1 k€** ✓ — et 1292/1681 = **76,9 % du CA signé vient des clients existants**, chiffre repris slide 18.
- `perdus / ARR d'ouverture` : 746,1 / 2235 = **33,4 % de l'ARR d'ouverture perdu** ✓.

Cohorte d'ouverture du catalogue : **106 comptes / 2,235 M€ ARR** → 75 retenus (70,8 %) / 31 perdus (29,2 %).

⚠️ Les quatre statuts (148 comptes) et la cohorte catalogue (106 comptes) sont **deux univers différents** affichés sur la même slide. Ne jamais les réconcilier ni les sommer. Les montants « Engagés » et « Perdus » sont de l'ARR (stock), les montants « Gagnés » et « Fidélisés » du CA signé (flux) : leur somme (3,394 M€) n'a aucun sens métier.

### 2.9 Canaux (slide 16 / annexe A7)

| Campagne / canal | Fermées NEW | Sign. NEW | Closing NEW | CA NEW |
|---|---|---|---|---|
| Détecté/Signé hors action marketing | 96 | 33 | 34,4 % | 443 k€ |
| 9060. Salon Learning Technologies 2026 | 6 | 2 | 33,3 % | 200 k€ |
| Formulaire Site Internet (Test, Contact ou Devis) | 48 | 10 | 20,8 % | 134 k€ |
| Partenaires | 16 | 9 | 56,2 % | 85 k€ |
| 950. Salon LT février 2023 : Leads | 1 | 1 | 100,0 % | 36 k€ |
| 7010. Salon SRH mars 2025 | 5 | 1 | 20,0 % | 7 k€ |
| 10020. Salon SRH 2026 | 1 | 0 | 0,0 % | 0 k€ |

Totaux A7 : 173 fermées, 56 signatures, 905 k€ ≈ CA NEW FY26 (904 k€, écart d'arrondi) ✓. La slide 16 n'affiche que les 4 premiers canaux — c'est un top-N, pas un total.

Concentration du CA (RENEW inclus) : Top 1 = Société Générale **19,7 %** (331 k€) · Top 5 = **40,7 %**. Suite : CCI France 160 k€ (9,5 %), DGSE 79 k€ (4,7 %), Abeille Assurances 57 k€ (3,4 %), Omnicell 56 k€ (3,3 %), OPT Nouvelle-Calédonie 56 k€ (3,3 %).

### 2.10 Motifs déclaratifs FY26 (annexe A6)

Pertes (n implicite = 130, table = top 8 → 121 lignes affichées) : Projet abandonné 50 (38,5 %), Aucune réponse client 28 (21,5 %), Budget non obtenu 9 (6,9 %), Internalisation 8 (6,2 %), No go XOS 7 (5,4 %), Sous contrat 7 (5,4 %), Prix 6 (4,6 %), Design 6 (4,6 %).

Gains (n implicite = 56, table = top 8 → 53 lignes affichées) : Prix 17 (30,4 %), Pertinence du dispositif 10 (17,9 %), Offre clés en main 9 (16,1 %), Accompagnement du commercial 8 (14,3 %), Accompagnement du CP 4 (7,1 %), Notoriété 2 (3,6 %), Réactivité 2 (3,6 %), Pertinence du profil 1 (1,8 %).

Motifs de gain par offre (slide 14) : **Catalogue n=25** — Prix 56,0 % (14 ventes sur 25), Pertinence 12,0 %, Accompagnement commercial 12,0 %, Notoriété 8,0 %. **Sur-mesure n=27** — Clés en main 29,6 %, Pertinence 25,9 %, Accompagnement commercial 18,5 %, Accompagnement CP 14,8 %.

### 2.11 Qualité des données (annexe A8)

0 écart de tag FY (`_fy_created` / `_fy_closed` recalculés) · **13 cycles négatifs FY26** (23,2 % des signatures hors RENEW) · **5 cycles > 365 j dont 3 > 730 j** · 0 montant manquant sur 101 opportunités gagnées totales · 2 200 lignes export CreatedDate · 1 853 lignes export CloseDate.

Cycles NEW FY26 : **43 exploitables sur 56** (43 + 13 exclus = 56 ✓).

### 2.12 Études externes (slide 13, contenu statique)

ISTF 2026 (≈500 réponses) : 75 % des projets internalisés · 24 % citent un frein financier · 33 % utilisent déjà l'IA · 38 % mobilisent des experts internes.
Synofdes 2025–2026 (n=149) : 56 % ont réduit ou suspendu une activité · 54 % sous leurs prévisions · 49 % fortement touchés par les budgets · 48 % ont réduit leur masse salariale.
L. Dalloz 2025 : financement cité par 57 % des décideurs.

Aucune de ces valeurs ne vient de Salesforce → **constantes frontend**, pas de resource API.

---

## 3. Règles métier non négociables

Ces règles sont le contrat de calcul. Toute implémentation qui les viole est un bug, même si le chiffre « a l'air juste ».

**R1 — Classification RENEW.** Une opportunité est RENEW si `Opportunity.Name` contient `renew` **ou** `tacite`, sans tenir compte de la casse. Sinon elle est NEW. C'est la seule définition ; il n'existe pas de champ dédié. Fonction unique `isRenew(name)` dans `api/_business-review/classify.js`, importée partout — aucune réimplémentation locale.

**R2 — Signatures et CA totaux = NEW + RENEW.** Le CA total FY26 (1,681 M€) inclut les RENEW. Les 101 ventes signées FY26 aussi. Toute métrique d'**activité** (détections, fermées, closing, cycle, motifs, canaux) exclut les RENEW.

**R3 — Conservation.** Pour toute période et tout découpage : `total.count == new.count + renew.count` et `|total.amount − (new.amount + renew.amount)| ≤ 0,01`. Cette assertion est calculée côté API et renvoyée dans chaque payload sous `conservation: { ok, delta_count, delta_amount }`, puis affichée par le composant `ConservationBadge`. Un écart non nul est un signal produit, pas une erreur à masquer.

**R4 — FY = juillet → juin.** FY26 = 01/07/2025 → 30/06/2026. La logique existe déjà et est testée : `api/_review/period.js` (`fyIntForDate`, `fyBounds`, `parsePeriod`). La réutiliser telle quelle, ne pas la réécrire.

**R5 — Le périmètre est visible, jamais caché.** Chaque titre de section et chaque en-tête de carte porte son périmètre : « CA total », « CA NEW », « Signatures NEW ». Composant `ScopeTag` obligatoire. Interdit de reléguer le périmètre en tooltip, en note de bas de carte ou en légende.

**R6 — Amount = montant annuel.** Pour un contrat catalogue pluriannuel, `Amount` est **déjà** annualisé. Ne jamais multiplier par la durée, ne jamais utiliser `Type_de_commission__c` (« Abonnement 2/3/4/5 ans ») comme facteur multiplicatif. Ce champ ne sert qu'à identifier les contrats ARR.

**R7 — Jérôme = PDG.** Hors du classement commercial, hors du dénominateur ETP sales, **inclus** dans les totaux entreprise, présenté dans une annexe dédiée (A2) sans objectif ni comparaison commerciale. Identifié par `WEEKLY_TRACKING_BY_SF_USER['005b0000005zfnvAAA'] === 'dg'` dans `api/_config/access.js` — réutiliser `trackingModeFor()`, ne pas coder le nom en dur.

**R8 — Yanis = SDR.** Hors capacité de closing, aucune attribution de CA. Ses RDV sont affichés mais **non attribuables** : il n'existe aucune clé RDV → Opportunity. La phrase « on ne peut pas mesurer combien de ventes viennent du SDR » doit rester à l'écran. Identifié par `trackingModeFor()` → `'sdr'`.

**R9 — Bridge.** Bridge NEW = volume + ticket, formule séquentielle du §2.3. Bridge catalogue total = delta RENEW + delta volume NEW + delta ticket NEW. Assertion : la somme des barres égale le delta total à ±0,1 k€.

**R10 — Le bridge Owner passe avant tout diagnostic d'équipe.** L'ordre de lecture est imposé : on montre d'abord que −163,7 k€ = +309,4 (Paul+Christophe) −276,6 (Jérôme) −196,5 (partis), *ensuite* seulement on analyse la performance de l'équipe active. Interdit d'afficher une baisse d'équipe sans ce cadrage.

**R11 — Conseil FY26 = 8 signatures (3 NEW + 5 RENEW).** Jamais « 3 signatures » sans qualifier NEW.

**R12 — Portefeuille : 4 statuts exclusifs** (Gagné / Fidélisé / Engagé / Perdu), cohorte d'ouverture catalogue **106 comptes / 2,235 M€ ARR** traitée comme un dataset séparé. Stock ≠ flux (§2.8).

**R13 — ETP.** FY25 = 4,17 ETP sales moyens, FY26 = 2,00 (+1 SDR séparé). Valeurs **fournies par la direction**, non calculables depuis Salesforce → configuration, jamais dérivées (voir §9, décision D2).

**R14 — Test statistique marché.** Deux proportions, bilatéral. Part 67,2 % (FY24) → 78,5 % (FY26), volume 180 → 102, p FY25→FY26 = 0,267. Conclusion figée : « le signal marché domine sans prouver l'aggravation ».

**R15 — Attribution par Owner courant.** `OwnerId` du snapshot, jamais `CreatedById`. Il n'y a pas de reconstitution historique de la propriété : la limite doit être affichée sur les slides commerciaux (5, 6, 7) et le diagnostic (17).

---

## 4. Mapping slide → section → resource API

Familles de navigation : **Performance**, **Commercial**, **Produit**, **Marché**, **Diagnostic**, plus un accordéon **Annexes**.

| # | Slide | Section frontend | Famille | Resource | Données servies |
|---|-------|------------------|---------|----------|-----------------|
| 1 | Couverture | *(header de l'app)* | — | `synthesis` | Titre, date de snapshot, rappel FY = juillet→juin |
| 2 | Synthèse | `SynthesisSection` | Performance | `synthesis` | 4 cartes (Performance 1,681 M€ / Offres −591,6 k€ / Capacité −52 % / Marché 78,5 %) + point clé |
| 3 | NEW et RENEW reculent ensemble | `PerformanceSection` | Performance | `overview` | Série empilée NEW/RENEW FY22→FY26, encart ARR catalogue (2,235 M€ ouverture, 1,170 échéance, 1,066 engagé) |
| 4 | Bridge NEW | `BridgeNewSection` | Performance | `bridge` | Waterfall 1,068 M€ → −118,6 volume → −45,1 ticket → 0,904 M€ |
| 5 | Paul / Christophe | `SalesComparisonSection` | Commercial | `commercial` | Table RDV/sem, détection, fermées, signatures, closing, ticket, CA NEW + 2 cartes narratives |
| 6 | Capacité | `CapacitySection` | Commercial | `commercial` | Paul+Christophe sur FY24/25/26 + bridge Owner (R10) |
| 7 | Productivité ETP | `ProductivitySection` | Commercial | `commercial` (+ `fte-config`) | Table ETP/CA/signatures/détections + 3 tuiles ratio (+140 %, +113 %, +45 %) |
| 8 | Cycle | `CycleSection` | Produit | `cycles` | Série médiane/moyenne FY22→FY26 + table par produit FY26 + encart qualité des dates |
| 9 | Catalogue vs sur-mesure | `ProductCompareSection` | Produit | `product` | 2 colonnes FY25→FY26 (fermées, signatures, closing, ticket, cycles) |
| 10 | Recul catalogue | `CatalogueBridgeSection` | Produit | `bridge` | Waterfall total catalogue + split 56,4/43,6 % + closing catalogue par commercial |
| 11 | Conseil | `ConseilSection` | Produit | `product` | Table FY22→FY26 total/NEW/RENEW + encart « 8 ventes · 3 NEW · 5 RENEW » |
| 12 | Marché vs offres | `MarketSignalSection` | Marché | `market` | Barres empilées par offre + série de part FY24→FY26 + test p=0,267 |
| 13 | Études externes | `MarketStudiesSection` | Marché | *(constantes frontend)* | ISTF / Synofdes / Dalloz + mise en regard |
| 14 | Motifs de gain | `WinReasonsSection` | Marché | `market` | Barres divergentes Catalogue n=25 / Sur-mesure n=27 |
| 15 | Portefeuille | `PortfolioSection` | Diagnostic | `portfolio` | 4 tuiles de statut + barre de cohorte 106 comptes + 2 conservations |
| 16 | Canaux | `ChannelsSection` | Diagnostic | `channels` | Table canaux + encart attribution SDR impossible |
| 17 | Diagnostic | `DiagnosisSection` | Diagnostic | `diagnosis` | `FactorMatrix` : impact / fiabilité mesure / fiabilité attribution / ce qui manque |
| 18 | Conclusion | `PatternsSection` | Diagnostic | `synthesis` | 4 `PatternCard` + verdict |

### Annexes (accordéon, famille « Annexes »)

| Réf | Section | Resource | Contenu |
|-----|---------|----------|---------|
| A1 | `DefinitionsAnnex` | `definitions` (statique serveur) | 9 contrats de calcul — la source de vérité affichable de §3 |
| A2 | `JeromeAnnex` | `commercial?person=dg` | KPIs FY25/FY26 + 101 RDV / 6 signatures + rappel PDG |
| A3 | `ActivityAnnex` | `commercial` | Table complète 4 personnes (§2.7) |
| A4 | `HistoryAnnex` | `overview` | Table FY22→FY26 complète (§2.1) |
| A5 | `ProductFyAnnex` | `product` | Produit × exercice, 9 lignes (§2.4) |
| A6 | `ReasonsAnnex` | `market` | Motifs de perte et de gain FY26 avec n et % |
| A7 | `CampaignsAnnex` | `channels` | Campagnes complètes + concentration top comptes |
| A8 | `QualityAnnex` | `quality` | Compteurs qualité + 6 limites méthodologiques |

---

## 5. Architecture API

### 5.1 Routeur `api/business-review.js`

Copie du pattern de `api/review.js` (déjà validé en production) :

```js
export const GET = handler;
export const POST = handler;      // uniquement resource=fte-config
export const DELETE = handler;    // réservé, non utilisé au lot 1
export const OPTIONS = handler;
```

Séquence obligatoire dans `handler` :

1. `verifyJWT(request)` depuis `api/_auth.js` → 401 si null.
2. `getServiceClient()` depuis `api/_calls/http.js` → 500 si absent.
3. `getProfile(client, user.id)` depuis `api/_calls/profileCache.js` → 500 si `profile.error`.
4. Contrôle de rôle : `roleAtLeast(profile.role, 'manager')` depuis `api/_config/access.js` → 403 sinon (voir décision D1).
5. `new URL(request.url)` → `resource`, `fy` (défaut `FY26`), `compare` (défaut `FY25`).
6. `fetchSFToken({ client, userId: user.id })` depuis `api/_crm/salesforce.js` → 502 si erreur.
7. Dispatch sur `resource`, réponse JSON avec `Cache-Control: private, max-age=300, stale-while-revalidate=600`.

**Ne pas utiliser `export default`** : le runtime Vercel bascule alors sur la signature Node legacy et `new URL(request.url)` lève `TypeError: Invalid URL`. Ce bug a déjà été corrigé une fois sur `api/review.js` (commit `835b920`) — le commentaire y est conservé, le relire avant d'écrire le routeur.

### 5.2 Modules `api/_business-review/`

| Fichier | Rôle | Exports |
|---------|------|---------|
| `classify.js` | Cœur du contrat R1/R2 | `isRenew(name)`, `splitNewRenew(records)`, `assertConservation(total, newPart, renewPart)` |
| `soql.js` | Requêtes multi-FY FY22→FY26 | `wonOppsForFy(fyInt)`, `createdOppsForFy(fyInt)`, `closedOppsForFy(fyInt)`, `campaignOppsForFy(fyInt)`, `arrCatalogueOpps()` |
| `fetch.js` | Orchestration des appels SF + chunking par FY | `fetchFyWindow(token, fyInts)` → `{ [fyLabel]: { won, closed, created } }` |
| `overview.js` | Slides 3, A4 | `computeOverview(window)` |
| `bridge.js` | Slides 4, 6, 10 | `volumeTicketBridge(prev, curr)`, `catalogueBridge(...)`, `ownerBridge(...)` |
| `commercial.js` | Slides 5, 6, 7, A2, A3 | `computeCommercial(window, fteConfig, rdvConfig)` |
| `cycles.js` | Slide 8 | `computeCycles(window)` — médiane, moyenne, n valide, exclusions |
| `product.js` | Slides 9, 11, A5 | `computeProduct(window)` |
| `market.js` | Slides 12, 14, A6 | `computeMarket(window)`, `twoProportionTest(x1, n1, x2, n2)` |
| `portfolio.js` | Slide 15 | `computePortfolio(window, arrCohort)` |
| `channels.js` | Slide 16, A7 | `computeChannels(window)` |
| `diagnosis.js` | Slide 17 | `computeDiagnosis(parts)` — assemble les sorties des autres modules |
| `synthesis.js` | Slides 2, 18 | `computeSynthesis(parts)` |
| `quality.js` | Annexe A8 | `computeQuality(window)` |
| `fte-config.js` | R13 | `loadFte(client)`, `saveFte(client, value)` sur la table `settings` |

### 5.3 Volumétrie — le point dur

`SOQL_FETCH_CAP = 2000` dans `api/_crm/salesforce.js:5`. L'annexe A8 annonce **2 200 lignes CreatedDate** et **1 853 lignes CloseDate** sur FY22→FY26. Une requête unique sur cinq exercices dépasse donc le plafond et `searchContacts` renverra `truncated: true` avec des données silencieusement amputées.

**Solution retenue** : découper par exercice. `fetchFyWindow` émet une requête par FY (5 en parallèle via `Promise.all`), chacune bien en dessous de 2 000 enregistrements (FY22, le plus lourd : 488 détections). Ne pas relever `SOQL_FETCH_CAP` — c'est un garde-fou partagé par Combo, Labo et Lundi.

**Corollaire** : `earliestQueryDate()` dans `api/_review/period.js` remonte à `currentFy − 2` (FY25 au 03/09/2026). Insuffisant. Ajouter `fyRange(fromFy, toFy)` dans `api/_business-review/soql.js` plutôt que de modifier `period.js`, dont les 5 autres appelants attendent le comportement actuel.

**Agrégats** : pour les totaux purs (CA, counts), SOQL supporte `GROUP BY` — le pattern existe déjà dans `api/weekly-targets.js:53`. Mais médianes, cycles individuels, motifs et cohorte ARR exigent le niveau ligne. Rester sur du row-level découpé par FY, c'est un seul mécanisme au lieu de deux.

### 5.4 Champs Salesforce à ajouter dans `api/_crm/mapping.js`

`mapping.objects.opportunity` contient déjà `lossReasonField: 'Raison_de_perte_V2__c'`, `saleTypeField`, `commissionTypeField`, `arrCommissionTypes`. Il **manque** :

```js
winReasonField: 'Raison_de_gain_V2__c',   // annexes A6, slide 14
campaignField: 'CampaignId',              // slide 16, annexe A7
campaignNameField: 'Campaign.Name',       // libellé affiché
```

Ajouter aussi la valeur résiduelle de `saleTypes` : la clé actuelle ne couvre que `catalogue`, `sur_mesure`, `conseil`, alors que la picklist contient aussi `LMS` et `XOS+` (voir `docs/specs/business-review.md` §9). C'est l'origine de l'écart documenté en §7/P3.

---

## 6. Architecture frontend

```
src/apps/review/
├── ReviewApp.tsx                 # shell réécrit : sidebar verticale groupée + contenu
├── review.css                    # étendu (classes existantes conservées, cf. audit)
├── review.types.ts               # types partagés des payloads API
├── useBusinessReview.ts          # hook : fetch + cache mémoire + états loading/error
├── sections/
│   ├── SynthesisSection.tsx      ├── PerformanceSection.tsx
│   ├── BridgeNewSection.tsx      ├── SalesComparisonSection.tsx
│   ├── CapacitySection.tsx       ├── ProductivitySection.tsx
│   ├── CycleSection.tsx          ├── ProductCompareSection.tsx
│   ├── CatalogueBridgeSection.tsx├── ConseilSection.tsx
│   ├── MarketSignalSection.tsx   ├── MarketStudiesSection.tsx
│   ├── WinReasonsSection.tsx     ├── PortfolioSection.tsx
│   ├── ChannelsSection.tsx       ├── DiagnosisSection.tsx
│   ├── PatternsSection.tsx
│   └── annexes/                  # A1…A8, un fichier par annexe
└── components/
    ├── WaterfallChart.tsx        # bridges (slides 4, 6, 10)
    ├── ScopeTag.tsx              # R5 — périmètre visible
    ├── ConservationBadge.tsx     # R3 — total == NEW + RENEW
    ├── FactorMatrix.tsx          # slide 17
    ├── PatternCard.tsx           # slide 18
    └── StatCard.tsx              # tuile chiffre + libellé + delta
```

### 6.1 Shell

Sidebar verticale à gauche (≈200 px), sections groupées par famille, accordéon « Annexes » replié par défaut. Contenu scrollable à droite, une section par écran. Sélecteur `fy` en header (FY26 par défaut, FY22→FY26 disponibles) et sélecteur de comparaison (`compare`, FY25 par défaut).

`defaultSize` du manifeste passe de `{ w: 1100, h: 700 }` à `{ w: 1280, h: 820 }` dans `src/os/registry.tsx` — la sidebar plus la densité des tables l'exigent. L'`id: 'review'` et le titre `'Bilan'` ne changent pas (deep links `?open=review` existants).

### 6.2 Composants — ce qui existe déjà

Réutiliser sans les réécrire : `GlassCard`, `Tag`, `Select`, `Skeleton`, `EmptyState`, `Button`, `SegmentedControl` depuis `src/components/ui` (barrel `index.ts`). Recharts 3.9 est déjà installé et utilisé dans l'app actuelle.

`WaterfallChart` : Recharts n'a pas de waterfall natif. L'implémentation courte est un `BarChart` avec deux `Bar` sur le même `stackId`, la première transparente (offset de base), la seconde colorée. Pas de dépendance supplémentaire.

`ScopeTag` : wrapper de `Tag` avec trois variantes (`total` / `new` / `signatures-new`), rendu dans le `<h3>` de chaque carte.

### 6.3 Hook `useBusinessReview`

Une seule signature : `useBusinessReview(token, resource, { fy, compare })` → `{ data, loading, error, refresh }`. Cache mémoire par clé `resource|fy|compare` pour éviter de refetch en changeant de section. Pas de state manager, pas de react-query : `useState` + `useRef(Map)` suffisent et rien d'autre dans le repo n'en utilise.

---

## 7. Pièges

**P1 — `export default` sur les handlers Vercel.** Utiliser les exports nommés `GET`/`POST`/`DELETE`/`OPTIONS`. Sinon `new URL(request.url)` lève `TypeError: Invalid URL`. Précédent : `api/review.js:75-80`.

**P2 — Plafond SOQL à 2 000.** Voir §5.3. Vérifier systématiquement le champ `truncated` renvoyé par `searchContacts` et propager un avertissement dans le payload plutôt que de servir des chiffres faux.

**P3 — Les produits ne somment pas au total FY.** Sur FY26 : CA NEW par produit 458,3 + 313,0 + 129,0 = 900,3 k€ contre 904,0 k€ au total (−3,7 k€) ; CA total par produit 1 672,6 k€ contre 1 681 k€ (−8,4 k€) ; signatures NEW 25 + 27 + 3 = 55 contre 56 ; fermées NEW 110 + 65 + 9 = 184 contre 186 ; n cycles 18 + 21 + 3 = 42 contre 43. Le reliquat correspond aux opportunités hors des trois produits principaux (`LMS`, `XOS+`, ou `Type_de_vente__c` vide). **L'app doit afficher une catégorie « Autre / non défini »** avec son compte et son montant, sinon `ConservationBadge` signalera un écart permanent que personne ne saura expliquer.

**P4 — Le « bridge symétrique » du deck ne l'est pas.** Voir §2.3. Implémenter la formule séquentielle, sinon la somme sera juste et la répartition fausse d'environ 3 k€.

**P5 — Arrondis incohérents dans le deck.** Le closing partenaires vaut 56,3 % slide 16 et 56,2 % annexe A7 (9/16 = 56,25 %). Fixer **une** règle — arrondi au demi-supérieur sur une décimale — et l'appliquer partout. De même, le CA NEW sales FY25 vaut 733,6 k€ slide 7 mais 733,9 k€ si on le recalcule depuis les M€ arrondis de l'annexe A4 : **toujours calculer depuis les `Amount` bruts**, jamais depuis des valeurs déjà arrondies.

**P6 — Tables tronquées.** L'annexe A6 affiche 8 motifs de perte (121 occurrences) sur un total implicite de 130, et 8 motifs de gain (53) sur 56. La slide 16 affiche 4 canaux sur les 7 de l'annexe A7. L'app doit soit afficher la liste complète, soit indiquer explicitement « 8 premiers sur N ». Ne jamais recalculer un pourcentage sur la somme des lignes affichées.

**P7 — Portefeuille : deux univers, une slide.** 148 comptes en statuts exclusifs, 106 comptes dans la cohorte catalogue. Les modéliser comme deux datasets distincts dans le payload (`statuses` et `cohort`), avec deux titres distincts à l'écran.

**P8 — Le deck est un snapshot figé, l'app est live.** Snapshot du 21/07/2026 ; l'app interrogera Salesforce au moment de l'affichage. Les écarts sont normaux et attendus (l'annexe A8 impose d'ailleurs un « refresh live obligatoire avant partage actionnaires »). **Conséquence** : les tests unitaires portent sur des fixtures JSON figées reproduisant §2, jamais sur des appels SF réels. Prévoir un bandeau « Données live · dernier rafraîchissement <heure> » dans le header.

**P9 — Owner courant.** `OwnerId` du snapshot, pas de reconstitution historique (R15). Une opportunité FY24 réattribuée depuis apparaîtra sous son propriétaire actuel. La limite est affichée sur les slides 5, 6, 7 et 17 du deck : la reprendre.

**P10 — Cycles négatifs.** 13 dossiers FY26 ont `CloseDate < CreatedDate`. Les exclure du calcul **et** afficher le compte des exclusions à côté de chaque médiane/moyenne (le deck le fait systématiquement : « médiane, moyenne, n valide et exclusions présentés ensemble »).

**P11 — RDV non reliés aux opportunités.** Les RDV viennent d'un Excel hebdomadaire, sans clé vers `Opportunity`. Aucune attribution de vente à un RDV, aucun funnel complet reconstructible. Voir décision D5 sur la source des RDV.

**P12 — Ne pas sommer Global et individus.** Le total entreprise inclut déjà chaque personne. Piège hérité du cockpit actuel, documenté dans `docs/specs/business-review.md` §6.

**P13 — `escapeSOQL` obligatoire.** Toute valeur injectée dans une requête passe par `escapeSOQL()` de `api/_crm/salesforce.js`. Le filtre RENEW se fait **en JS après récupération**, pas en SOQL : `Name LIKE '%RENEW%'` en SOQL n'a pas la même sémantique de casse selon la configuration de l'org, et la classification doit rester dans `classify.js` (règle R1, un seul point de vérité).

---

## 8. Phasing

Chaque lot est indépendant et livrable seul. Les commandes de vérification sont celles du repo : `npm run test` (vitest), `npm run lint` (eslint), `npm run build` (`tsc --noEmit && vite build`).

### Lot 1 — MVP : classification, fenêtre multi-FY, overview, bridge, shell

**Créer**
- `api/_business-review/classify.js` — `isRenew`, `splitNewRenew`, `assertConservation`
- `api/_business-review/soql.js` — `fyRange`, `wonOppsForFy`, `createdOppsForFy`, `closedOppsForFy`
- `api/_business-review/fetch.js` — `fetchFyWindow` (chunking par FY, contrôle de `truncated`)
- `api/_business-review/overview.js` — série FY22→FY26 (§2.1)
- `api/_business-review/bridge.js` — `volumeTicketBridge` (§2.3), `ownerBridge`
- `api/business-review.js` — routeur, resources `overview` et `bridge`
- `api/_business-review/__fixtures__/fy-window.json` — fixture reproduisant §2.1 et §2.2
- `src/apps/review/review.types.ts`, `useBusinessReview.ts`
- `src/apps/review/components/ScopeTag.tsx`, `ConservationBadge.tsx`, `WaterfallChart.tsx`, `StatCard.tsx`
- `src/apps/review/sections/PerformanceSection.tsx`, `BridgeNewSection.tsx`
- Tests : `api/_business-review/classify.test.js`, `overview.test.js`, `bridge.test.js`

**Modifier**
- `api/_crm/mapping.js` — ajout de `winReasonField`, `campaignField`, `campaignNameField`
- `src/apps/review/ReviewApp.tsx` — shell sidebar (les anciennes sections restent branchées, voir lot 6)
- `src/apps/review/review.css` — classes de la sidebar
- `src/os/registry.tsx` — `defaultSize: { w: 1280, h: 820 }`

**Tests à écrire**
1. `isRenew('Renouvellement RENEW 2026')` → `true` ; `isRenew('Tacite reconduction')` → `true` ; `isRenew('renew')` → `true` ; `isRenew('Projet catalogue')` → `false` ; `isRenew(null)` → `false`.
2. `splitNewRenew` sur la fixture → conservation exacte : `total.count === new.count + renew.count`, `|total.amount − new.amount − renew.amount| ≤ 0.01`.
3. `computeOverview` sur la fixture → FY26 `{ total: 1681000, new: 904000, renew: 777000 }` à ±500 € ; les 5 exercices présents.
4. `volumeTicketBridge({ amount: 1067900, count: 63 }, { amount: 904200, count: 56 })` → `volume ≈ −118600`, `ticket ≈ −45100`, `somme === delta` à ±100 €.
5. `volumeTicketBridge` sur le catalogue (716200/33 → 458300/25) → `−173600` / `−84300` à ±100 €.
6. `ownerBridge` → `+309400 − 276600 − 196500 === −163700` à ±100 €.
7. Routeur : sans `Authorization` → 401 ; rôle `commercial` → 403 ; `resource=inconnue` → 400 avec la liste des resources valides.

**Vérifier**
```
npm run test -- api/_business-review
npm run lint
npm run build
```
**Critère de sortie** : les slides 3, 4 et 6 (partie bridge) sont à l'écran avec les chiffres de §2.1/§2.2, et `ConservationBadge` est vert.

---

### Lot 2 — Produit et cycles (slides 8, 9, 10, 11 · annexe A5)

**Créer**
- `api/_business-review/product.js` — produit × exercice, catégorie « Autre / non défini » incluse (P3)
- `api/_business-review/cycles.js` — médiane, moyenne, n valide, exclusions (P10)
- `api/_business-review/bridge.js` : ajout de `catalogueBridge`
- `src/apps/review/sections/CycleSection.tsx`, `ProductCompareSection.tsx`, `CatalogueBridgeSection.tsx`, `ConseilSection.tsx`
- `src/apps/review/sections/annexes/ProductFyAnnex.tsx`
- Tests : `product.test.js`, `cycles.test.js`

**Modifier** : `api/business-review.js` (resources `product`, `cycles`), `api/_crm/mapping.js` si la picklist réelle diffère de `catalogue|sur_mesure|conseil|LMS|XOS+`.

**Tests à écrire**
1. `computeProduct` FY26 → catalogue `{ closed: 110, won: 25, closing: 0.227, amountNew: 458300 }`, sur-mesure `{ 65, 27, 0.415, 313000 }`, conseil `{ 9, 3, 0.333, 129000 }`.
2. La catégorie « Autre » existe et son montant vaut `total_new − Σ(produits connus)` (≈ 3,7 k€ sur la fixture).
3. `catalogueBridge` → `−333700` RENEW, `−173600` volume, `−84300` ticket, somme `−591600` ; parts `56.4 %` / `43.6 %` à ±0,1 pt.
4. `computeCycles` FY26 → médiane 22 j, moyenne 136 j, `n_valid: 43`, `n_excluded: 13`, `n_over_365: 5`, `n_over_730: 3`.
5. Cycles par produit FY26 → catalogue `{ median: 68, mean: 242, n: 18 }`, sur-mesure `{ 17, 70, 21 }`, conseil `{ 14, 12, 3 }`.
6. Conseil FY26 → `total_signatures: 8`, `new: 3`, `renew: 5`, `amount_total: 354600` (R11).

**Vérifier**
```
npm run test -- api/_business-review
npm run build
```

---

### Lot 3 — Commercial, ETP, annexes A2/A3 (slides 5, 6, 7)

**Créer**
- `api/_business-review/commercial.js` — agrégation par Owner, exclusions DG/SDR via `trackingModeFor()`
- `api/_business-review/fte-config.js` — lecture/écriture sur `settings` (clé `business_review_fte`)
- `src/apps/review/sections/SalesComparisonSection.tsx`, `CapacitySection.tsx`, `ProductivitySection.tsx`
- `src/apps/review/sections/annexes/JeromeAnnex.tsx`, `ActivityAnnex.tsx`
- Tests : `commercial.test.js`, `fte-config.test.js`

**Modifier** : `api/business-review.js` (resources `commercial`, `fte-config` en GET et POST).

**Tests à écrire**
1. Jérôme est exclu du classement sales et du dénominateur ETP, mais présent dans les totaux entreprise (R7) : `computeCommercial(...).sales` ne contient que Paul et Christophe ; `.company.amountNew === 904000`.
2. Yanis apparaît dans `.activity` avec `closing: null` et `amountNew: 0` (R8).
3. Productivité FY26 → `caPerFte: 423200`, `signaturesPerFte: 25.0`, `detectionsPerFte: 92.0` ; FY25 → `176000`, `11.8`, `63.6` (±1 %).
4. Évolutions → `+140 %`, `+113 %`, `+45 %` (±1 pt).
5. `ownerBridge` est rendu **avant** la comparaison Paul/Christophe dans l'ordre des sections (R10) — test de rendu sur `CapacitySection`.
6. `fte-config` : POST par un `manager` → 200 ; POST par un `commercial` → 403.

**Vérifier**
```
npm run test -- api/_business-review
npm run test -- src/apps/review
npm run build
```

---

### Lot 4 — Marché et motifs (slides 12, 13, 14 · annexe A6)

**Créer**
- `api/_business-review/market.js` — motifs perte/gain, part marché/client par offre, `twoProportionTest`
- `src/apps/review/sections/MarketSignalSection.tsx`, `MarketStudiesSection.tsx`, `WinReasonsSection.tsx`
- `src/apps/review/sections/annexes/ReasonsAnnex.tsx`
- `src/apps/review/marketStudies.ts` — constantes §2.12
- Tests : `market.test.js`

**Modifier** : `api/business-review.js` (resource `market`), `api/_crm/mapping.js` si `Raison_de_gain_V2__c` n'a pas été ajouté au lot 1.

**Tests à écrire**
1. `twoProportionTest(135, 185, 102, 130)` → `p ≈ 0.267` (±0,005), `z ≈ 1.11`.
2. Part marché/client FY24 = 67,2 % (180/268), FY26 = 78,5 % (102/130) (±0,1 pt).
3. Répartition FY26 par offre : les trois motifs somment à 100 % ± 0,1 pt sur chaque ligne (global, catalogue, sur-mesure).
4. La conclusion renvoyée est exactement `"le signal domine sans prouver l'aggravation"` (R14) — chaîne figée, testée à l'identique.
5. Motifs de gain catalogue `n=25` avec Prix à 56,0 % (14/25) ; sur-mesure `n=27` avec Clés en main à 29,6 %.
6. Le payload expose `n_displayed` et `n_total` sur chaque table de motifs (P6).

**Vérifier**
```
npm run test -- api/_business-review/market.test.js
npm run build
```

---

### Lot 5 — Portefeuille, canaux, diagnostic, synthèse, qualité (slides 2, 15, 16, 17, 18 · annexes A1, A7, A8)

**Créer**
- `api/_business-review/portfolio.js`, `channels.js`, `diagnosis.js`, `synthesis.js`, `quality.js`
- `src/apps/review/components/FactorMatrix.tsx`, `PatternCard.tsx`
- `src/apps/review/sections/PortfolioSection.tsx`, `ChannelsSection.tsx`, `DiagnosisSection.tsx`, `PatternsSection.tsx`, `SynthesisSection.tsx`
- `src/apps/review/sections/annexes/DefinitionsAnnex.tsx`, `CampaignsAnnex.tsx`, `QualityAnnex.tsx`, `HistoryAnnex.tsx`
- Tests : `portfolio.test.js`, `channels.test.js`, `quality.test.js`

**Modifier** : `api/business-review.js` (resources `portfolio`, `channels`, `diagnosis`, `synthesis`, `quality`, `definitions`).

**Tests à écrire**
1. Portefeuille : `gagnés.amount + fidélisés.amount === total FY26` (389,1 + 1292,0 = 1681,1 k€, ±1 k€) — assertion R12/§2.8.
2. `perdus.amount / cohorte.arr === 0.334` (±0,002).
3. Les payloads `statuses` (4 statuts, 148 comptes) et `cohort` (106 comptes) sont deux clés distinctes ; aucun champ ne les additionne (P7).
4. Canaux : la somme des CA de tous les canaux ≈ CA NEW FY26 (905 vs 904 k€, ±2 k€) ; `n_displayed`/`n_total` exposés (P6).
5. Concentration : Top 1 = 19,7 %, Top 5 = 40,7 % (±0,1 pt), sur le CA total RENEW inclus.
6. Qualité : `negative_cycles: 13`, `over_365: 5`, `over_730: 3`, `missing_amount: 0`, `won_total: 101`.
7. Synthèse : les 4 cartes portent bien `1,681 M€` / `−591,6 k€` / `−52 %` / `78,5 %` et les 4 patterns du §18 sont présents.

**Vérifier**
```
npm run test -- api/_business-review
npm run test -- src/apps/review
npm run lint && npm run build
```

---

### Lot 6 — Bascule et retrait de l'ancien cockpit

Ce lot **doit passer en dernier** : tant que les lots 1→5 ne sont pas livrés, l'app actuelle reste la seule vue disponible.

**Retirer de `src/apps/review/ReviewApp.tsx`** : `CockpitSection`, `FunnelSection`, `AttentionSection`, `OppList`, le tableau `TABS`, `PERIOD_OPTIONS`, `PIE_COLORS`, et les états `funnel` / `callStats` / `attention` devenus orphelins.

**Conserver** : `SharedSection` et tout le circuit de partage (`api/_review/shared.js`, migrations `035`/`036`, table `shared_analyses`) — c'est une fonctionnalité indépendante du deck, en production, avec ses propres tests.

**Décider** (voir D6) le sort des resources `kpis`, `breakdown`, `funnel`, `calls`, `attention` de `api/review.js`.

**Tests** : vérifier qu'aucune régression n'apparaît sur `api/_review/shared.test.js` et `api/_review/period.test.js`.

**Vérifier**
```
npm run test
npm run lint
npm run build
npm run e2e -- desktop.spec.ts
```

---

## 9. Décisions ouvertes

### D1 — Quels rôles accèdent à l'app ?
**Recommandation : `manager` + `admin` uniquement au lot 1.** Le deck expose les performances individuelles nominatives de deux commerciaux et la contribution du PDG ; ce n'est pas un contenu à ouvrir par défaut. `roleAtLeast(profile.role, 'manager')` en garde dans le routeur, `roles: ['manager', 'admin']` dans `src/os/registry.tsx`. Une ouverture ultérieure aux commerciaux passerait par le mécanisme d'analyses partagées existant, qui sait déjà restreindre la config côté serveur.
**Attention** : ajouter `roles` au manifeste retire l'app du dock des commerciaux. Vérifier que le deep link `?open=review` ne casse pas pour eux (il doit renvoyer sur un `EmptyState`, pas sur une page blanche).

### D2 — Configuration des ETP : JSON statique ou table Supabase ?
**Recommandation : table `settings` existante, clé `business_review_fte`.** Le pattern est déjà en place (`api/weekly-targets.js:30-45` : `select('value').eq('key', …)` puis `upsert`), aucune migration n'est nécessaire, et les ETP sont fournis par la direction — ils changeront chaque exercice. Un JSON statique imposerait un déploiement à chaque mise à jour. Forme retenue :
```json
{ "FY25": { "sales": 4.17, "sdr": 0 }, "FY26": { "sales": 2.00, "sdr": 1 } }
```
Écriture réservée à `manager`/`admin`. Valeurs par défaut codées dans `fte-config.js` si la clé est absente, pour que le lot 3 fonctionne sans configuration préalable.

### D3 — Les 8 annexes, ou un sous-ensemble ?
**Recommandation : les 8, mais réparties.** A1 (définitions), A4 (historique), A5 (produit × exercice) et A8 (qualité) sont produites gratuitement par les modules des lots 1, 2 et 5 — les omettre coûterait plus cher que les afficher. A2 (Jérôme) et A3 (activité) sont exigées par R7/R8. A6 (motifs) et A7 (campagnes) sont les tables source des slides 12, 14 et 16 : sans elles, l'utilisateur ne peut pas vérifier un pourcentage. Toutes dans un accordéon replié : aucun coût d'attention pour qui ne les ouvre pas.

### D4 — Périodes : FY seuls, ou trimestres/mois aussi ?
**Recommandation : FY seuls au lancement.** Tout le raisonnement du deck est annuel (bridges FY25→FY26, historique FY22→FY26, ETP moyens annuels, cohorte ARR au 30/06). Un bridge trimestriel n'a pas de sens sans ETP trimestriels, et la cohorte ARR n'existe qu'à l'ouverture d'exercice. `parsePeriod()` sait déjà gérer `FY26-Q2`, `2026-03` et `2026-W14` : la porte reste ouverte sans coût. Le sélecteur du header expose FY22→FY26 et un comparatif (N-1 par défaut).

### D5 — Source des RDV : Excel ou Salesforce ?
Le deck lit les RDV dans `Suivi détaillé FY26.xlsx` (colonnes hebdomadaires Q1–Q4, « semaine travaillée = cellule non vide »). Le repo dispose d'`Event` en Salesforce, filtré sur `Subject` contenant « rdv » (`api/_review/soql.js:eventsQuery`). Les deux ne donneront pas les mêmes chiffres — les 253 RDV de Yanis sont des *RDV pris*, pas nécessairement effectués.
**Recommandation : Salesforce `Event`, avec la limite affichée.** Pas d'ingestion Excel dans une app live : elle recréerait une dépendance manuelle que tout le portail cherche à éliminer. Afficher « RDV Salesforce · périmètre différent du snapshot Excel du 21/07/2026 » sous la table d'activité, et ne pas prétendre reproduire à l'unité les 243/174/101/253 RDV de l'annexe A3.
**À trancher par Alaric** : si l'objectif est la reproduction fidèle du deck plutôt qu'un outil vivant, il faut alors un import Excel — ce qui change le périmètre du lot 3.

### D6 — Que devient `api/review.js` ?
Le compte de fonctions serverless du repo est à **11** (`auth`, `calls`, `cleaner`, `dialer`, `launcher`, `notifications`, `perf`, `profile`, `review`, `status`, `weekly-targets`). Ajouter `business-review.js` porte à **12** — exactement le plafond du plan Vercel Hobby, déjà identifié comme dépendance dans `docs/specs/business-review.md` §11 (« Fonction Vercel (10/12) »).
**Recommandation : ajouter `api/business-review.js` comme prévu, et retirer les resources `kpis`/`breakdown`/`funnel`/`calls`/`attention` de `api/review.js` au lot 6**, en n'y laissant que `shared`. Cela libère `api/_review/{kpis,breakdown,funnel,calls,attention}.js` et leurs requêtes SOQL sans toucher au nombre de fonctions.
**À confirmer** : le plan Vercel du projet. Si c'est Hobby, la marge tombe à zéro et la prochaine app devra fusionner un routeur. Si c'est Pro, aucune contrainte.

### D7 — Périmètre de comparaison du sélecteur
**Recommandation : `compare` limité à N-1.** Le deck ne compare jamais qu'à N-1 (sauf les séries historiques, qui affichent les 5 exercices d'un coup). Exposer un comparatif libre inviterait des bridges FY22→FY26 dont la décomposition volume/ticket ne signifie plus rien à cette distance.

---

## 10. Résumé des vérifications de chiffres

Toutes les valeurs annoncées dans le brief ont été recalculées contre le PDF : **CA total FY26 1,681 M€ = NEW 0,904 + RENEW 0,777 ✓**, **catalogue −591,6 k€ dont 56,4 % RENEW ✓**, **bridge NEW −163,7 k€ = −118,6 volume + −45,1 ticket ✓**, **cycle catalogue médiane 68 j / moyenne 242 j ✓**, ETP et productivité ✓, bridge Owner ✓, Conseil 8 = 3 + 5 ✓, portefeuille 4 statuts + cohorte 106 comptes / 2,235 M€ ✓, test marché 67,2 %→78,5 %, 180→102, p = 0,267 ✓.

Les écarts détectés — tous mineurs et tous documentés — sont listés en §7 (P3 produits vs total, P5 arrondis, P6 tables tronquées) et §2.3 (formule de bridge mal nommée dans le deck).
