# Bilan — Cockpit macro & partage d'analyses

> Spec dev-ready v2 — 2026-07-23. Remplace `business-review.md` v1 (contrat).
> Sources : Dashboard V6 (`/Users/theosavoy/xos-dashboard/references/`), collecteur `fetch_dashboard_data_v2.py` (6 requêtes SOQL), WeeklyApp (patterns Recharts/GlassCard), spec v1 (décisions actées 2026-07-11).

## 1. Nom & branding

**Bilan** — la régie théâtrale : l'endroit d'où le metteur en scène monitore tout le spectacle.

| App       | Métaphore         | Rôle                                 |
| --------- | ----------------- | ------------------------------------ |
| Labo      | Laboratoire       | Expérimentation, data hygiene        |
| Combo     | Jeu vidéo         | Prospection, gamification            |
| Lundi     | Rituel hebdo      | Micro-métriques, pulse               |
| **Bilan** | **Bilan théâtre** | **Cockpit macro, pilotage, partage** |
| Coulisses | Backstage         | Settings, configuration              |

- Registry ID : `"review"` (inchangé pour les deep links existants `?open=review`)
- Titre dock : `"Bilan"`
- Icône : pupitre de régie / sliders horizontaux (à créer dans `AppIcons.tsx`)
- Kicker sections : pattern Lundi (`COPY` objet avec `kicker` + `hint`)

## 2. Intention produit

Le cockpit **macro** du pilotage commercial. Sessions d'analyse manager/direction sur période longue (année, trimestre, mois, semaine). Portage du Dashboard V6 dans le portail, en remplaçant le pipeline Python/cron par l'API Vercel.

**Ce que Bilan n'est pas** :

