# Revue produit/ops — smoke test Telnyx trial (appel unique)

> Date : 2026-08-03  
> Périmètre : readiness du **premier appel réel contrôlé** en compte Telnyx **TRIAL**, puis trajectoire vers provisioning per-user.  
> Sources croisées : `docs/ops/telnyx-go-live-runbook.md`, `docs/compliance/demarchage-b2b-france.md`, Dialer UI (`DialerView.tsx`), `api/dialer.js`, `api/_dialer/config.js` / `webhooks.js`, `scripts/tunnel.sh`, `scripts/setup-telnyx-creds.sh`, migration `042` (`dialer_phone_numbers`).

## Verdict

**CONDITIONAL GO** pour l’appel unique en trial.

Le plan click-to-call + fail-closed + numéro fixe FR est cohérent produit/compliance. Le transport et l’UI sont prêts pour **un** dial audible. Les conditions ci-dessous sont non négociables avant d’ouvrir la fenêtre réelle.

### Conditions (bloquantes)

1. **KYC Telnyx débloqué** — le runbook est encore en « EN ATTENTE » ; sans Numbers / Number Search, stop.
2. **Accepter un smoke test « dial-only »** — en trial, `WEBHOOK_TELNYX_PUBLIC_KEY` est indisponible → le receiver répond **503** (`webhook_public_key_not_configured`). L’étape 9 du runbook (webhooks signés + budget consommé via hangup) **ne peut pas être validée intégralement** en trial. Succès trial = appel audible + `200` dial + audit `dial/success` + réservation `consumed` ; webhooks = critère **post-paid**.
3. **Ne pas redémarrer le Quick Tunnel** pendant la fenêtre — URL aléatoire ; coller l’URL **après** `./scripts/tunnel.sh start` dans Telnyx Application **et** dans le champ UI (prérempli via `window.location.origin` si on ouvre l’app via le tunnel).
4. **`TELNYX_CALLER_ID_DEV` renseigné** — l’UI n’envoie pas `body.from` ; le dial repose sur le fallback env (`body?.from ?? cfg.callerId`). Sans ça → rejet Telnyx.
5. **Retour fail-closed immédiat** (étape 10) après l’appel — même si tout est vert.

---

## 1. Smoke test plan — sonorité du runbook

**Avis : plan solide à 80 %, avec 4 écarts docs↔code à traiter avant/pendant le GO.**

| Point | Évaluation |
|---|---|
| Ordre KYC → numéro → Voice App → Outbound Profile → tunnel → env → entitlement → flags → 1 appel → fail-closed | Correct et court (~15 min si KYC OK) |
| Click-to-call UI, un appel à la fois | Aligné ARCEP / note B2B |
| Kill switch SQL + ORG_EXCEEDED code | Bon double filet |
| Curl + UI documentés | OK ; préférer UI (JWT session) |

### Écarts / trous

1. **Contradiction fail-closed env (étape 5)**  
   Le runbook dit « toute variable manquante → 503 ». Faux pour le dial : la clé webhook est **volontairement optionnelle** (`config.js`) ; seul le receiver est fail-closed. Corriger le runbook pour ne pas faire croire qu’il faut la clé en trial.

2. **Étape 9 trop ambitieuse en trial**  
   Checklist webhooks `signature validée` + events persistés = **NO-GO trial**. Découper : critères trial vs critères paid.

3. **`entitlement.dry_run` non appliqué au gate dial**  
   Runbook : « dry_run=false aux deux niveaux, la plus pessimiste gagne ». Code réel (`api/dialer.js`) :
   `isDryRun = cfg.isDryRun || flags.dryRun` — **`entitlements.dryRun` est chargé puis ignoré**. Seul `entitlements.enabled` bloque.  
   Impact smoke test : si les flags org sont ouverts et l’entitlement oublié à `dry_run=true` mais `enabled=true`, un appel **réel** part quand même.  
   Mitigation immédiate : suivre strictement étapes 6+7 **et** vérifier `GET ?resource=config` (`dry_run` org + UI tags) avant de cliquer. Fix code = avant multi-user.

4. **Connection ID collecté mais non câblé**  
   `setup-telnyx-creds.sh` écrit `CONNECTION_ID` dans `.env.local`, mais ni `loadDialerConfig` ni `DialerView` ne le consomment — collage manuel UI obligatoire. Acceptable pour le smoke ; à noter pour ne pas chercher l’ID « magiquement » prérempli.

5. **Ambiguïté Application ID vs Connection ID (étape 2)**  
   Telnyx Voice API : `connection_id` **= Application ID** (confirmé script creds + curl runbook). L’étape 2 suggère encore deux UUID distincts. Risque d’erreur humaine → coller le mauvais ID. Clarifier en une ligne : « coller l’Application ID dans le champ Connection ID ».

6. **AMD `premium` par défaut** (`dialContact`) — possible friction trial/coût. Si le dial échoue avec une erreur AMD, retenter avec `amd` désactivé / standard (hors UI aujourd’hui → curl).

---

## 2. Architecture per-user (Connection ID manuel → provisioning)

**Avis : base saine, pas encore un produit multi-user.**

Déjà en place :

