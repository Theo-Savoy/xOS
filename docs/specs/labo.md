# Labo — Design fonctionnel et technique

**Statut** : validé par Théo le 2026-07-12  
**Périmètre** : reconstruction V1 de Labo dans X OS  
**Plan d’exécution** : `docs/plans/labo-implementation.md`

## 1. Décision produit

**Labo**, anciennement CRM Cleaner, devient un **atelier modulaire de santé et de correction du CRM**. La V1 reconstruit intégralement les capacités du legacy pour les opportunités, en React/TypeScript et selon les standards X OS. Le rapport actuel n’est plus l’application entière : il devient le premier module, **Opportunités**.

La V1 prépare les futurs modules — doublons, contacts, comptes — sans les implémenter. Leur ajout ultérieur ne doit pas obliger à réécrire le cockpit, la navigation, les permissions, le journal ou les primitives d’action.

### 1.1 Frontière avec Copilot

La frontière repose sur la nature du problème, pas sur un seuil temporel :

- **Labo** corrige une donnée objectivement incorrecte, incohérente, invalide ou contraire à une règle d’hygiène explicite.
- **Copilot** recommande une action commerciale lorsque la donnée peut être correcte mais que la situation mérite une relance, un rendez-vous ou une prochaine étape.

Invariant : **l’inactivité seule n’est jamais un critère d’entrée autonome dans Labo**. Elle peut enrichir le diagnostic et le score d’une opportunité déjà anormale.

Exemples Labo : CloseDate passée sur une opportunité ouverte, montant incohérent, propriétaire inactif, étape obsolète, combinaison de picklists invalide, doublon.  
Exemples Copilot : opportunité future non travaillée, proposition sans relance, rendez-vous sans prochaine étape, portefeuille à réattaquer.

## 2. Objectifs et non-objectifs

### 2.1 Objectifs V1

- Remplacer l’iframe `public/dashboard.html` par une application React/TypeScript native.
- Garantir au minimum la parité fonctionnelle complète avec le legacy.
- Introduire un cockpit hybride : santé factuelle + orientation vers les actions.
- Permettre le multitâche entre modules via des onglets internes.
- Livrer le module Opportunités avec trois vues : Nettoyage, Synthèse, Historique.
- Respecter les rôles X OS côté serveur.
- Migrer complètement l’historique Vercel Blob vers Supabase `action_journal`.
- Centraliser les noms de champs et valeurs Salesforce dans `api/_crm/mapping.js`.
- Prévisualiser et valider côté serveur toute écriture avant exécution.
- Exposer les erreurs métier et d’intégration sans échec silencieux.

### 2.2 Non-objectifs V1

- Implémenter les modules Doublons, Contacts ou Comptes.
- Construire un moteur de règles générique piloté intégralement par JSON.
- Ajouter des microfrontends, plugins distants, Redux global ou bus d’événements.
- Dupliquer les recommandations de travail de Copilot.
- Ajouter un score global artificiel de santé CRM.
- Implémenter un multi-CRM ou multi-tenant réel.

## 3. Architecture directrice : monolithe modulaire en tranches verticales

Le système est un monolithe modulaire. Chaque module possède sa tranche front et backend ; le shell ne connaît pas les objets Salesforce.

```text
src/apps/cleaner/
├── shell/
│   ├── CleanerShell.tsx
│   ├── CleanerCockpit.tsx
│   ├── CleanerTabs.tsx
│   ├── moduleRegistry.ts
│   └── shellState.ts
├── modules/
│   └── opportunities/
│       ├── manifest.ts
│       ├── OpportunitiesModule.tsx
│       ├── OpportunitiesCleaningView.tsx
│       ├── OpportunitiesAnalyticsView.tsx
│       ├── OpportunitiesHistoryView.tsx
│       ├── OpportunitiesTable.tsx
│       ├── OpportunitiesFilters.tsx
│       ├── OpportunityDetailPanel.tsx
│       ├── BulkActionPanel.tsx
│       ├── api.ts
│       ├── types.ts
│       └── *.test.tsx
├── shared/
│   └── primitives réellement utilisées par au moins deux modules
├── CleanerApp.tsx
└── cleaner.css

api/cleaner.js
api/_cleaner/
├── core/
│   ├── authorization.js
│   ├── settings.js
│   ├── audit.js
│   ├── validation.js
│   ├── idempotency.js
│   └── errors.js
└── opportunities/
    ├── read.js
    ├── rules.js
    ├── score.js
    ├── analytics.js
    ├── preview.js
    ├── execute.js
    └── *.test.js
```