- Pas un outil de saisie
- Pas un deuxième Lundi (les définitions d'activité restent celles de `weekly-perf.md`)
- Pas de LLM
- Pas de classement public (Arena gère l'émulation)

## 3. Périmètre fonctionnel

### 3.1 Sélecteur de période & comparaisons

- **Granularité** : Année / Trimestre / Mois / Semaine
- **Navigation** : toute période sélectionnable (FY, trimestre, mois, semaine ISO)
- **Défaut** : dernière semaine complète (jamais la semaine en cours)
- **Comparaison** : N-1 (primaire) + N-2 (secondaire, si profondeur SF disponible)
- **FY** : juillet → juin (acté 2026-07-11)
- **Tous les KPIs suivent la période** — aucune tuile figée

### 3.2 Sections (portage V6)

| #   | Section         | Kicker          | Contenu                                                                                                    |
| --- | --------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | **Cockpit**     | `"Cockpit"`     | 3 KPIs principaux (CA signé, pipeline généré, taux closing) + comparatif N-1                               |
| 2   | **Activité**    | `"Activité"`    | RDV + opps créées, stacked bar par commercial                                                              |
| 3   | **Performance** | `"Performance"` | Donut CA par `Type_de_vente__c` (nb + % + montants), closing rate (nb et €)                                |
| 4   | **Funnel**      | `"Funnel"`      | Entonnoir SDR : décroché → argumenté → RDV planifié (`Resultat_call__c`)                                   |
| 5   | **Attention**   | `"Attention"`   | Opps sans action (score = ancienneté × montant × probabilité, top 15 + modale), opps clés/chaudes (top 10) |
| 6   | **Appels**      | `"Appels"`      | Calls/semaine + funnel SDR (si données Combo disponibles)                                                  |

### 3.3 Filtre commercial

- Global / par commercial
- Liste pilotée par `profiles` + `sf_user_map` — **jamais de prénoms en dur**
- Manager/admin : tous les commerciaux
- Commercial : uniquement via analyse partagée

### 3.4 Partage d'analyses

- Manager/admin partage une **configuration de vue** (granularité, période, filtre, sections visibles) + **note**
- Destinataire : un profil ou "toute l'équipe"
- Données **recalculées à l'ouverture** (pas de snapshot)
- Commercial : uniquement l'onglet "Partagées avec moi"
- Notification : badge dock + entrée à l'ouverture. Deep link `?open=review&shared=<id>`
- Révocation : `revoked_at` → l'analyse disparaît

## 4. Architecture

```
src/apps/review/
├── ReviewApp.tsx          # Shell : tabs (Explorateur | Partagées), sélecteur période
├── ReviewApp.css
├── review.types.ts        # Types partagés
├── review.api.ts          # apiFetch wrappers
├── sections/
│   ├── CockpitSection.tsx   # KPIs + comparatif
│   ├── ActivitySection.tsx  # RDV + opps, stacked bar
│   ├── PerformanceSection.tsx # Donut CA, closing rate
│   ├── FunnelSection.tsx    # Entonnoir SDR
│   ├── AttentionSection.tsx # Opps sans action + clés
│   └── CallsSection.tsx     # Appels/semaine
├── components/
│   ├── PeriodSelector.tsx   # Granularité + navigation + rappel "vs N-1"
│   ├── OwnerFilter.tsx      # Global / par commercial
│   ├── KpiCard.tsx          # Tuile KPI (valeur + delta N-1)
│   ├── ShareModal.tsx       # Partager cette analyse
│   ├── SharedList.tsx       # Liste "Partagées avec moi"
│   └── OppTable.tsx         # Table opps (attention, clés)
└── helpers.ts             # FY logic, période, formatage

api/review.js              # Routeur unique (?resource=kpis|breakdown|funnel|attention|calls|shared)
api/_review/
├── soql.js                # Requêtes SOQL (portées du collecteur V6)
├── kpis.js                # Agrégation KPIs + comparaisons
├── breakdown.js           # CA par type de vente
├── funnel.js              # Funnel SDR
├── attention.js           # Opps sans action / clés / chaudes
├── calls.js               # Stats appels
└── shared.js              # CRUD analyses partagées
```

### Patterns existants à suivre

| Pattern                      | Source                 | Application              |
| ---------------------------- | ---------------------- | ------------------------ |
| Routeur unique `?resource=`  | `api/calls.js`         | `api/review.js`          |
| Helpers dans sous-dossier    | `api/_calls/`          | `api/_review/`           |
| `apiFetch` + JWT             | `src/lib/apiClient.ts` | `review.api.ts`          |
| GlassCard + Tag + Skeleton   | `src/components/ui/`   | Toutes les sections      |
| Recharts (Bar, Pie, Line)    | `WeeklyApp.tsx`        | Graphiques               |
| `COPY` objet (kicker + hint) | `WeeklyApp.tsx:47-80`  | Titres de sections       |
| `sf_user_map` pour les noms  | `api/_crm/mapping.js`  | Jamais de prénoms en dur |
| Supabase RLS + service-role  | Pattern existant       | Table `shared_analyses`  |

## 5. Contrat API

**Endpoint** : `GET /api/review?resource=…`

| Resource    | Contenu                                 | Params                            | Cache           |
| ----------- | --------------------------------------- | --------------------------------- | --------------- |
| `kpis`      | CA signé, pipeline, closing + N-1/N-2   | `granularity`, `period`, `owner?` | `s-maxage=3600` |
| `breakdown` | CA par `Type_de_vente__c`               | idem                              | `s-maxage=3600` |
| `funnel`    | Funnel SDR (`Resultat_call__c`)         | idem                              | `s-maxage=3600` |
| `attention` | Opps sans action + clés + chaudes       | `owner?`, `limit?`                | `s-maxage=3600` |
| `calls`     | Stats appels (volume, funnel)           | idem                              | `s-maxage=3600` |
| `shared`    | Analyses partagées (avec moi / par moi) | —                                 | `private`       |

**POST** `/api/review` :

- `{action: "share", config: jsonb, note: string, recipient_id?: string}` — manager/admin only
- `{action: "unshare", id: number}` — manager/admin only

**Authz** :

- JWT requis sur toutes les resources
- `granularity/period/owner` libres pour manager/admin
- Commercial : **uniquement** via analyse partagée (config vient de la table, pas du client)
- 401 / 403 / 400 / 502

### Params

```
granularity: "year" | "quarter" | "month" | "week"
period:      "FY26" | "FY26-Q2" | "2026-03" | "2026-W14"
owner:       sf_user_id (optionnel, défaut = global)
```

## 6. Requêtes SOQL (portage V6)

Portées du collecteur `fetch_dashboard_data_v2.py`. **OwnerId, jamais CreatedById.**

### R1 — Opps par CloseDate (CA signé, pipeline, closing, attention)

```sql
SELECT Id, Name, OwnerId, Owner.Name, AccountId, Account.Name, StageName,
       CloseDate, Amount, Probability, IsWon, IsClosed, CreatedDate,
       Type_de_vente__c, ExpectedRevenue, LastActivityDate
FROM Opportunity
WHERE OwnerId IN (:teamIds)
  AND CloseDate >= :queryStart
ORDER BY CloseDate ASC
```

### R2 — Opps par CreatedDate (pipeline généré)

```sql
SELECT Id, Name, OwnerId, Owner.Name, AccountId, Account.Name, StageName,
       CloseDate, Amount, Probability, IsWon, IsClosed, CreatedDate,
       Type_de_vente__c, ExpectedRevenue
FROM Opportunity
WHERE OwnerId IN (:teamIds)
  AND CreatedDate >= :queryStart
ORDER BY CreatedDate ASC
```

### R3 — Events (RDV)

```sql
SELECT Id, Subject, ActivityDate, CreatedDate, OwnerId, Owner.Name,
       DurationInMinutes
FROM Event
WHERE OwnerId IN (:teamIds)
  AND CreatedDate >= :queryStart
```

Filtre JS : `Subject.toLowerCase().includes("rdv")`

### R4 — Appels (funnel SDR)

```sql
SELECT Id, Subject, ActivityDate, CreatedDate, OwnerId, Owner.Name,
       TaskSubtype, Status, Resultat_call__c, CallDurationInSeconds
FROM Task
WHERE OwnerId IN (:teamIds)
  AND CreatedDate >= :queryStart
  AND TaskSubtype = 'Call'
```

### R5 — Comparatif N-1 (même période année précédente)

Mêmes requêtes R1/R2 avec les bornes N-1.

### R6 — Mensuel N-1 (historique annuel comparé)

R2 avec bornes FY N-1.

### Logique FY (portée du collecteur)

```js
// FY juillet → juin
function fyIntForDay(d) {
  return d.getMonth() >= 6
    ? d.getFullYear() + 1 - 2000
    : d.getFullYear() - 2000;
}
function fyBounds(fyInt) {
  return [new Date(2000 + fyInt - 1, 6, 1), new Date(2000 + fyInt, 5, 30)];
}
function quarterIndex(d) {
  return d.getMonth() >= 6
    ? Math.floor((d.getMonth() - 6) / 3) + 1
    : Math.floor((d.getMonth() + 6) / 3);
}
```

### Règles de calcul

| KPI               | Définition                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CA signé          | `SUM(Amount)` où `IsWon = true` et `CloseDate ∈ période`                                                                  |
| Pipeline généré   | `COUNT` + `SUM(Amount)` des opps `CreatedDate ∈ période`                                                                  |
| Taux closing (nb) | `IsWon / (IsWon + IsClosed-Lost)` sur la période                                                                          |
| Taux closing (€)  | `SUM(Amount won) / SUM(Amount closed)` sur la période                                                                     |
| RDV               | Events avec "rdv" dans Subject, `ActivityDate ∈ période`                                                                  |
| Funnel SDR        | `Resultat_call__c` : "Appel non décroché" + "Message répondeur" → "Appel décroché" → "Appel argumenté" → "RDV planifié"   |
| Opps sans action  | `IsClosed = false` AND `LastActivityDate` ancien. Score = `days_since_activity × (Amount/1000) × (Probability/100 + 0.1)` |
| Sur-mesure 6 mois | `CloseDate ∈ [aujourd'hui, +180j]`, jamais de CloseDate passées                                                           |

### Pièges (hérités V6, obligatoires)

- **Owner, pas créateur** : attribution par `OwnerId` (CreatedById peut être un admin)
- **Semaine ISO** : vérifier contre une date réelle (helper décalé = tout corrompt)
- **Pas de double comptage** : "Global" inclut chaque commercial — ne jamais sommer Global + individus
- **Stages fantômes** : uniquement `IsWon`/`IsClosed`, pas de libellés en dur
- **RDV rétroactifs** : `ActivityDate` comme référence (events créés après coup)

## 7. Persistance (Supabase)

```sql
CREATE TABLE shared_analyses (
  id            BIGSERIAL PRIMARY KEY,
  created_by    UUID REFERENCES profiles(id) NOT NULL,
  recipient_id  UUID REFERENCES profiles(id),  -- NULL = toute l'équipe
  config        JSONB NOT NULL,
  -- config shape: { granularity, period, owner?, sections: string[] }
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  revoked_at    TIMESTAMPTZ  -- NULL = actif
);

-- RLS
ALTER TABLE shared_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_own_shared" ON shared_analyses
  FOR SELECT USING (
    created_by = auth.uid()
    OR recipient_id = auth.uid()
    OR recipient_id IS NULL
  );
-- Écriture via service-role uniquement (pattern existant)
```

## 8. UI — Composants

### 8.1 ReviewApp (shell)

```
┌─────────────────────────────────────────────────────────┐
│  Bilan                                    [Partager]    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ [Année] [Trimestre] [Mois] [Semaine]  ◀ FY26 ▶ │    │
│  │ Commercial: [Global ▼]    vs FY25 (N-1)        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                  │
│  │CA signé │ │Pipeline │ │Closing  │  ← CockpitSection │
│  │  245k€  │ │  180k€  │ │  32%    │                  │
│  │ +12% N-1│ │ -3% N-1 │ │ +5pts   │                  │
│  └─────────┘ └─────────┘ └─────────┘                  │
│                                                         │
│  ┌──────────────────────┐ ┌──────────────────────┐     │
│  │ Activité (stacked)   │ │ Performance (donut)  │     │
│  └──────────────────────┘ └──────────────────────┘     │
│  ┌──────────────────────┐ ┌──────────────────────┐     │
│  │ Funnel SDR           │ │ Attention (opps)     │     │
│  └──────────────────────┘ └──────────────────────┘     │
│  ┌──────────────────────────────────────────────┐      │
│  │ Appels                                       │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Commercial (vue restreinte)

```
┌─────────────────────────────────────────────────────────┐
│  Bilan                                                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Partagées avec moi                              │    │
│  │                                                 │    │
│  │ 📋 T2 FY26 — Paul                              │    │
│  │    "Focus sur le pipeline sur-mesure,           │    │
│  │     3 opps à pousser avant fin juin"            │    │
│  │    [Ouvrir]                                     │    │
│  │                                                 │    │
│  │ 📋 Semaine 14 — Toute l'équipe                  │    │
│  │    "Bonne semaine, on maintient le rythme"      │    │
│  │    [Ouvrir]                                     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Composants Recharts

| Section     | Chart                                   | Recharts                       |
| ----------- | --------------------------------------- | ------------------------------ |
| Cockpit     | KPI cards (pas de chart)                | —                              |
| Activité    | Stacked bar (RDV + opps par commercial) | `BarChart` + `Bar stackId`     |
| Performance | Donut CA par type                       | `PieChart` + `Pie innerRadius` |
| Funnel      | Entonnoir horizontal                    | `BarChart layout="vertical"`   |
| Attention   | Table (pas de chart)                    | —                              |
| Appels      | Line (calls/semaine) + bar (funnel)     | `LineChart` + `BarChart`       |

### 8.4 COPY (pattern Lundi)

```ts
const COPY = {
  cockpit: {
    kicker: 'Cockpit',
    hint: 'CA signé, pipeline généré, taux de closing — et si on tient le rythme vs N-1.',
  },
  activity: {
    kicker: 'Activité',
    hint: 'RDV et détections par commercial — le moteur du pipeline.',
  },
  performance: {
    kicker: 'Performance',
    hint: 'Répartition du CA par type de vente, closing rate en volume et en valeur.',
  },
  funnel: {
    kicker: 'Funnel',
    hint: 'Du décroché au RDV planifié — où ça convertit, où ça coince.',
  },
  attention: {
    kicker: 'Attention',
    hint: 'Les opps qui dorment et les deals qui comptent — à traiter en priorité.',
  },
  calls: {
    kicker: 'Appels',
    hint: "Volume d'appels et funnel SDR — l'activité qui alimente le pipeline.",
  },
};
```

## 9. Lots

### 6.0 — Audit & validation — ⬜ (partiellement fait)

**Fait** : FY juillet→juin acté, picklists vérifiées (`Type_de_vente__c` : Catalogue, Sur-mesure, Conseil, LMS, XOS+ / `Resultat_call__c` : 5 valeurs).

**Reste** :

- Profondeur historique SF : N-2 disponible ? (vérifier `CreatedDate` la plus ancienne)
- Volumétrie SOQL : nombre d'opps sur 3 FY, temps de réponse, pagination
- `sf_user_map` : vérifier que tous les commerciaux actuels sont mappés
- Validation Théo sur les sections à porter en priorité

**Bloque** : 6.1

### 6.1 — API + migration — ⬜

- `api/review.js` : routeur (`?resource=kpis|breakdown|funnel|attention|calls|shared`)
- `api/_review/soql.js` : les 6 requêtes portées du collecteur V6 (paramétrées par période)
- `api/_review/kpis.js` : agrégation + comparaisons N-1/N-2
- `api/_review/breakdown.js` : CA par type
- `api/_review/funnel.js` : funnel SDR
- `api/_review/attention.js` : scoring opps sans action
- `api/_review/calls.js` : stats appels
- `api/_review/shared.js` : CRUD analyses partagées
- Migration Supabase : `shared_analyses`
- Cache headers : `s-maxage=3600` macro, `private` shared
- Authz : JWT + rôle (commercial → shared only)

**Vérifié par** :

- `curl /api/review?resource=kpis&granularity=quarter&period=FY26-Q2` → JSON cohérent
- Comparaison manuelle SOQL vs API (±5%)
- Commercial sans partage → 403 sur `kpis`
- `POST share` → `GET shared` → l'analyse apparaît

### 6.2 — UI — ⬜

- `src/apps/review/ReviewApp.tsx` : shell + tabs
- `src/apps/review/sections/` : 6 sections (Cockpit → Appels)
- `src/apps/review/components/` : PeriodSelector, OwnerFilter, KpiCard, ShareModal, SharedList, OppTable
- Registry : ajout `id: "review"`, `title: "Bilan"`, icône, `defaultSize: { w: 1200, h: 760 }`
- Dock : visible tous rôles
- Deep link : `?open=review&shared=<id>`
- États : Skeleton / EmptyState / erreur + Réessayer
- Wording comparatifs explicite : "T2 FY26 vs T2 FY25", jamais "+12%" seul

**Vérifié par** :

- Changer granularité → tous les KPIs se mettent à jour
- Filtre commercial → données filtrées
- Donut : nb + % + montants
- Funnel : vraies valeurs picklist
- Partage bout en bout : manager partage → commercial voit → révocation effective
- `npm run build` + `npm run lint` + `npm run test` passent

## 10. Critères d'acceptation

1. Changer granularité/période met à jour **tous** les KPIs ; défaut = dernière semaine complète
2. Comparaison N-1 exacte (±5% vs SOQL manuel) ; N-2 si profondeur disponible
3. Filtre commercial piloté par `profiles` + `sf_user_map` (aucun prénom en dur)
4. Partage : manager partage → commercial voit avec la note ; commercial sans partage → 403 ; révocation effective
5. Donut CA : nb + % + montants ; funnel avec les vraies valeurs picklist
6. Cache 1h macro ; `shared` en `private`
7. Gate QC : `tsc`, `eslint`, `build`, non-régression Cleaner + tests API authz
8. Registry : `"Bilan"` dans le dock, icône dédiée, deep link fonctionnel

## 11. Dépendances

| Prérequis                                               | État                 | Bloque                     |
| ------------------------------------------------------- | -------------------- | -------------------------- |
| Phase 8 OAuth SF                                        | ✅                   | 6.1 (accès API SF)         |
| Adapter CRM `api/_crm/`                                 | ✅                   | 6.1 (mapping, sf_user_map) |
| Recharts                                                | ✅ (déjà dans Lundi) | 6.2                        |
| Design system (GlassCard, Tag, Skeleton, Select, Modal) | ✅                   | 6.2                        |
| Fonction Vercel (10/12)                                 | ⬜                   | 6.1                        |
| Validation Théo sections prioritaires                   | ⬜                   | 6.1                        |

## 12. Hors périmètre (v1)

- ❌ Snapshot figé (données recalculées à l'ouverture)
- ❌ Email/Slack notification (badge dock suffit)
- ❌ Export PDF/Excel
- ❌ LLM / IA
- ❌ Classement public (Arena)
- ❌ Sections V6 non portées en v1 : Forecast, Aide à la décision, Historique annuel (v2 si besoin)
