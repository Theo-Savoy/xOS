# Lot 11.1 — Infrastructure Telnyx (Telnyx Power Dialing)

**Branche** : `feat/telnyx-phase-11-prep` (isolée de `main`)
**Statut** : préparation — pas de merge avant validation manuelle
**Source** : `docs/specs/combo-prospection-autonome.md` v2 (2026-07-23)
**Décision produit 2026-08-01** : Telnyx prioritaire, Combo au centre, environnement dev séparé.

---

## 1. Pourquoi cette branche est isolée

Telnyx est :
- **Sensible** : couts récurrents (310€/mois équipe), facturation à l'usage, marge d'erreur nulle
- **Externe** : API tierce payante, webhooks Ed25519, rate limits Telnyx, KYC FR obligatoire
- **Coûteux en cas de bug** : un webhook mal routé peut générer des minutes facturées ou des appels fantômes

**Conséquence** : aucun commit ne doit toucher `main` sans relecture explicite. Tout le travail de Phase 11 vit sur `feat/telnyx-phase-11-prep` jusqu'à feu vert manuel de Théo.

## 2. Garde-fous baked-in dès le scaffolding (non négociables)

Ces garde-fous sont livrés **dans le lot 11.1** — pas « à ajouter plus tard ». Tout est codé, testé, auditable.

### 2.1 Feature flag runtime (kill switch)
- `dialer_enabled` (boolean, `settings` table) — défaut **false** en dev, opt-in en prod
- `dialer_dry_run` (boolean) — quand true, toutes les actions Telnyx sont simulées (logs uniquement, aucun appel réel)
- Aucune route `/api/dialer` ne s'exécute si `dialer_enabled=false` (réponse 503 immédiate)
- En dry-run, le webhook reçoit un mock event mais ne fait rien

### 2.2 Budget cap + circuit breaker
- `dialer_budget_cents_per_session` (int, défaut 300 = 3,00€) — cap dur par session power
- `dialer_budget_cents_per_user_per_day` (int, défaut 1000 = 10€/jour)
- `dialer_budget_cents_organization_per_month` (int, défaut 15000 = 150€/mois équipe)
- Avant chaque `dial`, vérification synchrone des 3 compteurs → si dépassement, return 429 et log audit
- À 80% du cap mensuel → notification Hub admin (réutilise `api/notifications.js`)
- À 100% → kill switch automatique, `dialer_enabled` forcé à false jusqu'à reset manuel

### 2.3 Rate limit Telnyx (defense in depth)
- Telnyx API limit : 100 req/s par défaut. On vise 5 req/s sustained + burst 20.
- Token bucket par `caller_id` (le numéro Telnyx sortant), fenêtre 1s
- Rejection 503 avec `Retry-After: 2` si saturation — le client (orchestrateur 11.2) retry avec backoff exponentiel

### 2.4 Idempotence webhooks (anti-double-facturation)
- Table `dialer_webhook_events` : `(event_id text PRIMARY KEY, received_at, processed_at, status)`
- Tout webhook Telnyx est dédupliqué par `event_id` avant traitement
- `processing_lock` colonne pour le cas où 2 invocations simultanées traiteraient le même event
- Réconciliation cron 5 min (jobs Vercel) : détecte les events `received_at < now() - 5min AND status = 'pending'` et relance

### 2.5 Auth webhooks Ed25519 stricte
- Vérification signature **obligatoire** — rejet 401 si manquante ou invalide
- Tolérance timestamp : 300 secondes (anti-replay)
- `WEBHOOK_TELNYX_PUBLIC_KEY` env var obligatoire. Si absente → endpoint 503 (fail-closed, jamais fail-open)
- Test unitaire couvre : signature valide, signature manquante, signature altérée, timestamp hors tolérance

### 2.6 Audit log exhaustif
- Table `dialer_audit_log` : `(id, ts, actor_user_id, action, payload_json, cost_cents, result, error_code)`
- Chaque action Telnyx (dial, hangup, recording_start, recording_download, summarize, crm_write) est journalisée AVANT exécution
- `actor_user_id` = commercial connecté OU `system` (cron, webhook)
- Conservation 90 jours minimum (RGPD-friendly), exportable vers Supabase Storage cold

### 2.7 Séparation prod / dev / dry-run
- Variables d'env distinctes : `TELNYX_API_KEY_PROD`, `TELNYX_API_KEY_DEV`, `TELNYX_API_KEY_DRYRUN`
- `TELNYX_ENV` détermine laquelle charger (`prod` / `dev` / `dryrun`)
- `dryrun` ne fait aucun appel réseau à Telnyx — toutes les réponses sont stubées depuis `api/_dialer/_fixtures/`
- L'endpoint `/api/dialer?resource=config` retourne `{ env, dry_run, budget_remaining_cents }` (utile pour QA)

### 2.8 ESLint rule Telnyx
- Nouvelle règle : interdire `import 'telnyx'` (SDK éventuel) ou tout import direct de la lib Telnyx hors `src/apps/calls/modules/dialer/infrastructure/telnyx/**`
- Cible la dérive en équipe : aucun fichier hors adapter Telnyx ne doit appeler l'API directement
- Erreur lint si violation (pas warning)

### 2.9 Vercel function budget
- `api/dialer.js` est la 10ᵉ fonction (déjà 9/12 utilisés, 3 libres après Bilan)
- Coût d'invocation estimé : court (<5s) mais burst possible en webhook — `maxDuration: 30s`
- Pattern `?resource=` déjà éprouvé sur `cleaner.js` et `calls.js` — réutiliser

## 3. Fichiers à créer (lot 11.1)