### 3.1 Contrat de module front

```ts
export type CleanerModuleManifest = {
  id: string;
  title: string;
  icon: React.ReactNode;
  roles: AppRole[];
  component: React.LazyExoticComponent<React.FC<CleanerModuleProps>>;
};

export type CleanerModuleSummary = {
  moduleId: string;
  health: 'healthy' | 'warning' | 'critical';
  anomalyCount: number;
  affectedRecordCount: number;
  criticalCount: number;
  resolvedPeriodCount: number;
  previousPeriodDelta: number | null;
  lastRefreshedAt: string;
};
```

Le registre est statique et typé. Aucun chargement de plugin distant. Un composant n’entre dans `shared/` qu’après un deuxième usage réel.

### 3.2 Contrat d’anomalie

Les règles ne renvoient jamais des libellés utilisés comme identifiants.

```ts
export type CleanerAnomaly = {
  ruleId: string;
  severity: 'warning' | 'critical';
  score: number;
  label: string;
  evidence: Array<{
    field: string;
    actual: string | number | null;
    expected: string;
  }>;
};
```

Les `ruleId` sont stables et versionnés, par exemple :

- `opportunity.close_date.past`
- `opportunity.amount.missing`
- `opportunity.amount.implausible`
- `opportunity.probability.zero`
- `opportunity.owner.inactive`
- `opportunity.owner.former_employee`
- `opportunity.stage.stalled_suspect`
- `opportunity.age.old`

Détection et correction sont séparées : une anomalie peut proposer plusieurs corrections sans en exécuter automatiquement une.

## 4. Navigation et état

### 4.1 Deux niveaux

1. **Cockpit d’accueil** : santé globale, modules, activité récente et raccourcis.
2. **Espace de travail multi-onglets** : un onglet unique par module.

Règles :

- `Accueil` est fixe et non fermable.
- Un module n’a qu’un onglet ; le rouvrir réactive l’onglet existant.
- Un onglet conserve filtres, tri, pagination et sélection pendant la session.
- Les onglets servent au multitâche entre modules, pas entre variantes d’un même rapport.
- Fermer un onglet retire la vue de travail, jamais les données.

### 4.2 Cockpit hybride

Le cockpit montre des faits explicables, sans score global `/100` :

- total d’anomalies ;
- nombre d’enregistrements concernés ;
- criticité par module ;
- évolution par rapport à la période précédente ;
- corrections réalisées et taux de résolution ;
- fraîcheur des données ;
- modules classés par criticité avec raccourci d’ouverture.

Il ne duplique ni les tableaux ni les analyses détaillées des modules.

## 5. Module Opportunités

### 5.1 Navigation interne

```text
[ Nettoyage ] [ Synthèse ] [ Historique ]
```

Ces vues ne créent pas d’onglets applicatifs supplémentaires.

### 5.2 Vue Nettoyage

Ordre de lecture :

1. titre, fraîcheur, actualisation ;
2. bandeau KPI compact B1 ;
3. catégories de règles avec compteurs ;
4. filtres et recherche ;
5. tableau principal ;
6. barre sticky de traitement dès qu’une sélection existe.

KPIs minimum :

- opportunités à nettoyer et part des opportunités ouvertes ;
- CA concerné ;
- aucune activité enregistrée parmi les opportunités déjà anormales ;
- propriétaires inactifs ;
- montants incohérents.

