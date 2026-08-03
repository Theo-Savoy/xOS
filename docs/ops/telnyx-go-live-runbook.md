# Runbook GO — Premier appel Telnyx réel (Phase 11)

> Statut : **EN ATTENTE** — bloqué sur KYC Telnyx (incident technique côté Telnyx).
> Décision prise le 2026-08-03 : **numéro fixe FR** + **mode click-to-call** (démarchage **B2B** pour Combo, pas de B2C). Pas de mobile 06/07 (réservé à l'interpersonnel). Pas de mode prédictif/progressif (exigerait un NPV, non garanti au catalogue Telnyx France). Cadre réglementaire détaillé : `docs/compliance/demarchage-b2b-france.md`.
> Transport validé en dry-run complet le 2026-08-03 (commit `14ec106`).
> **Piège trial D60 (vérifié par la console 2026-08-03 22:06)** : en compte trial, un appel sortant vers un numéro **non vérifié** est refusé ~1,6 s après l'offre SIP — l'UI dit « Appel terminé » sans erreur. Le flux WebRTC est pourtant sain (connect → ready → newCall → getUserMedia → offer). **Toute destination de test doit être vérifiée d'abord** (Dashboard → Numbers → Verified, ou le SMS de vérification reçu au moment de l'appel). Seuls les numéros vérifiés sont appelables tant que le compte est en trial.

Ce runbook s'exécute **le jour où le KYC est débloqué**. Objectif : un seul appel réel contrôlé, puis retour en fail-closed. Durée cible : ~15 minutes si tout est prêt.

## Prérequis (déjà validés — ne pas refaire)

