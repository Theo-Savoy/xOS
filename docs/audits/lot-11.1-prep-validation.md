# Telnyx Phase 11 — Validation manuelle avant merge vers main

> Cette checklist doit être remplie par Théo AVANT que la branche `feat/telnyx-phase-11-prep` ne soit mergée. **Aucune fusion automatique.**

## Pré-requis techniques

- [ ] Compte Telnyx dev créé sur https://portal.telnyx.com
- [ ] KYC FR validé
- [ ] Numéro outbound FR provisioned (+33XXXXXXXXX)
- [ ] Webhook endpoint Telnyx dashboard pointe vers `https://<STAGING>/api/dialer?resource=webhooks`
- [ ] `TELNYX_API_KEY_DEV` généré et copié dans `.env` (pas committé)
- [ ] `TELNYX_CALLER_ID_DEV` configuré
- [ ] `WEBHOOK_TELNYX_PUBLIC_KEY` (Ed25519) copié depuis Telnyx dashboard

## Pré-requis migrations Supabase

- [ ] Migration 037 (settings feature flags) appliquée
- [ ] Migration 038 (dialer_campaigns + dialer_calls) appliquée
- [ ] Migration 039 (dialer_webhook_events) appliquée
- [ ] Migration 040 (dialer_audit_log) appliquée
- [ ] RPC `dialer_query_spend(user_id, window_start)` créée (à venir dans 11.2 — slot migration)

## Smoke tests

- [ ] `npm run test` — tous les tests verts (35+ tests dialer)
- [ ] `npm run lint` — 0 erreur
- [ ] `npx tsc --noEmit` — 0 erreur
- [ ] `npm run build` — OK

## Test fonctionnel (1 appel réel)

- [ ] `GET /api/dialer?resource=config` retourne `{ env: 'dev', is_dry_run: false, has_caller_id: true, ... }`
- [ ] `GET /api/dialer?resource=campaigns` retourne `{ status: 501, error: 'not_implemented' }` (par design 11.1)
- [ ] Avec `settings.dialer_enabled=false` :
  - [ ] `GET /api/dialer?resource=config` lit toujours les flags
  - [ ] Toute autre resource retourne `{ status: 503, error: 'dialer_disabled' }`
- [ ] Avec `settings.dialer_enabled=true` + `settings.dialer_dry_run=true` :
  - [ ] Les actions Telnyx sont simulées (logs uniquement, 0 hit réseau)
  - [ ] Audit log contient `result: 'dry_run'`
- [ ] Webhook test (Telnyx dashboard → Send test) :
  - [ ] Signature manquante → 401 `missing_signature`
  - [ ] Signature altérée → 401 `signature_invalid`
  - [ ] Signature valide → 200 `received` + log dans `dialer_audit_log` (actor_kind: webhook)

## Garde-fous budget

- [ ] Forcer `settings.dialer_enabled=true` + `settings.dialer_budget_session_cents=10`
- [ ] Vérifier que le 11ᵉ dial de la session est rejeté (`budget_exceeded_session`)
- [ ] Vérifier que le compteur `sessionCounters` est vidé à la fin de session
- [ ] Forcer `settings.dialer_budget_org_month_cents=1` → vérifier rejet `budget_exceeded_org_month` immédiat

## Garde-fous rate limit

- [ ] Inonder l'endpoint (boucle de 30 calls en <1s) → vérifier que les calls > 5 RPS reçoivent `Retry-After`
- [ ] Vérifier que le bucket est per-`caller_id` (deux callers différents ne se bloquent pas)

## Audit log

- [ ] `SELECT * FROM dialer_audit_log ORDER BY ts DESC LIMIT 20` montre les actions récentes
- [ ] Chaque ligne a un `request_id` (UUID)
- [ ] Les échecs ont `result: 'failed'` + `error_code`

## ESLint rule Telnyx

- [ ] `npm run lint` détecte `import 'telnyx'` depuis `src/apps/cleaner/CleanerApp.tsx`
- [ ] Pas d'erreur sur les fichiers légitimes (`src/apps/calls/modules/dialer/infrastructure/telnyx/*` une fois créés)

## Sécurité

- [ ] Aucun secret committé (grep `TELNYX_API_KEY` dans git diff doit retourner 0 résultat en dehors des fichiers `.env*`)
- [ ] Aucun appel à `api.telnyx.com` en dry-run (vérifier Network tab)
- [ ] Webhook URL n'apparaît qu'en HTTPS dans la config Telnyx

## Décision finale

- [ ] **GO** : tous les checks ci-dessus sont ✅ → feu vert pour merge vers `main`
- [ ] **NO-GO** : au moins un check ❌ → nouveau commit sur la branche, re-test

## Après merge

- [ ] Smoke test prod (`/api/dialer?resource=config`) depuis l'environnement prod
- [ ] Notification Hub dans Coulisses : section "Dialer" activée pour Théo uniquement
- [ ] Documentation ops mise à jour : `docs/ops/vercel-functions.md` mentionne `api/dialer.js` (10/12)