Les KPIs et compteurs de règles sont cliquables et appliquent le filtre correspondant.

### 5.3 Tableau

Le tableau conserve au minimum les données et capacités legacy :

- catégorie/règle principale ;
- score ;
- opportunité et compte ;
- propriétaire et statut ;
- étape ;
- CloseDate et retard ;
- montant ;
- probabilité ;
- dernière activité ;
- toutes les raisons d’anomalie ;
- lien Salesforce.

Fonctions : tri, pagination, recherche, filtres propriétaire/catégorie/type/raisons, logique **OU dans une famille et ET entre familles**, sélection individuelle, page courante et tous les résultats filtrés.

Cliquer sur le contenu d’une ligne ouvre un panneau détail. Cliquer sur la checkbox ne l’ouvre pas.

### 5.4 Panneau détail

Le panneau latéral affiche :

- anomalies et preuves ;
- champs CRM utiles et valeurs actuelles ;
- corrections disponibles ;
- historique récent ;
- lien Salesforce.

Il reste optionnel et immédiatement refermable. Le tableau et la sélection multiple restent opérationnels.

### 5.5 Vue Synthèse

La vue reprend et redessine toutes les analyses utiles du legacy :

- répartition par propriétaire : volume, actif/inactif, CA concerné ;
- répartition par étape ;
- distribution par ancienneté de CloseDate dépassée ;
- répartition par règle/raison d’anomalie ;
- évolution des anomalies ;
- évolution des corrections et taux de résolution ;
- explication du score d’hygiène.

Cliquer sur une tranche ouvre la vue Nettoyage avec le filtre correspondant.

### 5.6 Vue Historique

Historique paginé depuis Supabase :

- date ;
- acteur ;
- module et action ;
- cibles ;
- valeurs avant/après ;
- résultats par enregistrement ;
- erreurs ;
- liens Salesforce.

## 6. Règles, seuils et rôles

### 6.1 Règles et seuils

- Catalogue de règles codé, versionné et testé.
- Seuils utiles configurables dans le Hub par manager/admin.
- Labo affiche les règles actives mais ne les édite pas.
- Aucun constructeur de règles V1.
- Les seuils sont lus depuis `settings`, avec valeurs par défaut explicites et validées.

Clé Supabase unique `cleaner_v2` :

```json
{
  "amountImplausibleMax": 100,
  "closeDateCriticalDays": 90,
  "opportunityOldDays": 365,
  "opportunityVeryOldDays": 730,
  "score": {
    "overduePointEveryDays": 30,
    "overdueCap": 12,
    "neverActive": 8,
    "inactive30Days": 2,
    "inactive90Days": 5,
    "inactive365Days": 5,
    "amountMissing": 6,
    "amountImplausible": 10,
    "probabilityZero": 3,
    "ownerInactive": 10,
    "formerEmployee": 8,
    "oldOpportunity": 2,
    "veryOldOpportunity": 4,
    "stalledStage": 3,
    "amountPointEvery": 10000,
    "amountCap": 5
  }
}
```

Ces valeurs reprennent le comportement legacy. Le Hub utilise un formulaire typé avec bornes ; l'ancienne clé d'exemple `cleaner_late_days` est retirée, car l'inactivité n'est pas une règle d'entrée Labo.

### 6.2 Visibilité

- **Commercial** : ses opportunités uniquement.
- **Manager/admin** : vue équipe, filtre propriétaire, traitement global.
- L’API filtre et autorise côté serveur.

Le backend retourne des capacités explicites :

```ts
export type CleanerCapabilities = {
  canViewTeam: boolean;
  canReassign: boolean;
  canBulkEdit: boolean;
  canBulkClose: boolean;
  canManageRules: boolean;
};
```

Le front adapte l’interface ; le serveur revérifie chaque commande.

## 7. Actions et fiabilité des écritures

### 7.1 Sélection

- checkbox par ligne ;
- sélection de la page ;
- commande explicite « Sélectionner les N résultats filtrés » ;
- sélection conservée pendant tri, pagination et changement de vue interne.

