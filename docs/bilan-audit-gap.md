# Bilan — Audit du gap entre l'app actuelle et la Business Review FY26

> Audit réalisé le 2026-09-03 sur la branche `enhance-bilan-interactive` (worktree `enhanced-albatross`), après lecture intégrale de `Business_Review_FY26.pdf` et du code réel.
> Doc frère : [`bilan-business-review-plan.md`](./bilan-business-review-plan.md) — le plan d'implémentation.
> Aucun fichier de code n'a été modifié.

---

## 1. Verdict en une phrase

L'app `review` actuelle est un **cockpit d'activité générique** (CA signé, pipeline, closing, funnel SDR, opportunités à surveiller) ; le document est une **revue analytique d'exercice** (bridges, décompositions produit, test statistique, portefeuille, diagnostic de fiabilité). Ce sont deux produits différents sur les mêmes données sources. **Environ 20 % du code existant est réutilisable — mais c'est de l'infrastructure critique**, ce qui rend la réécriture beaucoup moins coûteuse qu'il n'y paraît.

---

## 2. Réutilisable tel quel — ne pas toucher

| Fichier | Lignes | Pourquoi c'est utilisable | Usage dans le nouveau code |
|---------|--------|---------------------------|----------------------------|
| `api/_review/period.js` | 172 | Logique FY juillet→juin complète et **testée** (`period.test.js`, 111 lignes) : `fyIntForDate`, `fyBounds`, `quarterBounds`, `monthBounds`, `weekBounds`, `parsePeriod`, `priorPeriodLabel`, `prior2PeriodLabel`. Exactement la règle R4 du plan. | Import direct depuis `api/_business-review/*`. Aucune duplication. |
| `api/_auth.js` | 82 | `verifyJWT` avec cache 5 min (200 entrées max) contre `/auth/v1/user`. Helper `respond(status, body)`. | Étape 1 du routeur `business-review.js`. |
| `api/_calls/profileCache.js` | 37 | `getProfile(client, userId)` avec TTL 10 min → `{ sfUserId, fullName, role, sfAuthConnectedAt, userLinked }`. | Étape 3 du routeur. |
| `api/_config/access.js` | 186 | `roleAtLeast`, `sfIdKey` (comparaison sur préfixe 15 caractères), `trackingModeFor` — et surtout `WEEKLY_TRACKING_BY_SF_USER` qui identifie déjà **Jérôme comme `dg`** et **Yanis comme `sdr`**. C'est l'implémentation des règles R7 et R8 du plan, déjà en place. | Contrôle de rôle + exclusions DG/SDR. **Ne jamais coder les prénoms en dur** : passer par `trackingModeFor()`. |
| `api/_crm/salesforce.js` | 1001 | `fetchSFToken` (OAuth + refresh + retry), `searchContacts` (pagination `nextRecordsUrl`, plafond `SOQL_FETCH_CAP = 2000`, timeout 30 s), `escapeSOQL`. | Toutes les requêtes du lot 1. Voir §4.1 pour la limite de volumétrie. |
| `src/lib/apiClient.ts` | 58 | `apiFetch<T>(token, path, options)` + classe `ApiError` typée. Pas de cache, pas de retry — suffisant. | Le hook `useBusinessReview`. |
| `src/components/ui/` | — | `GlassCard`, `Tag`, `Select`, `Skeleton`, `EmptyState`, `Button`, `SegmentedControl`, `Modal`, barrel `index.ts`. | Toutes les sections. Aucun nouveau composant de base à créer. |
| `recharts@3.9.2` | — | Déjà installé et utilisé (`BarChart`, `PieChart`, `ResponsiveContainer`). | Waterfall = `BarChart` empilé avec une barre transparente. **Pas de nouvelle dépendance.** |
| `api/_review/shared.js` + `shared.test.js` | 89 + 134 | Partage d'analyses : `listShared` / `createShared` / `revokeShared`, RLS, révocation par `revoked_at`. Migrations `035_shared_analyses.sql` et `036_shared_analyses_revoked_at.sql` appliquées. | **Fonctionnalité indépendante du deck, en production. À conserver intégralement.** |
| `api/review.js` (structure) | 283 | Le pattern de routeur `?resource=` avec exports nommés `GET`/`POST`/`DELETE`/`OPTIONS` et le commentaire expliquant pourquoi `export default` casse (`TypeError: Invalid URL`, corrigé au commit `835b920`). | **Modèle à copier** pour `api/business-review.js`. Le commentaire lignes 75-80 est à relire avant d'écrire le nouveau routeur. |
| `src/apps/review/review.css` | 325 | 44 classes. Réutilisables directement : `.review-app`, `.review-header`, `.review-title`, `.review-subtitle`, `.review-content`, `.review-section`, `.review-error`, `.review-skeleton`, `.review-kpi-grid`, `.review-kpi-card`, `.review-kpi-label`, `.review-kpi-value`, `.review-kpi-sub`, `.review-chart-card`, `.review-card-title`. | Base du nouveau shell ; à compléter par les classes de sidebar. |
| `src/os/registry.tsx` | 96 | Manifeste `{ id: 'review', title: 'Bilan', icon: <ReviewIcon />, defaultSize: { w: 1100, h: 700 } }`. | **`id` et `title` inchangés** (deep links `?open=review` existants). Seul `defaultSize` évolue, plus éventuellement `roles`. |

