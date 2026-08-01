# Ops — Fonctions Vercel (plafond Hobby = 12 ; 9/12 utilisées)

**Constat 2026-07-11** : le plan Hobby Vercel limite à **12 Serverless Functions**.

**Mise à jour 2026-08-01** : inventaire corrigé après audit. Les fonctions `notifications`, `weekly-targets` et `crm/picklists` étaient manquantes dans l'inventaire précédent (annoncé à tort 6/12).

## Inventaire actuel (handlers HTTP) — après audit 2026-08-01

| #     | Fichier                 | Rôle                                                                    | Touché par                                |
| ----- | ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| 1     | `api/cleaner.js`        | Workspace, analytics, history, preview, execute                         | Labo natif                                |
| 2     | `api/launcher.js`       | SOSL + `/log` + `/create`                                               | Cmd+K                                     |
| 3     | `api/auth.js`           | Bridge cookie + liaison OAuth SF par utilisateur                        | Login / compte                            |
| 4     | `api/calls.js`          | Sessions + list_contacts + presets                                      | Combo (calls)                             |
| 5     | `api/status.js`         | Statut Hub, réglages équipe et rôles                                    | Coulisses (Hub)                           |
| 6     | `api/perf.js`           | Agrégats Weekly Perf (Pulse, Pipeline, Effort)                          | Lundi (Weekly)                            |
| 7     | `api/notifications.js`  | Notifications utilisateur temps réel                                    | Shell desktop                             |
| 8     | `api/weekly-targets.js` | Targets trimestrielles (CRUD)                                           | Lundi (Weekly)                            |
| 9     | `api/crm/picklists.js`  | Picklists Salesforce (cache)                                            | Combo (calls)                             |
| 10    | `api/review.js`         | Cockpit macro Bilan (KPIs, breakdown, funnel, attention, calls, shared) | Bilan (review) — _untracked, à committer_ |
| 11–12 | **libres**              | Réserve                                                                 | —                                         |

**Attention** : `api/review.js` est codé mais non commité. Une fois commité, le compteur passe à **10/12, 2 slots libres**.

Helpers **non exposés** (importés seulement) : `api/_auth.js`, `api/_crm/*`, `api/_calls/*`, `api/_config/*`, `api/_cleaner/*`, `api/_review/*`, `api/_weekly/*`.

### Activation OAuth utilisateur (lot 8.1b)

- ✅ Migration `supabase/migrations/015_salesforce_user_oauth.sql` appliquée en Production le 2026-07-11.
- ✅ `SF_TOKEN_ENCRYPTION_KEY` ajoutée à Vercel Production (32 octets aléatoires, base64).
- `SF_REFRESH_TOKEN` : optionnel, réservé aux scripts legacy / fallback explicite (`allowOrgFallback`). Le runtime produit utilise uniquement l'OAuth utilisateur.
- Callback Connected App : `https://xos.hellotheo.fr/api/auth?flow=salesforce-callback`.
- Authorize URL : `SF_INSTANCE_URL` (My Domain org), pas `login.salesforce.com`.
- Ne jamais faire tourner la clé de chiffrement sans relier ensuite tous les comptes Salesforce.
- Le login Salesforce synchronise automatiquement `provider_refresh_token`; la route dédiée sert de reliaison/secours.

### Routes `/api/launcher`

| Méthode   | Route                          | Rôle                                               |
| --------- | ------------------------------ | -------------------------------------------------- |
| `GET`     | `?q=`                          | SOSL multi-objet (ancien `/api/search`)            |
| `POST`    | `{ action: "log_call" }`       | Création de Task Salesforce (ancien `/api/log`)    |
| `POST`    | `{ action: "create_contact" }` | Création de Contact Salesforce (ancien `/api/log`) |
| `OPTIONS` | —                              | CORS : `GET, POST, OPTIONS`                        |

### Routes `/api/auth`

| Méthode   | Route                       | Rôle                                                                                   |
| --------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `POST`    | —                           | Vérifie le JWT puis pose le cookie `xos_auth` (ancien `/api/sso-bridge`)               |
| `POST`    | `?flow=salesforce-link`     | Démarre la liaison OAuth SF du user JWT ; retourne `authorization_url`                 |
| `GET`     | `?flow=salesforce-callback` | Callback SF, validation identité et stockage chiffré du refresh token                  |
| `GET`     | `?flow=salesforce`          | Stub OAuth : redirection `/?auth_error=sf_coming_soon` (ancien `/api/auth/salesforce`) |
| `GET`     | sans flux reconnu           | `400 { error: "invalid_flow" }`                                                        |
| `OPTIONS` | —                           | CORS : `GET, POST, OPTIONS`                                                            |

### Actions / resources sur `/api/calls`

| Méthode      | Route                                                             | Remplace                  |
| ------------ | ----------------------------------------------------------------- | ------------------------- |
| `POST`       | `{ action: "list_contacts", filters, limit? }`                    | `POST /api/calls-list`    |
| `GET`        | `?resource=presets`                                               | `GET /api/presets`        |
| `POST`       | `{ action: "save_preset", name, filters, shared }`                | `POST /api/presets`       |
| `POST`       | `{ action: "delete_preset", id }`                                 | —                         |
| `DELETE`     | `?resource=presets&id=`                                           | `DELETE /api/presets?id=` |
| _(existant)_ | sessions, log_call, log_event, skip, complete, follow-up, context | inchangé                  |

## Besoins futurs

| Endpoint prévu            | Phase | Slot                                       |
| ------------------------- | ----- | ------------------------------------------ |
| `review` (Bilan)          | 6.1   | codé untracked — **10/12 après commit**    |
| `copilot` (Copilot)       | 9.1   | 11/12 après livraison                      |
| `telnyx/*` (Power Dialer) | 11.x  | 12/12 minimum — **plafond atteint**        |
| `chat` + `slack/*`        | 7.x   | >12 — **Pro ou consolidation obligatoire** |

**Stratégie slots** : après Bilan (10/12), il reste 2 slots pour Copilot + Telnyx. Telnyx seul peut consommer 1-2 fonctions (webhooks). Copilot ajoute +1. Le plafond est atteint dès la livraison de Copilot OU Telnyx, whichever comes first.

Options si plafond atteint :

- **Consolider** : pattern `?resource=` déjà utilisé par `cleaner.js` et `calls.js`. Appliquer à `perf.js` + `weekly-targets.js` (peuvent partager un handler). Coût : ~1 jour par consolidation.
- **Passer Pro** : 20 $/mois, supprime définitivement la contrainte. Décision reportée par Théo (2026-08-01).

## Règles pour les agents

1. **Avant d'ajouter un fichier sous `api/`** : vérifier ce compteur ; préférer une `action` sur un router existant.
2. Pas de nouveau nested `api/foo/bar.js` sauf si on accepte +1 fonction.
3. Helpers uniquement sous `api/_…` (import only).
4. Documenter tout merge dans la PR (avant/après inventaire).