```
api/dialer.js                              # routeur ?resource=
api/_dialer/
├── index.js                                # barrel interne
├── config.js                               # TELNYX_ENV, env vars, dry-run flag
├── telnyx.js                               # client REST (dial, hangup, bridge, recording)
├── webhooks.js                             # Ed25519 verify + event router
├── idempotency.js                          # dédup webhook events
├── budget.js                               # 3 compteurs + circuit breaker
├── rateLimit.js                            # token bucket
├── audit.js                                # journalisation
├── _fixtures/
│   └── dialResponse.json                   # mock Telnyx dial response (dry-run)
└── dialer.test.js                          # tests unitaires (budget, rate, dry-run, audit)

supabase/migrations/
├── 037_dialer_feature_flags.sql            # settings keys + valeurs défaut
├── 038_dialer_campaigns.sql                # dialer_campaigns + dialer_calls
├── 039_dialer_webhook_events.sql           # idempotence
└── 040_dialer_audit_log.sql                # audit + RLS

docs/audits/lot-11.1-prep-validation.md    # checklist de validation manuelle avant merge
```

## 4. Variables d'environnement

```bash
# Telnyx — environnement dev (par défaut)
TELNYX_ENV=dev
TELNYX_API_KEY_DEV=KEY_DEV_xxx              # jamais committé
TELNYX_API_KEY_PROD=KEY_PROD_xxx            # jamais committé
TELNYX_API_KEY_DRYRUN=DUMMY
TELNYX_CALLER_ID_DEV=+33XXXXXXXXX
TELNYX_CALLER_ID_PROD=+33XXXXXXXXX

# Webhooks
WEBHOOK_TELNYX_PUBLIC_KEY=base64:xxx       # Ed25519, OBLIGATOIRE
WEBHOOK_TELNYX_TOLERANCE_SEC=300

# Budget (optionnel, défauts appliqués sinon)
DIALER_BUDGET_SESSION_CENTS=300
DIALER_BUDGET_USER_DAY_CENTS=1000
DIALER_BUDGET_ORG_MONTH_CENTS=15000

# Rate limit
DIALER_RATE_RPS=5
DIALER_RATE_BURST=20
```

## 5. Tests (bloquants avant merge)

1. `api/_dialer/budget.test.js` — 3 compteurs + circuit breaker (table-driven)
2. `api/_dialer/rateLimit.test.js` — token bucket, rejection, retry-after
3. `api/_dialer/webhooks.test.js` — Ed25519 valide / manquante / altérée / replay
4. `api/_dialer/idempotency.test.js` — dédup par event_id, race condition
5. `api/_dialer/audit.test.js` — chaque action journalisée, payload sérialisé
6. `api/_dialer/config.test.js` — TELNYX_ENV=dev/prod/dryrun résout la bonne clé
7. `api/dialer.test.js` — routeur ?resource= distribue correctement
8. Smoke test end-to-end : `dialer_enabled=false` → 503 ; `dry_run=true` → appel simulé en log sans hit Telnyx

## 6. Critères de validation manuelle (avant merge vers main)

- [ ] Théo a créé un compte Telnyx dev et fourni `TELNYX_API_KEY_DEV`
- [ ] Théo a fourni `WEBHOOK_TELNYX_PUBLIC_KEY` (Ed25519 du compte Telnyx)
- [ ] Webhook URL `/api/dialer?resource=webhooks` configuré dans Telnyx dashboard
- [ ] 1 appel sortant réel passé via Telnyx (test manuel Théo)
- [ ] Webhook signé reçu, vérifié, persisté
- [ ] Audit log contient les actions (SELECT direct Supabase)
- [ ] Budget dashboard lisible (pas de dépassement sur 1 appel = 0,01€)
- [ ] Dry-run activé en `dev` env par défaut
- [ ] ESLint rule active
- [ ] Aucun import Telnyx détecté hors adapter

## 7. Hors scope 11.1

- **Pas** d'UI live (lot 11.2)
- **Pas** d'orchestrateur parallèle N lignes (lot 11.2)
- **Pas** de recording/transcription/IA (lot 11.3)
- **Pas** d'ACW (lot 11.4)
- **Pas** de gamification power (lot 11.5)
- **Pas** de récap/stats (lot 11.6)

11.1 livre uniquement : le transport (REST client + webhooks), les garde-fous (budget, rate, audit, idempotence, auth), et la persistance (tables Supabase).

## 8. Risques résiduels après 11.1

| Risque | Lot qui l'aborde |
|---|---|
| Storm de webhooks après panne Telnyx | 11.2 (orchestrateur gère le backpressure) |
| Coût AMD premium en cascade | 11.2 (cap par batch) |
| URLs recording expirées | 11.3 (download webhook) |
| STT FR médiocre | 11.3 (fallback Deepgram) |
| Commercial abuse (dials hors session) | 11.4 (validation 1 clic — aucune action sans ACW) |

## 9. Definition of Done 11.1

- [ ] Tous les fichiers listés §3 existent
- [ ] Tous les tests §5 verts (>= 30 cas)
- [ ] `npm run lint`, `npm run test`, `npm run build` verts
- [ ] ESLint rule Telnyx active
- [ ] Feature flag `dialer_enabled=false` par défaut vérifié
- [ ] Dry-run vérifié end-to-end (logs sans hit réseau)
- [ ] Budget cap vérifié (3 compteurs)
- [ ] Idempotence vérifiée (replay webhook = no-op)
- [ ] Audit log vérifié (chaque action loggée)
- [ ] Aucun secret committé (grep `TELNYX_API_KEY` dans git diff)
- [ ] Checklist §6 complète signée par Théo
- [ ] **Pas de merge vers main** avant feu vert manuel