---

## 3. Réutilisable en partie — à adapter

| Fichier | Ce qui sert | Ce qui manque |
|---------|-------------|---------------|
| `api/_review/soql.js` (125 l.) | Le **pattern** : construction de la liste de champs depuis `mapping.js`, jamais de nom d'API en dur ; helper `ownerClause` avec `escapeSOQL`. Les fonctions `oppsByCloseDate` et `wonInPeriod` sont proches de ce qu'il faut. | Aucune notion de FY multiple : `earliestQueryDate()` remonte à `currentFy − 2` (FY25 au 03/09/2026), il en faut **5** (FY22). Pas de `Raison_de_gain_V2__c`, pas de `CampaignId`. Pas de découpage par exercice — indispensable au vu du plafond de 2 000 enregistrements. |
| `api/_crm/mapping.js` (357 l.) | Contient déjà `saleTypeField: 'Type_de_vente__c'`, `lossReasonField: 'Raison_de_perte_V2__c'`, `commissionTypeField`, `arrCommissionTypes` (« Abonnement 2/3/4/5 ans » — utile pour identifier les contrats ARR de la cohorte catalogue), `stageOrder`, `closedLostStage`. | **Manque `Raison_de_gain_V2__c`** (annexe A6 + slide 14), **`CampaignId` / `Campaign.Name`** (slide 16 + annexe A7). `saleTypes` ne déclare que `catalogue`, `sur_mesure`, `conseil` alors que la picklist réelle inclut aussi `LMS` et `XOS+` — origine directe de l'écart de 8,4 k€ documenté au §7/P3 du plan. |
| `api/_review/kpis.js` (159 l.) | `safeAmount`, `inPeriod`, le filtrage par owner, l'agrégation `by_owner`. | Ne classifie **pas** NEW/RENEW : `ca_signe` mélange les deux sans le dire. Pas de ticket moyen, pas de bridge, pas de conservation. Le concept de « pipeline généré » (somme des `Amount` créés) n'existe nulle part dans le deck — le deck parle de **détections** en nombre, pas en euros. |
| `api/_review/breakdown.js` (63 l.) | Le découpage par `Type_de_vente__c` avec fallback `'Non défini'` — c'est exactement la catégorie résiduelle dont le nouveau `product.js` a besoin (P3). | Un seul exercice, pas de comparaison FY25→FY26, pas de séparation NEW/RENEW, pas de closing ni de cycle par produit. Le deck en exige neuf lignes produit × exercice (annexe A5). |
| `src/apps/review/ReviewApp.tsx` (715 l.) | Le câblage d'authentification (`supabase.auth.getSession` + `onAuthStateChange`), les helpers `fmtEur` / `fmtPct` / `delta`, le pattern `useCallback` + `Promise.all` de chargement. | Tout le reste : navigation par onglets horizontaux à 4 entrées au lieu d'une sidebar à 5 familles + annexes, aucune notion de périmètre affiché, aucun bridge, aucune section du deck. |