- [x] Migrations 037–043 alignées sur la base distante (settings, campagnes, webhooks, audit, budgets, entitlements, RPC `dialer_reserve_budget` / `dialer_release_reservation`).
- [x] Routeur `api/dialer.js` avec exports Web (`GET`/`POST`) — validé sous `vercel dev`.
- [x] Signature Ed25519, anti-replay, idempotence `body.data.id` — testés (1113 tests verts).
- [x] Budget atomique via RPC + kill switch ORG_EXCEEDED — testé.
- [x] `dialer_enabled=false`, `dialer_dry_run=true` en base (état fail-closed par défaut).
- [x] **Config Credential Connection optimisée (2026-08-03)** : `ani_override=None` (le `callerNumber` du SDK est respecté — sinon numéro masqué côté destinataire), `localization=FR`, `call_parking_enabled=false` (sinon l'appel WebRTC part mais ne sonne pas), Outbound Voice Profile `Portal` assigné (whitelist US/CA/FR).
- [x] **Codecs (2026-08-04) — cause de la qualité horrible** : la connection n'offrait que `['G722','G711U','G711A','G729']` — SANS OPUS. Le navigateur proposait OPUS mais Telnyx ne le listait pas → négociation sur G.711 (64 kbps, qualité téléphone). Fix : `codecs=['OPUS','G722','G711U','G711A']` → OPUS négocié (qualité voix WebRTC). C'est LE réglage codec de la connection (le Outbound Voice Profile n'expose pas de codecs).

## Étape 0 — Vérifier le déblocage KYC (~2 min)

1. Se connecter au compte Telnyx : vérifier que le bandeau/incident KYC a disparu.
2. Vérifier que le menu **Numbers** et **Number Search** sont accessibles.
3. Si l'accès est encore restreint : stopper, ne rien acheter.

## Étape 1 — Acheter le numéro appelant (~3 min)

- Dans **Numbers → Search**, filtrer : `France`, types **local** ou **national**, capacité **voice outbound**.
- Acheter **un seul** numéro fixe (préfixe géographique type 01–05 ou national).
- Noter le numéro au format E.164 : `+33XXXXXXXXX` → variable `TELNYX_CALLER_ID_DEV`.
- Vérifier dans la fiche du numéro : statut *active*, pas de restriction messaging-only.

> ⚠️ **Réglementation (B2B inclus)** : les numéros 06/07 sont interdits comme identifiant appelant pour tout usage automatisé, et les systèmes automatisés d'appels (prédictif/progressif) exigent un NPV (0162, 0163, 0270…). Combo reste en click-to-call humain → un fixe standard suffit, cf. `docs/compliance/demarchage-b2b-france.md`.

## Étape 2 — Créer la Voice API Application (~3 min)

Le produit s'appelle **Programmable Voice** (anciennement "Call Control"). Dans le portail Telnyx :

1. **Voice API → Applications → Create Application**.
2. Nom : `xos-dialer-dev` (ou `-prod` le jour venu).
3. Type : **Programmable Voice** (Voice API), pas messaging.
4. Webhook URL : renseigner l'URL publique de production/preview (voir étape 4 — on peut remplir plus tard et revenir éditer).
5. Enregistrer l'**Application ID** (UUID) et le **Connection ID** (UUID associé à l'application) — c'est ce dernier qui servira de `connection_id` au dial.
6. Récupérer la **clé publique Ed25519** du webhook (section Webhook de l'application).

## Étape 3 — Outbound Voice Profile (~3 min)

1. **Voice API → Outbound Voice Profiles → Create Profile** :
   - Nom : `xos-dialer-outbound`.
   - Associer l'application de l'étape 2 (ou la connection associée).
   - Activer la destination **France** (whitelisted destinations) et un **daily spend limit** bas (ex. $5) pour la fenêtre de test.
2. Le profile contrôle routing, billing et limites ; un profile désactivé bloque les appels sortants (double kill switch opérationnel).

## Étape 4 — URL webhook publique (~2 min)

Le webhook Telnyx doit atteindre `POST /api/dialer?resource=webhooks` en HTTPS public.

**Option production (recommandée) :** déployer sur Vercel et utiliser l'URL de déploiement :
```
https://<DEPLOYMENT>.vercel.app/api/dialer?resource=webhooks
```

**Option test local : tunnel cloudflared pointant sur `vercel dev --listen 5174` :**
```bash
./scripts/tunnel.sh start
# → affiche + persiste l'URL dans .tunnel-url
# → https://<random>.trycloudflare.com/api/dialer?resource=webhooks
```
(Quick Tunnel : l'URL change à chaque relance — uniquement pour le smoke test.
`./scripts/tunnel.sh url` relit l'URL persistée ; `stop` l'arrête.)

Dans l'Application Telnyx (étape 2), renseigner cette URL comme webhook **Event Webhook**, événements minimum : `call.initiated`, `call.answered`, `call.hangup`.

Récupérer la **clé publique Ed25519** affichée par Telnyx dans l'Application (champ public key du webhook) → variable `WEBHOOK_TELNYX_PUBLIC_KEY`.

## Étape 5 — Variables d'environnement (~2 min)

Sur **Vercel** (ou `.env.local` pour le test tunnel), configurer :

| Variable | Valeur |
|---|---|
| `TELNYX_ENV` | `dev` |
| `TELNYX_API_KEY_DEV` | clé API Telnyx (Permissions : calls) |
| `TELNYX_CALLER_ID_DEV` | `+33XXXXXXXXX` (étape 1) |
| `WEBHOOK_TELNYX_PUBLIC_KEY` | clé publique Ed25519 (étape 4) |
| `WEBHOOK_TELNYX_TOLERANCE_SEC` | `300` (optionnel) |

Fail-closed garanti par le code : la clé API Telnyx manquante → erreur 503, aucun appel possible. (La clé webhook, elle, est optionnelle en trial — elle ne sert qu'à vérifier les événements de retour, cf. commit `19e3897`.)

## Étape 6 — Entitlement du testeur (~1 min)

```sql
insert into public.dialer_user_entitlements (user_id, enabled, dry_run)
values ('<UUID-THEO>', true, false)
on conflict (user_id) do update set enabled = true, dry_run = false;
```

## Étape 7 — Fenêtre d'appel réel (~1 min)

```sql
update public.settings set value = '"true"'::jsonb  where key = 'dialer_enabled';
update public.settings set value = '"false"'::jsonb where key = 'dialer_dry_run';
```

> Triple garde-fou (audit 2026-08-03, fix `3086a30`) : le dial réel exige
> `flags.enabled` **et** `entitlement.enabled` **et** `dry_run=false` aux TROIS
> niveaux (config + flags org + entitlement user). La plus pessimiste gagne.

## Étape 8 — L'UNIQUE appel de test

Un seul appel, vers un destinataire autorisé (numéro perso de Théo ou ligne interne).

**Option UI (recommandée — session JWT déjà authentifiée) :**
1. Ouvrir l'app **en local** (`http://localhost:5174`) — **pas besoin du tunnel pour l'appel trial** : le dial est une requête sortante vers Telnyx, aucun webhook entrant à recevoir (clé Ed25519 indisponible en trial → événements 503 de toute façon).
2. Prospection → bouton **Dialer** (vue `?view=dialer`).
3. Coller le numéro E.164, vérifier le Connection ID (Application ID), cliquer **Appeler**.

**Option curl :**
```bash
curl -sS -X POST 'https://<HOST>/api/dialer?resource=dial' \
  -H "Authorization: Bearer ***" \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "+336XXXXXXXX",
    "connection_id": "<APPLICATION-UUID>",
    "webhook_url": "https://<HOST>/api/dialer?resource=webhooks"
  }'
```

Résultat attendu : `200` avec `call_control_id` Telnyx réel, `dry_run: false`.

## Étape 9 — Vérifications post-appel (~2 min)

```sql
select status, estimated_cost_cents, released_at, expires_at, created_at
from public.dialer_budget_reservations order by created_at desc limit 3;

select action, result, cost_cents, ts
from public.dialer_audit_log order by ts desc limit 5;

select event_type, received_at
from public.dialer_webhook_events order by received_at desc limit 10;
```

Checklist :
- [ ] Appel audible depuis le destinataire.
- [ ] **N/A (trial)** Webhooks `call.*` reçus + signature validée — impossible en trial : la clé Ed25519 est paid-only, le receiver répond 503. `dialer_webhook_events` restera vide, c'est le comportement attendu. → critère paid.
- [ ] Réservation budget : `consumed`.
- [ ] Audit : `dial / success`.
- [ ] Aucune erreur dans les logs de `vercel dev`.

## Étape 10 — Retour en fail-closed

```sql
update public.settings set value = '"false"'::jsonb where key = 'dialer_enabled';
update public.settings set value = '"true"'::jsonb  where key = 'dialer_dry_run';
```

Si un incident survient à n'importe quel moment : exécuter immédiatement l'étape 10 (kill switch manuel). Le kill switch automatique ORG_EXCEEDED est déjà en place côté code. Depuis le commit `9b1fa85`, la fenêtre s'expire automatiquement via `dialer_enabled_until` (optionnel) — plus jamais de discipline manuelle en 3 UPDATE à retenir.

---

## PHASE B — Audio bidirectionnel (WebRTC + bridge deux jambes)

> État : **bloquée côté Telnyx** — compte encore en trial (pas de clé Ed25519,
> aucun webhook_endpoint). Le code Phase A est livré (`cfd19fc`), les prérequis
> Telnyx ci-dessous sont ce qui débloque.

### Prérequis Telnyx (quand le compte passe paid)

1. **Clé publique Ed25519** → la récupérer dans Telnyx Dashboard → Voice → Webhook public key (générée au passage paid) → `scripts/setup-telnyx-creds.sh` étape 3
2. **URL Vercel stable** → plus de Quick Tunnel : l'URL du déploiement Vercel (`https://xos-dechet-repo.vercel.app`) sert de base webhook
3. **Event Webhook configuré** → Telnyx Dashboard → Voice API Application → Webhook URL : `https://xos-dechet-repo.vercel.app/api/dialer?resource=webhooks` — ou via API : `POST /v2/webhook_endpoints { url, webhook_secret }`

### Checklist code (après prérequis)

| # | Tâche | Fichier | Migration |
|---|---|---|---|
| 1 | Migration : `owner_user_id` + index unique partiel (1 appel actif/user) + contrainte `parallelism = 1` | `supabase/migrations/044_dialer_calls_one_active_per_user.sql` | ✅ prête |
| 2 | Event router `call.*` (initiated/answered/hangup/machine.detection.ended) | `api/_dialer/webhooks.js` (remplace le stub `:169-171`) | |
| 3 | `insertCall` / `updateCallFromEvent` → `dialer_calls` (table orpheline D2) | **nouveau** `api/_dialer/calls.js` | |
| 4 | `handleDial` : jambe agent `sip:{sip_username}@sip.telnyx.com` → prospect `link_to` → bridge ; `409 already_on_call` sur 23505 | `api/dialer.js` | |
| 5 | `time_limit_secs: 1800` sur les deux jambes + `bridgeCalls()` | `api/_dialer/telnyx.js` | |
| 6 | `useRtcCall` : `newCall()` → `on(inbound) + answer()` ; **retirer la capacité de composer** (le serveur décide) | `src/apps/calls/modules/dialer/application/useRtcCall.ts` | |
| 7 | Réconciliation coût sur `call.hangup` (`duration_sec × dialer_cost_cents_per_min`) | `api/_dialer/webhooks.js` | |

### Garanties fail-closed audio (audit 11.2 B.8)

G1 triple gate token · G2 dry-run = pas de token · G3 TTL 600s + audit ·
G4 1 appel actif/user (index) · G5 durée bornée (`time_limit_secs`) ·
G6 kill switch sondé par l'UI · G7 fenêtre auto-expirante · G8 SDK confiné.

### Critère de succès Phase B (binaire)

Le commercial clique → son téléphone (navigateur) sonne → il décroche → **ensuite**
le prospect est composé → les deux parlent → Raccrocher → la fenêtre se referme.
L'humain est en ligne AVANT que le prospect ne sonne (jambe agent `answered_at`
< jambe prospect `started_at` = preuve horodatée de conformité ARCEP).

## Rollback d'urgence

1. Kill switch SQL (étape 10).
2. Si le webhook spamme : désactiver l'Event Webhook dans l'Application Telnyx.
3. Si le numéro est compromis : bloquer le numéro dans Telnyx (`Numbers → disable`).
4. Révoquer la clé API : `Telnyx → API Keys → revoke`.
