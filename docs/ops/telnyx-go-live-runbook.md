# Runbook GO — Premier appel Telnyx réel (Phase 11)

> Statut : **EN ATTENTE** — bloqué sur KYC Telnyx (incident technique côté Telnyx).
> Décision prise le 2026-08-03 : **numéro fixe FR** (pas de mobile 06/07 — option absente du catalogue Telnyx pour la France, et risque réglementaire supérieur).
> Transport validé en dry-run complet le 2026-08-03 (commit `14ec106`).

Ce runbook s'exécute **le jour où le KYC est débloqué**. Objectif : un seul appel réel contrôlé, puis retour en fail-closed. Durée cible : ~15 minutes si tout est prêt.

## Prérequis (déjà validés — ne pas refaire)

- [x] Migrations 037–043 alignées sur la base distante (settings, campagnes, webhooks, audit, budgets, entitlements, RPC `dialer_reserve_budget` / `dialer_release_reservation`).
- [x] Routeur `api/dialer.js` avec exports Web (`GET`/`POST`) — validé sous `vercel dev`.
- [x] Signature Ed25519, anti-replay, idempotence `body.data.id` — testés (1113 tests verts).
- [x] Budget atomique via RPC + kill switch ORG_EXCEEDED — testé.
- [x] `dialer_enabled=false`, `dialer_dry_run=true` en base (état fail-closed par défaut).

## Étape 0 — Vérifier le déblocage KYC (~2 min)

1. Se connecter au compte Telnyx : vérifier que le bandeau/incident KYC a disparu.
2. Vérifier que le menu **Numbers** et **Number Search** sont accessibles.
3. Si l'accès est encore restreint : stopper, ne rien acheter.

## Étape 1 — Acheter le numéro appelant (~3 min)

- Dans **Numbers → Search**, filtrer : `France`, types **local** ou **national**, capacité **voice outbound**.
- Acheter **un seul** numéro fixe (préfixe géographique type 01–05 ou national).
- Noter le numéro au format E.164 : `+33XXXXXXXXX` → variable `TELNYX_CALLER_ID_DEV`.
- Vérifier dans la fiche du numéro : statut *active*, pas de restriction messaging-only.

> ⚠️ Ne pas acheter de numéro "mobile" même s'il apparaît un jour au catalogue : la réglementation française sur l'appel automatisé sortant est plus restrictive pour les 06/07 (cf. recherche ARCEP/CCRF à documenter avant usage intensif).

## Étape 2 — Créer la Call Control Application (~3 min)

1. **Call Control → Applications → Create Application**.
2. Nom : `xos-dialer-dev` (ou `-prod` le jour venu).
3. Type : **Call Control** (pas messaging).
4. Webhook URL : renseigner l'URL publique de production/preview (voir étape 4 — on peut remplir plus tard et revenir éditer).
5. Enregistrer l'**Application ID** (UUID).

## Étape 3 — Créer la connexion sortante (~3 min)

1. **Call Control → Connections → Create Connection** :
   - Type : **Call Control (outbound)**.
   - Lier à l'Application de l'étape 2.
   - Auth : API Key (pas SIP credentials).
2. Rattacher le numéro de l'étape 1 à cette connexion (ou vérifier l'association automatique).
3. Noter le **Connection ID** (UUID) — c'est le `connection_id` du body `dial`.

## Étape 4 — URL webhook publique (~2 min)

Le webhook Telnyx doit atteindre `POST /api/dialer?resource=webhooks` en HTTPS public.

**Option production (recommandée) :** déployer sur Vercel et utiliser l'URL de déploiement :
```
https://<DEPLOYMENT>.vercel.app/api/dialer?resource=webhooks
```

**Option test local :** tunnel cloudflared pointant sur `vercel dev --listen 5174` :
```bash
cloudflared tunnel --url http://localhost:5174
# → https://<random>.trycloudflare.com/api/dialer?resource=webhooks
```
(Quick Tunnel : l'URL change à chaque redémarrage — uniquement pour le smoke test.)

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

Fail-closed garanti par le code : toute variable manquante → erreur 503, aucun appel possible.

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

> Double garde-fou : le dial réel exige `flags.enabled` **et** `entitlement.enabled` **et** `dry_run=false` aux deux niveaux (config + flags). La plus pessimiste gagne.

## Étape 8 — L'UNIQUE appel de test

Un seul appel, vers un destinataire autorisé (numéro perso de Théo ou ligne interne) :

```bash
curl -sS -X POST 'https://<HOST>/api/dialer?resource=dial' \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "+336XXXXXXXX",
    "connection_id": "<CONNECTION-UUID>",
    "webhook_url": "https://<HOST>/api/dialer?resource=webhooks"
  }'
```

Réponse attendue : `200` avec `call_id` Telnyx réel, `dry_run: false`.

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
- [ ] Webhooks `call.initiated` / `call.answered` / `call.hangup` reçus, signature validée.
- [ ] Réservation budget : `consumed`, coût réel renseigné.
- [ ] Audit : `dial / success`.
- [ ] Aucune erreur de signature dans les logs.

## Étape 10 — Retour en fail-closed

```sql
update public.settings set value = '"false"'::jsonb where key = 'dialer_enabled';
update public.settings set value = '"true"'::jsonb  where key = 'dialer_dry_run';
```

Si un incident survient à n'importe quel moment : exécuter immédiatement l'étape 10 (kill switch manuel). Le kill switch automatique ORG_EXCEEDED est déjà en place côté code.

## Rollback d'urgence

1. Kill switch SQL (étape 10).
2. Si le webhook spamme : désactiver l'Event Webhook dans l'Application Telnyx.
3. Si le numéro est compromis : bloquer le numéro dans Telnyx (`Numbers → disable`).
4. Révoquer la clé API : `Telnyx → API Keys → revoke`.