---

## 4. Ce qui manque entièrement

### 4.1 Côté API

| Manque | Impact | Où c'est traité |
|--------|--------|-----------------|
| **Classification NEW/RENEW** | Bloquant absolu. Aucune ligne de code du repo ne teste `Name` contre `renew`/`tacite`. Sans elle, aucun chiffre du deck n'est reproductible. | Plan, lot 1 — `api/_business-review/classify.js` |
| **Fenêtre multi-exercices FY22→FY26** | Bloquant. `earliestQueryDate()` s'arrête à N−2. | Plan, lot 1 — `soql.js` / `fetch.js` |
| **Dépassement du plafond SOQL** | Bloquant, et silencieux. `SOQL_FETCH_CAP = 2000` (`salesforce.js:5`) contre **2 200 lignes CreatedDate** et 1 853 lignes CloseDate annoncées par l'annexe A8 du deck. Une requête FY22→FY26 en un appel renverrait `truncated: true` et des chiffres faux sans erreur visible. | Plan, §5.3 — découpage par FY, 5 requêtes parallèles. **Ne pas relever le plafond** : il protège Combo, Labo et Lundi. |
| **Bridges volume/ticket** | Aucun équivalent. Et la formule du deck n'est pas celle que son propre libellé annonce (voir §5 ci-dessous). | Plan, §2.3 + lot 1 |
| **Cycles : médiane, n valide, exclusions** | Aucun calcul de cycle nulle part dans le repo. Le deck exige médiane **et** moyenne **et** n valide **et** compte d'exclusions, présentés ensemble. | Plan, lot 2 |
| **Test statistique deux proportions** | Aucun. p = 0,267, conclusion figée. | Plan, lot 4 |
| **Motifs de gain** | `Raison_de_gain_V2__c` absent de `mapping.js`. | Plan, lots 1 et 4 |
| **Campagnes / canaux** | `CampaignId` absent de `mapping.js`. | Plan, lots 1 et 5 |
| **Portefeuille : 4 statuts + cohorte ARR** | Aucun équivalent. Nécessite une logique de statut par compte au 30/06 et la cohorte d'ouverture catalogue. | Plan, lot 5 |
| **Configuration ETP** | Aucune. Les valeurs 4,17 et 2,00 viennent de la direction, pas de Salesforce. | Plan, lot 3 + décision D2 |
| **Contrôle de conservation** | Aucun. `total == NEW + RENEW` n'est vérifié nulle part. | Plan, R3 — payload `conservation` + `ConservationBadge` |

### 4.2 Côté frontend

Manquent : le shell à sidebar groupée par familles, l'accordéon d'annexes, et les 6 composants `WaterfallChart` / `ScopeTag` / `ConservationBadge` / `FactorMatrix` / `PatternCard` / `StatCard`. Aucun n'existe sous une autre forme dans le repo (vérifié sur `src/components/ui/` et `src/apps/`).

Manque aussi, et c'est moins visible : **la discipline éditoriale du deck**. Chaque slide porte un titre-conclusion (« Le recul NEW combine moins de signatures et un ticket inférieur »), un sous-titre de périmètre (« Analyse NEW uniquement · FY25→FY26 »), une limite de lecture (« le bridge montre d'où vient l'écart, pas pourquoi il existe ») et une ligne de sources. L'app actuelle affiche des titres neutres (« CA par type de vente »). Cette structure éditoriale est une exigence produit, pas une décoration : c'est elle qui empêche les sur-interprétations que le deck passe son temps à désamorcer.