### 7.2 Actions minimum

- réassigner à un utilisateur ;
- réassigner au propriétaire du compte ;
- modifier CloseDate ;
- modifier l’étape ;
- modifier le type de vente ;
- modifier plusieurs champs dans une même opération ;
- clore en perdue avec raison compatible avec la picklist dépendante Salesforce.

### 7.3 Preview puis execute

```text
sélection → configuration → preview serveur → confirmation → exécution → résultats
```

`POST preview` retourne :

- changements normalisés ;
- valeurs actuelles relues ;
- enregistrements modifiables ;
- exclusions et raisons ;
- jeton de preview court et empreinte de la sélection.

`POST execute` accepte uniquement un preview encore valide et une clé d’idempotence. Si les données ont changé, il retourne `409 stale_preview` sans écrire.

Résultat partiel :

- les réussites sont actualisées ou retirées ;
- les échecs restent sélectionnés ;
- chaque erreur est visible ;
- une action individuelle utilise exactement le même moteur.

## 8. API et flux de données

Une seule fonction Vercel exposée : `api/cleaner.js`. Ressources internes :

- `GET ?module=opportunities&resource=workspace`
- `GET ?module=opportunities&resource=analytics`
- `GET ?module=opportunities&resource=history`
- `POST { module: "opportunities", action: "preview", ... }`
- `POST { module: "opportunities", action: "execute", ... }`

Principes :

- JWT X OS obligatoire ;
- profil et rôle lus côté serveur ;
- Salesforce via `api/_crm/salesforce.js` ;
- champs et picklists via `api/_crm/mapping.js` ;
- token personnel quand disponible, fallback intégration existant ;
- requêtes Salesforce paginées ;
- cache serveur court des données brutes, filtrage utilisateur après cache ;
- aucune réponse personnalisée dans un cache CDN partagé ;
- analytics et workspace dérivés de la même vérité ;
- aucune confiance dans les IDs ou valeurs envoyés par React.

## 9. Historique et migration complète

### 9.1 Modèle de persistance

- `action_journal` reste le journal canonique et reçoit `source`, `source_id`, `module_id` et `command_id`.
- `actor` devient nullable uniquement pour les imports legacy qui ne contiennent aucun identifiant fiable. Les nouvelles écritures Labo refusent toujours un acteur absent.
- `cleaner_commands` persiste previews, expiration, fingerprint, statut, idempotency key et résultat. Contrainte unique : `(actor, idempotency_key)`.
- `cleaner_action_targets` stocke une ligne par cible avec objet/ID Salesforce, owner SF, avant/après, succès et erreur. Cette table permet pagination, audit et scope commercial sans interroger du JSON libre.
- Les actions legacy sans acteur sont libellées `Legacy CRM Cleaner` et visibles uniquement des managers/admins. Les commerciaux voient leurs actions et les nouvelles actions ciblant leurs enregistrements.

La migration est idempotente :

1. lister tous les blobs `history/*.json` ;
2. normaliser chaque entrée ;
3. calculer un identifiant déterministe à partir du pathname ;
4. insérer dans `action_journal` sans doublon ;
5. comparer nombre d’actions, nombre de cibles et échecs avant/après ;
6. basculer toutes les lectures et écritures sur Supabase.

Une migration SQL ajoute les métadonnées nécessaires à l’idempotence et aux requêtes Labo, sans casser les autres producteurs de `action_journal`.

Les blobs restent une sauvegarde de recette. Leur suppression est une action séparée nécessitant l’accord explicite de Théo.

## 10. Erreurs

Codes et comportements :

- `401 unauthorized` : session expirée ;
- `403 forbidden` : capacité refusée ;
- `409 stale_preview` ou `duplicate_command` : aucune écriture ;
- `422 invalid_selection` / `invalid_change` : détail par enregistrement ;
- `502 salesforce_error` : données conservées, aucune réussite simulée ;
- `503 service_unavailable` : réessai explicite.