- Router : `from: body?.from ?? cfg.callerId` — override per-request prêt.
- Env `TELNYX_CALLER_ID_*` = fallback DEV uniquement (commentaire script creds OK).
- Schéma : table `dialer_phone_numbers` (`owner_user_id`, `e164`, `status`) + `dialer_user_entitlements.telnyx_credential_id` — **le modèle données per-user existe déjà**, non branché au dial path.
- Campagnes : colonne `caller_id` (038) pour le Hub plus tard.

**Pas encore :** résolution auto du `from` / `connection_id` depuis la base ; UI d’allocation ; appel API Telnyx Number Order + assignation.

### Next step minimal (opinionné)

Ne pas construire un « Number Hub » complet. Livrer **une seule fonction serveur** :

1. Au dial : si pas de `body.from`, résoudre  
   `dialer_phone_numbers` où `owner_user_id = user.id` et `status = 'active'` (priority desc), sinon fallback env DEV uniquement si `TELNYX_ENV=dev`.
2. Stocker **un** `connection_id` org (Voice Application partagée) en settings ou env `TELNYX_CONNECTION_ID_*` — les users n’ont pas besoin d’une Application chacun ; ils ont besoin d’un **numéro** chacun (ou d’un pool assigné).
3. Script / endpoint admin one-shot : acheter (ou enregistrer) un E.164 Telnyx → insert `dialer_phone_numbers` pour l’user opt-in.

Retirer le champ Connection ID de l’UI user dès que l’ID org est en config. Garder le collage manuel uniquement derrière un flag `dialer_debug_ui`.

---

## 3. Transition trial → paid

| Risque | Impact | Prêt ? |
|---|---|---|
| Clé webhook devient dispo | Receiver passe de 503 → vérif Ed25519 ; sans upsert env, webhooks restent morts | Layout env OK (`WEBHOOK_TELNYX_PUBLIC_KEY`) ; **checklist paid = coller la clé + redéployer/recharger** |
| `.env.example.dialer` dit encore « Required » pour la clé | Confusion ops | Aligner sur optionnel-en-trial / requis-en-paid |
| Vrais numéros + billing | Outbound Voice Profile daily spend ; budgets XOS (session/user/org) | OK si profil reste à plafond bas au flip |
| `TELNYX_ENV=prod` + `TELNYX_API_KEY_PROD` / `TELNYX_CALLER_ID_PROD` | Mauvais compte si on flip sans clés prod | Layout dual-env prêt ; smoke reste en `dev` |
| Webhook URL | Quick Tunnel meurt → Telnyx envoie dans le vide | **Passer Vercel (ou tunnel nommé) avant le paid go-live** |
| Event router encore stub (11.2) | Events persistés mais peu de side-effects métier | Acceptable pour smoke ; hangup→budget réel peut rester partiel |

**Rien de structurel ne casse au flip** si on traite la clé webhook et l’URL stable comme une checklist paid dédiée, séparée du smoke trial.

---

## 4. Tunnel `.tunnel-url` vs URL stable

**Smoke trial :** Quick Tunnel **acceptable** sous discipline stricte :

- `vercel dev` UP → `tunnel.sh start` → noter URL → **une seule** config webhook Telnyx → ouvrir l’UI **via cette URL** (sinon origin ≠ tunnel) → 1 appel → `stop` + fail-closed.
- Persistance `.tunnel-url` évite de fouiller les logs ; elle **ne fixe pas** l’URL entre restarts.

**Phase paid / users réels :** Vercel deploy (preview ou prod) = chemin le plus propre. Tunnel nommé Cloudflare seulement si on veut du debug local prolongé avec la même URL webhook. Ne pas onboarder de vrais users sur `*.trycloudflare.com`.

---

## 5. Top 3 recommandations AVANT l’appel unique

1. **Redécouper le succès trial** dans le runbook / checklist mentale : succès = sonnerie + `call_id` réel + audit dial ; **hors scope** = signature webhook. Évite un faux NO-GO post-appel.
2. **Séquence tunnel figée** : start tunnel → `url` → patch webhook Application Telnyx → ouvrir Dialer sur l’URL tunnel → vérifier UI (`Caller ID: configuré`, dry-run **non**, dialer **activé`) → un seul clic Appeler → étape 10 fail-closed.
3. **Pre-flight SQL + config** : entitlement `enabled=true` pour Theo ; flags org ouverts **seulement** dans la fenêtre ; confirmer `TELNYX_CALLER_ID_DEV` E.164 fixe (pas 06/07) ; Outbound Profile France + daily spend bas ($5) ; Application ID collé (pas un autre UUID).

---

## Synthèse executive

| Question | Réponse courte |
|---|---|
| Plan smoke test | GO conditionnel — ordre bon, attentes webhook trial à rabattre |
| Base per-user | Solide (`body.from` + table `dialer_phone_numbers`) ; next = resolve `from` en base + connection org en env |
| Flip paid | Layout env prêt ; risque principal = oublier clé webhook + URL stable |
| Tunnel | OK smoke ; Vercel obligatoire avant users réels |
| Verdict | **CONDITIONAL GO** (conditions §Verdict) |