---

## 5. Écarts et incohérences relevés dans le document lui-même

Tous vérifiés par recalcul. Aucun ne remet en cause les conclusions du deck ; tous doivent être gérés explicitement par l'implémentation.

| # | Constat | Conséquence pour l'implémentation |
|---|---------|-----------------------------------|
| E1 | Le deck écrit « bridge prix-volume **symétrique** », mais la formule qui reproduit ses chiffres est séquentielle : `volume = Δq × ticket_N-1` et `ticket = Δticket × q_N`. Vérifié deux fois : NEW global (−118,7 / −45,1 contre −118,6 / −45,1 annoncés) et catalogue NEW (−173,6 / −84,3, exact). La vraie formule symétrique donnerait −115,8 / −47,9. | Implémenter la formule séquentielle. Éviter le mot « symétrique » dans l'UI. |
| E2 | Les produits ne somment pas aux totaux FY26 : CA NEW 900,3 contre 904,0 k€ (−3,7) ; CA total 1 672,6 contre 1 681 k€ (−8,4) ; signatures NEW 55 contre 56 ; fermées NEW 184 contre 186 ; n cycles 42 contre 43. | Reliquat = opportunités hors des trois produits principaux (`LMS`, `XOS+`, ou champ vide). Afficher une catégorie « Autre / non défini » explicite. |
| E3 | Closing partenaires : **56,3 %** slide 16, **56,2 %** annexe A7 (9/16 = 56,25 %). | Fixer une règle d'arrondi unique (demi-supérieur, une décimale). |
| E4 | CA NEW sales FY25 : **733,6 k€** slide 7, mais 733,9 k€ si on le recalcule depuis les M€ arrondis de l'annexe A4 (1,068 − 0,3341). | Toujours calculer depuis les `Amount` bruts, jamais depuis des valeurs déjà arrondies. |
| E5 | L'annexe A6 affiche 8 motifs de perte (121 occurrences) pour un total implicite de 130 (50/38,5 %), et 8 motifs de gain (53) pour 56. La slide 16 affiche 4 canaux sur les 7 de l'annexe A7. | Ce sont des top-N, pas des totaux. Exposer `n_displayed` et `n_total`. Ne jamais recalculer un pourcentage sur la somme des lignes affichées. |
| E6 | Slide 15 : les 4 statuts couvrent 148 comptes, la cohorte catalogue 106. La somme des 4 montants (3,394 M€) dépasse largement le CA FY26 (1,681 M€), parce que « Engagés » et « Perdus » sont de l'ARR (stock) et « Gagnés »/« Fidélisés » du CA signé (flux). | Deux datasets distincts, jamais additionnés. Et deux conservations exploitables : `gagnés + fidélisés = 1 681,1 k€ = CA FY26` et `746,1 / 2 235 = 33,4 %`. |
| E7 | Slide 12 : les barres empilées portent trois motifs mais n'en libellent que deux (78,5 % + 16,9 %). Le troisième (Prix) se déduit : 4,6 % global, 5,9 % catalogue, 2,6 % sur-mesure — cohérent avec l'annexe A6 (Prix, 6 occurrences, 4,6 %). | Calculer et afficher les trois. |
| E8 | La valeur FY25 du test statistique n'est imprimée nulle part (seulement lisible sur la courbe). Reconstruction : 135/185 = 73,0 % contre 102/130 = 78,5 % FY26 → z ≈ 1,11, **p ≈ 0,267** ✓. Les dénominateurs se dérivent exactement de l'annexe A4 : `pertes NEW = fermées NEW − signatures NEW` (FY25 : 248 − 63 = 185 ; FY26 : 186 − 56 = 130 ; FY24 : 371 − 103 = 268, et 268 × 67,2 % = 180 ✓). | Implémenter le test de façon générique et vérifier `p ≈ 0,267` sur fixture. Si l'écart dépasse ±0,005, vérifier d'abord le dénominateur FY25. |
| E9 | Le deck est un **snapshot figé au 21/07/2026** ; l'annexe A8 impose un « refresh live obligatoire avant diffusion actionnaires ». L'app interrogera Salesforce en direct. | Les écarts avec le deck sont normaux. Tests unitaires sur fixtures figées, jamais sur SF live. Bandeau « Données live · dernier rafraîchissement <heure> ». |