Toute erreur d’intégration doit remonter en moins de 30 secondes. Aucun `catch {}` silencieux sur un flux métier.

## 11. Matrice de parité legacy

| Capacité legacy                              | Cible v2              | Preuve obligatoire            |
| -------------------------------------------- | --------------------- | ----------------------------- |
| KPIs                                         | bandeau B1            | tests valeurs + filtres       |
| Owner / étape / retard / raisons             | Synthèse              | agrégats + navigation filtrée |
| Score et aide                                | règles + Synthèse     | tests unitaires + explication |
| Tri / pagination / recherche                 | tableau               | tests React                   |
| Filtres propriétaire / catégorie / type      | Nettoyage             | tests combinatoires           |
| Raisons OU intra-famille / ET inter-familles | moteur de filtres     | cas croisés                   |
| Sélection persistante                        | tableau + shell       | pages, tri, vues              |
| Sélection de tout le résultat filtré         | tableau               | test volume explicite         |
| Owner, CloseDate, étape, type                | panneau action        | preview + execute             |
| Owner du compte                              | action réassignation  | fallback et exclusion         |
| Clore en perdue                              | action spécialisée    | picklists dépendantes         |
| Résultats partiels                           | barre + journal       | réussites/échecs              |
| Historique                                   | Supabase              | import + pagination           |
| `/clean?q=`                                  | paramètres CleanerApp | ouverture préfiltrée          |
| Actualisation/cache                          | workspace             | fraîcheur + cache-buster      |
| Auth X OS / identité SF                      | API Labo              | 401/403 + token personnel     |

Aucune bascule n’est autorisée tant qu’une ligne n’a pas de test ou de vérification exécutable.

## 12. Tests et recette

- Unitaires : règles, score, filtres, permissions, agrégations, validation, idempotence.
- API : workspace, analytics, history, preview, execute avec Salesforce/Supabase simulés.
- React : cockpit, onglets, trois vues, tableau, panneau détail, sélection, actions.
- Migration : import à blanc, import réel contrôlé, second passage sans doublon.
- Intégration : `/clean?q=`, rôles, settings Hub, journal.
- Visuel : tailles min/max de fenêtre X OS et états loading/vide/erreur/partiel.
- Live : enregistrements Salesforce dédiés, après accord explicite.

Gate finale :

```bash
npm run test
npm run lint
npm run build
npx prettier --check .
node --check api/cleaner.js
node scripts/migrate-cleaner-history.js --dry-run
```

Le script de migration doit aussi imprimer les comptes source/cible et retourner un exit code non nul en cas d’écart.

## 13. Bascule et retrait du legacy

1. Construire v2 en conservant le legacy.
2. Importer et vérifier l’historique.
3. Passer la matrice de parité.
4. Basculer `CleanerApp` vers le shell React.
5. Recetter les rôles et écritures.
6. Vérifier qu’aucun appel runtime ne cible les endpoints legacy.
7. Retirer `public/dashboard.html`, `api/refresh.py`, `api/update.js`, `api/history.js`, `api/version.js` et les règles middleware associées.
8. Mettre à jour README, documentation d’architecture et inventaire Vercel.

Les usages runtime actuels de ces routes sont limités à l’iframe legacy de Labo. Les références dans les tests et documents doivent être mises à jour lors du retrait.

## 14. Arbitrages écartés

- **Monolithe React unique** : rapide à démarrer, reproduit le couplage du legacy.
- **Moteur JSON générique** : complexité et validation runtime prématurées.
- **Plusieurs onglets du même module** : mêmes données, complexité sans bénéfice V1.
- **Analyses au-dessus du tableau** : repousse la file de travail ; remplacé par une vue Synthèse dédiée.
- **Rail KPI permanent** : réduit trop la largeur utile ; bandeau B1 retenu.
- **Score global CRM** : précision fictive entre anomalies hétérogènes.
- **Inactivité autonome dans Labo** : relève de Copilot tant que la donnée n’est pas objectivement anormale.
