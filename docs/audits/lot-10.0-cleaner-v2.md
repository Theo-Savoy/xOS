# Lot 10.0 — CRM Cleaner v2 : parité legacy et audit de volume

## Statut

Le contrat de fixtures est figé et le test de parité passe désormais avec les règles pures du Task 2. Le lot 10.0 ne livre pas encore l’API, le shell ou l’interface Labo.

L’audit Salesforce n’a pas été exécuté : l’exécution live nécessite une approbation explicite et une session Hermes Salesforce valide. Les volumes ci-dessous sont donc **non mesurés** ; aucun chiffre n’est inventé.

| Mesure requise                             | Valeur lot 10.0            |
| ------------------------------------------ | -------------------------- |
| Opportunités ouvertes                      | Bloqué — audit non exécuté |
| Candidats anomalie retournés               | Bloqué — audit non exécuté |
| Propriétaires inactifs parmi les candidats | Bloqué — audit non exécuté |
| Étapes actives                             | Bloqué — audit non exécuté |
| Métadonnées de picklists actives           | Bloqué — audit non exécuté |

## Source legacy figée

- `public/dashboard.html` : UI, familles de raisons, filtres, sélection, actions et historique.
- `api/refresh.py` : périmètre des candidats, score, métadonnées d’étapes/utilisateurs/picklists.
- `api/update.js` : validation des actions bulk, owner de compte, limite de 200 et résultats partiels.
- `api/history.js` : forme de l’historique legacy.

Les fixtures ne contiennent que des identifiants, noms, comptes et valeurs synthétiques. Elles ne reprennent ni texte CRM, ni donnée personnelle, ni secret, ni token.

### Anomalies legacy couvertes

| Famille                             | Cas figé                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| CloseDate                           | dépassée `>1 an`, `6–12 mois`, `3–6 mois`, `<3 mois`            |
| Activité (enrichissement seulement) | jamais enregistrée, `>1 an`, `>3 mois`, `>30j`                  |
| Valeurs                             | montant absent, probabilité à `0 %`, montant incohérent `1–100` |
| Propriétaire                        | inactif, ancien commercial                                      |
| Âge / étape                         | opportunité créée `>2 ans`, `>1 an`, `Suspect enlisé`           |
| Garde-fou v2                        | une opportunité inactive seule n’est pas candidate Labo         |

### Actions legacy couvertes

- Réassigner à un utilisateur actif.
- Réassigner au propriétaire du compte (avec absence possible de propriétaire de compte).
- Modifier CloseDate, étape et type de vente, seuls ou combinés.
- Clore en perdue avec raison de perte compatible avec la picklist dépendante.
- Exclure/retourner explicitement le cas incompatible et les résultats partiels.

## Matrice de parité — copie de §11

| Capacité legacy                              | Cible v2              | Preuve obligatoire            | Statut lot 10.0 |
| -------------------------------------------- | --------------------- | ----------------------------- | --------------- |
| KPIs                                         | bandeau B1            | tests valeurs + filtres       | Contrat figé    |
| Owner / étape / retard / raisons             | Synthèse              | agrégats + navigation filtrée | Contrat figé    |
| Score et aide                                | règles + Synthèse     | tests unitaires + explication | Contrat figé    |
| Tri / pagination / recherche                 | tableau               | tests React                   | Contrat figé    |
| Filtres propriétaire / catégorie / type      | Nettoyage             | tests combinatoires           | Contrat figé    |
| Raisons OU intra-famille / ET inter-familles | moteur de filtres     | cas croisés                   | Contrat figé    |
| Sélection persistante                        | tableau + shell       | pages, tri, vues              | Contrat figé    |
| Sélection de tout le résultat filtré         | tableau               | test volume explicite         | Contrat figé    |
| Owner, CloseDate, étape, type                | panneau action        | preview + execute             | Contrat figé    |
| Owner du compte                              | action réassignation  | fallback et exclusion         | Contrat figé    |
| Clore en perdue                              | action spécialisée    | picklists dépendantes         | Contrat figé    |
| Résultats partiels                           | barre + journal       | réussites/échecs              | Contrat figé    |
| Historique                                   | Supabase              | import + pagination           | Contrat figé    |
| `/clean?q=`                                  | paramètres CleanerApp | ouverture préfiltrée          | Contrat figé    |
| Actualisation/cache                          | workspace             | fraîcheur + cache-buster      | Contrat figé    |
| Auth X OS / identité SF                      | API Labo              | 401/403 + token personnel     | Contrat figé    |

## Audit read-only

Commande sans réseau, sans écriture :

```bash
python3 scripts/audit/cleaner_v2_audit.py
```

Commande à employer seulement après approbation explicite :

```bash
python3 scripts/audit/cleaner_v2_audit.py --execute
```

Le script reprend la convention des audits existants : session OAuth locale Hermes, hors dépôt (`HERMES_HOME`, sinon `~/.hermes/hermes-agent`). Il ne lit ni n’imprime de token. Une session/credential absent produit `blocked` avec code de sortie `2` et aucune requête d’écriture.

Les appels sont exclusivement des GET SOQL/describe. Toutes les pages `nextRecordsUrl` sont suivies ; les IDs de propriétaires sont interrogés par paquets de 200. Aucune semi-jointure SOQL n’est utilisée, donc aucune limite de semi-jointure n’est engagée. Les pages de candidats demandent seulement `Id`, `OwnerId`, `StageName`; le describe est réduit à des comptes de valeurs actives. Le script n’écrit aucun fichier local.

## Risques ouverts

- Le modèle exact de dépendance `Raison_de_perte_V2__c` / `Type_de_vente__c` sera confirmé par le describe réel ; les fixtures ne sont qu’un contrat anonymisé.
- `api/refresh.py` compte toutes les opportunités ouvertes en chargeant les IDs : l’audit utilise `COUNT()` pour éviter ce payload inutile.
- L’union des candidats reproduit les deux requêtes legacy disjointes (`CloseDate < TODAY` et `CloseDate >= TODAY` avec montant `1–100`). Les opportunités ouvertes sans CloseDate restent hors du périmètre legacy actuel.
- Le test de parité est vert après l’implémentation de `detectOpportunityAnomalies` au Task 2 ; il reste le garde-fou de couverture pour les lots suivants.