---

## 6. Audit des resources actuelles de `api/review.js`

| Resource | Fichier | Verdict | Motif |
|----------|---------|---------|-------|
| `kpis` | `api/_review/kpis.js` (159 l.) | **Ne sert pas au deck** | Mélange NEW et RENEW sans distinction (viole R2). « Pipeline généré » en euros n'a pas d'équivalent dans le deck, qui compte des détections en nombre. `by_owner` ne connaît ni le statut DG ni le statut SDR. `safeAmount` et `inPeriod` sont à recopier, pas à importer (3 lignes chacun). |
| `breakdown` | `api/_review/breakdown.js` (63 l.) | **Base partielle** | Le découpage par `Type_de_vente__c` avec fallback `'Non défini'` est exactement ce qu'il faut pour la catégorie résiduelle (E2). Mais mono-exercice, sans NEW/RENEW, sans closing ni cycle. `product.js` reprend l'idée, pas le fichier. |
| `funnel` | `api/_review/funnel.js` (69 l.) | **Hors périmètre** | Funnel d'appels SDR sur `Resultat_call__c` (« Appel non décroché » → « RDV planifié »). Le deck ne contient aucun funnel d'appels. Il mentionne les 253 RDV de Yanis uniquement pour dire qu'ils **ne sont pas attribuables** (annexe A3, slide 16). |
| `calls` | `api/_review/calls.js` (58 l.) | **Hors périmètre** | Volume d'appels par semaine ISO. Aucune slide. |
| `attention` | `api/_review/attention.js` (111 l.) | **Hors périmètre** | Opportunités ouvertes stagnantes/clés/chaudes, score `jours × montant × probabilité`. Le deck est une rétrospective d'exercice clos ; il ne pilote pas de pipeline ouvert. |
| `shared` | `api/_review/shared.js` (89 l.) | **À conserver** | Fonctionnalité de partage indépendante, en production, testée (`shared.test.js`, 134 l.), avec ses migrations `035`/`036` et sa RLS. Rien dans le deck ne la remet en cause. |

**Recommandation** (décision D6 du plan) : au lot 6, réduire `api/review.js` à la seule resource `shared` et supprimer `kpis.js`, `breakdown.js`, `funnel.js`, `calls.js`, `attention.js` ainsi que leurs constructeurs SOQL. Cela évite d'entretenir deux définitions concurrentes de « CA signé » — l'une classifiant NEW/RENEW, l'autre non — sur la même app, ce qui produirait tôt ou tard deux chiffres contradictoires à l'écran.

---

## 7. Composants frontend : à retirer, à conserver

| Élément de `ReviewApp.tsx` | Verdict |
|---|---|
| `CockpitSection` (l. ~400-500) | **Retirer.** 4 tuiles KPI + donut par type de vente, sans périmètre NEW/RENEW. Remplacé par `SynthesisSection` + `PerformanceSection`. |
| `FunnelSection` (l. ~505-590) | **Retirer.** Aucune slide correspondante. |
| `AttentionSection` + `OppList` (l. ~595-660) | **Retirer.** Aucune slide correspondante. |
| `SharedSection` (l. ~665-715) | **Conserver.** Fonctionnalité de partage. À rebrancher dans le nouveau shell (dernière entrée de la sidebar ou action de header). |
| `TABS`, `PERIOD_OPTIONS`, `PIE_COLORS` | **Retirer.** Remplacés par la navigation en familles et un sélecteur FY22→FY26. |
| `fmtEur`, `fmtPct`, `delta` | **Conserver et déplacer** dans un `helpers.ts` de l'app. `fmtEur` bascule à `M€` au-delà de 10⁶ et à `k€` au-delà de 10³ — cohérent avec le deck. |
| Bloc d'authentification (l. ~185-200) | **Conserver.** `getSession` + `onAuthStateChange`, pattern standard du repo. |
| États `funnel`, `callStats`, `attention` | **Retirer** avec leurs sections (orphelins créés par la suppression). |
| Chargement `Promise.all` de 6 resources (l. ~215-250) | **Remplacer** par le hook `useBusinessReview`, qui charge à la demande par section plutôt que tout d'un coup. Charger 12 resources en parallèle au montage serait un anti-pattern sur des requêtes multi-exercices. |

---

## 8. Contraintes d'infrastructure

**Fonctions serverless.** Le repo compte 11 fonctions à la racine `api/` (`auth`, `calls`, `cleaner`, `dialer`, `launcher`, `notifications`, `perf`, `profile`, `review`, `status`, `weekly-targets`). Ajouter `business-review.js` porte à **12**, soit exactement le plafond du plan Vercel Hobby — contrainte déjà identifiée dans `docs/specs/business-review.md` §11 (« Fonction Vercel (10/12) »). À confirmer avec Alaric : si le projet est en Hobby, la marge tombe à zéro.

**Table `settings`.** Déjà utilisée en clé/valeur JSONB par `api/weekly-targets.js`, `api/status.js`, `api/_dialer/config.js`. Aucune migration nécessaire pour la configuration des ETP.

**Tests.** `vitest.config.ts` inclut `api/**/*.{test,spec}.{js,ts}` et `src/**/*.{test,spec}.{ts,tsx}`, avec `.worktrees/**` exclu. Les nouveaux tests suivent le pattern de `api/_review/period.test.js` : `import { describe, expect, it } from 'vitest'`, imports nommés depuis le module testé, pas de framework de mock au-delà de `vi.fn()`.

**Commandes** : `npm run test` (vitest run), `npm run lint` (eslint), `npm run build` (`tsc --noEmit && vite build`), `npm run e2e` (playwright).

---

## 9. Estimation de l'effort par lot

| Lot | Contenu | API | Frontend | Risque principal |
|-----|---------|-----|----------|------------------|
| 1 | Classification, fenêtre multi-FY, overview, bridge, shell | ~600 l. | ~450 l. | Volumétrie SOQL (plafond 2 000) |
| 2 | Produit et cycles | ~350 l. | ~400 l. | Catégorie résiduelle (E2) |
| 3 | Commercial, ETP, A2/A3 | ~400 l. | ~350 l. | Source des RDV (décision D5) |
| 4 | Marché et motifs | ~300 l. | ~350 l. | Dénominateur FY25 du test (E8) |
| 5 | Portefeuille, canaux, diagnostic, synthèse, qualité | ~550 l. | ~600 l. | Cohorte ARR : reconstruction du stock d'ouverture |
| 6 | Bascule et nettoyage | −450 l. | −300 l. | Non-régression du partage |

Le lot 5 est le plus lourd et le plus incertain : la cohorte d'ouverture du catalogue (106 comptes / 2,235 M€ ARR au 01/07/2025) doit être reconstruite depuis les contrats actifs à cette date, ce qui suppose que `Type_de_commission__c` et les dates d'échéance soient exploitables. **À vérifier sur les données réelles avant de démarrer le lot 5** ; si la reconstruction s'avère impossible, la cohorte devient une donnée de configuration (comme les ETP) plutôt qu'un calcul.
