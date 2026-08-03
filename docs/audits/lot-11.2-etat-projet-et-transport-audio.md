# Lot 11.2 — Point d'état projet + design du transport audio

> Date : 2026-08-03 · HEAD `6b43c5a` · Auteur : conseil d'architecture
> Périmètre : (A) où en est le dialer Telnyx après le premier appel réel, (B) design du transport audio (WebRTC navigateur) pour le click-to-call.
> Méthode : lecture du code (`api/dialer.js`, `api/_dialer/*`, `src/apps/calls/modules/dialer/*`), des 3 revues de conseil, **et interrogation directe de la base distante** (projet Supabase `xos-portal` / `vvbslsatsuxgykjczjdt`). Les affirmations d'état viennent de la base, pas du résumé.

---

# Partie A — État du projet

## A.0 🔴 À TRAITER AVANT DE LIRE LA SUITE — la fenêtre d'appel réel est encore ouverte

L'étape 10 du runbook (« Retour en fail-closed ») **n'a pas été exécutée**. État constaté en base à l'instant :

```sql
select key, value from public.settings where key like 'dialer%';
-- dialer_enabled  → "true"     ❌ attendu "false"
-- dialer_dry_run  → "false"    ❌ attendu "true"

select user_id, enabled, dry_run from public.dialer_user_entitlements;
-- 7a5eb0a7-…fad3d | enabled=true | dry_run=false   ❌ attendu dry_run=true
```

Les **trois** niveaux du garde-fou pessimiste sont ouverts simultanément. Concrètement, tant que ce n'est pas refermé :

- toute requête portant le JWT Supabase de ce compte peut déclencher un appel **réel**, jusqu'à 50/jour et 500/mois ;
- `to` ne subit **aucune validation** (ni E.164, ni allowlist de destination — vérifié : pas une seule regex de numéro dans `api/dialer.js` ni `dialerApi.ts`), donc la destination peut être un numéro surtaxé ou international ;
- `from`, `connection_id` et `webhook_url` sont pris du corps de requête (`api/dialer.js:89-91`, `:151`) — l'appelant choisit le numéro affiché, la connection, et **où Telnyx enverra les événements contenant `userId`** ;
- chaque appel ne décrémente que **1 centime** de plafond (`api/dialer.js:113`, constante en dur), donc `budget_org_month_cents = 15000` ne veut pas dire « 150 € » mais « **15 000 appels** ».

La seule borne financière réelle aujourd'hui est le *daily spend limit* de l'Outbound Voice Profile côté Telnyx.

**Action, 2 minutes, avant toute autre chose :**

```sql
update public.settings set value = '"false"'::jsonb where key = 'dialer_enabled';
update public.settings set value = '"true"'::jsonb  where key = 'dialer_dry_run';
update public.dialer_user_entitlements set dry_run = true;   -- ceinture + bretelles
```

*Cause racine, pas seulement l'oubli :* le retour en fail-closed est une procédure manuelle en trois `UPDATE`. Une procédure manuelle exécutée sous adrénaline juste après un succès **sera** oubliée. Voir la dette **D1** en A.4 — l'expiration automatique de la fenêtre est le vrai correctif.

## A.1 Ce qui est FAIT — vérifié en base et dans le code

Le premier appel réel a bien eu lieu. Les traces le confirment, et racontent une histoire un peu plus riche que « un appel » :

| `ts` (UTC) | `result` | `payload.dry_run` | `command_id` | Lecture |
|---|---|---|---|---|
| 17:04 → 17:14 (×5) | success | `true` | absent | 5 dials dry-run — validation du transport |
| 20:23:57 | **failed** | `false` | absent | 1ʳᵉ tentative réelle → `telnyx_error` |
| 20:25:50 | **success** | `false` | `xos-dial-cd759d22-…` | ✅ **l'appel réel** |

`dialer_budget_reservations` : 6 `consumed` + 1 `released` = 7 lignes, soit exactement les 7 lignes d'audit. **La réservation a été relâchée sur l'échec et consommée sur le succès — le cap n'a pas été mangé par l'appel raté.** C'est la démonstration en production que `releaseReservation` (`api/dialer.js:176`) fait son travail. C'est le vrai résultat du smoke test, au-delà de « ça sonne ».

Le reste, vérifié :

- **Transport REST** : `api/_dialer/telnyx.js` — `POST /v2/calls`, choke point dry-run *à l'intérieur* de `telnyxPost` (`:35-40`), le seul endroit qui touche `fetch`. Aucun appelant ne peut le contourner par erreur.
- **Contrat de réponse** aligné sur le vrai Telnyx : `call_control_id` / `call_leg_id` / `call_session_id` en snake_case, de bout en bout (`telnyx.js:95-102` → `dialerApi.ts:44-53`).
- **Idempotence** : `command_id` unique par intention (`api/dialer.js:161`) + garde synchrone anti-double-clic côté UI (`DialerView.tsx:67`, `dialingRef` — parce que `disabled={dialing}` ne suffit pas, `setState` est asynchrone).
- **Triple garde dry-run** : `cfg.isDryRun || flags.dryRun || entitlements.dryRun`, la plus pessimiste gagne (`api/dialer.js:100-101`). C'était le fail-open P0 de la revue sécurité — fermé par `3086a30`.
- **Budget atomique** : RPC `dialer_reserve_budget` avec verrou consultatif — deux dials concurrents ne peuvent pas double-dépenser le même plafond.
- **Kill switch automatique** ORG_EXCEEDED (`api/dialer.js:124-143`), y compris le `JSON.stringify(false)` qui produit bien le `"false"` jsonb attendu.
- **Webhooks** : Ed25519 maison (`node:crypto`) plutôt que `standardwebhooks` — le diagnostic de `webhooks.js:10-14` est correct, les deux specs signent des chaînes différentes. Anti-replay 300 s, idempotence insert-first (la PK *est* le verrou), persistance des tentatives rejetées avant le 401.
- **Verrouillage de visibilité** (`6b43c5a`) : `?resource=config` exige désormais un JWT et ne fuit plus env/budgets/état caller ID.
- **Suite verte** : `NODE_ENV=test npm run test` → **127 fichiers, 1125 tests, exit 0**. `npm run build` → exit 0.

## A.2 Ce qui est EN ATTENTE

| Sujet | État | Bloqué par |
|---|---|---|
| **Audio** | ❌ néant | Rien de technique — c'est la Partie B |
| Webhooks entrants | ❌ 0 ligne dans `dialer_webhook_events` | Clé Ed25519 = **paid-only**, le receiver répond 503. Comportement attendu en trial |
| Event router `call.*` | ❌ stub (`webhooks.js:169-171`) | Dépend des webhooks |
| Table `dialer_calls` | ⚠️ **existe en base, aucun code ne l'écrit** | Voir D2 |
| Réconciliation du coût réel | ❌ `estimatedCostCents: 1` en dur | Dépend de `call.hangup` |
| `rateLimit.js` | ⚠️ **code mort** — testé, exporté par le barrel, le barrel n'est importé nulle part | Voir D3 |
| Provisioning per-user | ⚠️ schéma prêt (`dialer_phone_numbers`, `telnyx_credential_id`), 0 ligne, non câblé | Voir Partie B phase C |
| `connection_id` dans l'UI | ⚠️ collage manuel par l'utilisateur | Devrait être une config org |
| URL webhook stable | ⚠️ Quick Tunnel aléatoire | Passer sur Vercel avant tout user réel |

## A.3 Ce que la base révèle et que le code ignore — le schéma est en avance sur le code

C'est la découverte la plus utile de cet audit. `dialer_calls` contient déjà :

```
telnyx_call_id, telnyx_leg_id, agent_call_control_id, client_state,
started_at, answered_at, bridged_at, ended_at, duration_sec, hangup_cause,
outbound_phone_id, outbound_number, amd_result, cost_cents,
recording_path, transcript, transcript_json, ai_summary, ai_disposition,
ai_next_step, ai_sentiment, sf_task_id, sf_event_id
```

`agent_call_control_id` + `bridged_at`, ce sont **les deux colonnes d'une architecture à deux jambes avec bridge**. Quelqu'un a déjà pris la bonne décision d'architecture audio — elle est écrite dans le schéma, pas dans le code. La Partie B ne fait que la rattraper. De même, `dialer_user_entitlements.telnyx_credential_id` (text) attend précisément l'identifiant de credential WebRTC per-user.

Corollaire : **il n'y a probablement aucune migration à écrire pour la phase audio.** (Rappel : sur ce projet les migrations Supabase s'appliquent à la main, le fichier committé ne prouve rien — vérifier le schéma réel avant de croire `migration list`.)

## A.4 Dette technique et risques

| # | Sujet | Gravité | Constat | Correctif |
|---|---|---|---|---|
| **D1** | Fenêtre d'appel réel sans expiration | 🔴 | Ouvrir = 3 `UPDATE`, refermer = 3 `UPDATE` manuels. Oublié ce soir. | `dialer_enabled_until timestamptz` en settings ; `loadDialerFlags` renvoie `enabled: false` si dépassé. **~10 lignes dans `config.js`, aucune procédure à retenir.** |
| **D2** | `dialer_calls` orpheline | 🟠 | 23 colonnes, 0 écriture, 0 lecture. L'appel réel n'a laissé de trace que dans l'audit log. | Insérée par la phase B (`?resource=dial` insère, l'event router met à jour). |
| **D3** | Rate limiter fantôme | 🟠 | `rateLimit.js` est propre et testé mais jamais importé — **et `?resource=config` annonce `rate_rps`/`rate_burst`**. Une garantie affichée et non implémentée est pire que pas de garantie : elle empêche de la chercher ailleurs. | Câbler dans `handleDial`, **ou** supprimer le fichier *et* les deux champs de la réponse config. Ne pas laisser l'annonce seule. |
| **D4** | `estimatedCostCents: 1` en dur | 🟠 | Les plafonds comptent des appels, pas des euros. Devient critique avec l'audio : un appel de 20 min ≠ un appel de 5 s. | Phase B — réconciliation sur `call.hangup`. |
| **D5** | Paramètres de dial contrôlés par l'appelant | 🟠 | `webhook_url`, `connection_id`, `from` viennent du body. Exfiltration de métadonnées d'appel possible par choix du webhook. | Phase C — résolution serveur. |
| **D6** | Pas de validation de `to` | 🟠 | Ni E.164, ni allowlist de préfixes. | Phase C — une regex + une allowlist FR/UE. |
| **D7** | `dialer_campaigns.parallelism` | 🟡 | Le schéma expose une colonne « parallélisme ». Une valeur > 1 fait basculer Combo dans la définition ARCEP de « système automatisé » → NPV obligatoire, indisponible chez Telnyx FR. `dialParallel()` existe aussi dans `telnyx.js:107`, non appelé. | Ne pas supprimer (hors périmètre), mais **contrainte `check (parallelism = 1)`** ou commentaire de colonne. Une colonne qui invite à l'illégalité est un piège pour le prochain développeur. |
| **D8** | Barrel `_dialer/index.js` importé par personne | 🟡 | Donne une fausse impression de surface publique. | Le supprimer, ou l'utiliser. |
| **D9** | Regex image cassée dans `middleware.js:37` | 🟡 | Inoffensif aujourd'hui (relevé par la revue sécurité §2.2). | Tester `/api/` **avant** `isPublic`, pour qu'aucune règle d'asset ne puisse primer sur l'auth. |

**En une phrase :** le transport est solide et prouvé en conditions réelles ; ce qui reste faible, c'est tout ce qui **borne** ce transport (euros, durée, destinations, durée de la fenêtre) — et c'est exactement ce que l'audio va mettre sous tension.

---

# Partie B — Design du transport audio

## B.0 Le problème, en une phrase

Aujourd'hui `POST /v2/calls` fait sonner le téléphone du prospect **et personne n'est au bout du fil**. Il manque une jambe : le commercial. Le navigateur doit devenir un téléphone.

## B.1 Deux architectures possibles — et pourquoi une seule est acceptable

### Variante A — le navigateur compose directement

Le SDK `@telnyx/webrtc` se connecte à `wss://rtc.telnyx.com` (protocole Verto sur WebSocket) avec un token éphémère, puis `client.newCall({ destinationNumber })`. Telnyx ponte la jambe WebRTC vers le RTC public.

- ✅ Une seule jambe, ~1 jour de travail, **ne nécessite aucun webhook** → fonctionne en compte trial.
- ❌ **Le dial ne passe plus par `POST /api/dialer?resource=dial`.** Réservation budgétaire, gate d'entitlement, audit log, idempotence `command_id` : tout est court-circuité. Le serveur ne voit jamais l'appel partir.
- ❌ La preuve de conformité (« commande explicite d'un humain, tracée ») disparaît de l'audit log serveur.
- ❌ Mitigation par TTL court sur le token ? Insuffisante : un token valide N secondes autorise **N appels**, pas un.

Trois conseils ont passé plusieurs rounds à construire ces garde-fous. Les rendre contournables par la fonctionnalité suivante serait le pire résultat possible.

### Variante B — Call Control garde l'autorité, le navigateur est un terminal SIP

Le serveur reste le seul à composer. Deux ordres possibles :

- **B2 (rejetée)** — appeler le prospect d'abord, puis le commercial, puis bridger. Le prospect décroche dans le silence pendant que la jambe agent se monte. Mauvaise UX, et surtout mauvaise **optique de conformité** : un décroché sans humain au bout ressemble exactement à un appel automatisé.
- **B1 (retenue)** — **appeler le commercial d'abord**, puis le prospect, puis bridger. L'humain est en ligne avant que le prospect ne soit composé.

```
  clic « Appeler »
        │
        ▼
  POST /api/dialer?resource=dial      ← gates inchangés : JWT, flags, entitlement, budget, audit
        │
        ├─ 1. POST /v2/calls  to: sip:{sip_username}@sip.telnyx.com   ← jambe AGENT
        │                                                              (agent_call_control_id)
        ▼
  navigateur : appel entrant → auto-answer → 🔊 audio établi
        │
        ▼
  webhook call.answered (jambe agent)
        │
        ├─ 2. POST /v2/calls  to: +33…  link_to: {agent_call_control_id}   ← jambe PROSPECT
        │                                                                    time_limit_secs
        ▼
  bridge → 🔊 conversation → call.hangup → réconciliation coût + dialer_calls
```

### Verdict

**B1.** Et le schéma est d'accord depuis le début : `dialer_calls.agent_call_control_id` et `dialer_calls.bridged_at` n'ont de sens que dans cette architecture.

**Mais B1 exige les webhooks** (il faut savoir quand la jambe agent a décroché pour composer la seconde), donc le compte **payant** + la clé Ed25519 + une URL HTTPS stable. Ce n'est pas faisable ce soir. D'où le découpage de B.9 : la variante A sert de **spike jetable** pour prouver le son, puis on rebranche l'autorité côté serveur. Le delta entre les deux est mince — même SDK, même token, même machine à états, même micro. Seul le **sens** de l'appel change : `newCall()` en phase A, `on(inbound) → answer()` en phase B.

> ⚠️ **Inconnue à lever en phase A** (30 min de doc/test Telnyx, pas de spéculation) :
> 1. `link_to` sur `POST /v2/calls` ponte-t-il automatiquement au décroché, ou faut-il une action `bridge` explicite après `call.answered` ? Si l'auto-bridge existe, on économise un aller-retour webhook.
> 2. Tarification de la jambe agent WebRTC → Telnyx. Probablement gratuite ou à tarif SIP trunking, mais **à confirmer sur la grille avant de doubler le nombre de jambes**.

## B.2 L'endpoint token éphémère

### Où il vit

**Dans `api/dialer.js`, sous `?resource=webrtc_token`. Pas de nouveau fichier.**

Raison chiffrée : `api/*.js` hors tests et hors `_préfixe` = 10 fonctions Vercel (`auth, calls, cleaner, dialer, launcher, notifications, perf, review, status, weekly-targets`). Le plafond Hobby est 12. Créer `api/dialer-token.js` brûlerait un slot sur 2 restants pour une fonction de 30 lignes. Le pattern `?resource=` est déjà éprouvé sur `cleaner.js`, `calls.js` et `dialer.js`.

### Quelle auth

**Le même JWT Supabase.** Pas de second système. Trois raisons :

1. Le client l'a déjà — `apiFetch(token, …)` dans `dialerApi.ts` est le chemin existant.
2. Le token WebRTC doit être soumis **exactement au même gate** que le dial : `flags.enabled` ∧ `entitlement.enabled` ∧ `¬isDryRun`. Une auth différente = un gate qui diverge.
3. Un second système d'auth est un second système à casser.

### Contrat

```js
// api/dialer.js — nouveau resource, calqué sur handleDial
POST /api/dialer?resource=webrtc_token
  → verifyJWT                                          (déjà en place, ligne ~215)
  → flags.enabled sinon 503                            (déjà en place)
  → entitlements = loadUserEntitlements(client, user.id)
  → isDryRun = cfg.isDryRun || flags.dryRun || entitlements.dryRun
  → si isDryRun          → 200 { dry_run: true, token: null }     ⚠️ voir B.5
  → si !entitlements.enabled → 403 dialer_entitlement_denied
  → si !entitlements.telnyx_credential_id → 409 { error: 'no_rtc_credential' }
  → token = await issueRtcToken({ apiKey, credentialId, ttlSec: 600, dryRun: isDryRun })
  → writeAudit({ action: 'webrtc_token', result: 'success' })
  → 200 { token, sip_username, expires_in: 600 }
```

### Le piège d'implémentation

`POST /v2/telephony_credentials/{id}/token` **ne renvoie pas l'enveloppe `{ data: … }`** habituelle : le corps *est* le JWT, en texte brut. Or `telnyxPost` (`telnyx.js:52`) fait `return res.json()` — ça casse.

Correctif : ajouter le chemin texte **à l'intérieur** de `telnyxPost`, jamais à côté. Le court-circuit dry-run doit rester dans le seul choke point qui touche `fetch` — c'est le meilleur élément de design du lot 11.1, ne pas l'éroder.

```js
// api/_dialer/telnyx.js
async function telnyxPost(path, body, apiKey, dryRun, { raw = false } = {}) {
  if (dryRun) return raw ? 'DRYRUN_JWT' : (…fixtures existantes…);
  const res = await fetch(…);
  if (!res.ok) throw new TelnyxError(res.status, await res.json().catch(() => ({})));
  return raw ? res.text() : res.json();       // ponytail: une option, pas un second client
}

export async function issueRtcToken({ apiKey, credentialId, ttlSec = 600, dryRun }) {
  return telnyxPost(
    `/telephony_credentials/${encodeURIComponent(credentialId)}/token`,
    { expires_in: ttlSec },
    apiKey, dryRun, { raw: true },
  );
}
```

### TTL

**600 s**, pas 24 h. Le token vaut pour une session de prospection, pas pour la journée. Il est ré-émis à l'expiration (le SDK émet un événement de déconnexion). Un token long qui fuit = un téléphone gratuit sur le compte Telnyx.

### Prérequis Telnyx, à ne pas confondre

Le `connection_id` actuel est une **Voice API Application** (Call Control). Les clients WebRTC s'enregistrent sur une **Credential Connection** — c'est un autre objet Telnyx. Il faut donc, une fois :

1. créer une *Credential Connection* dans le portail ;
2. `POST /v2/telephony_credentials { connection_id: <credential-connection-id>, name: 'xos-theo' }` → renvoie un `id` et un `sip_username` ;
3. `update dialer_user_entitlements set telnyx_credential_id = '<id>' where user_id = '…'`.

Manuel pour un utilisateur en phase A. Automatisé en phase C.

## B.3 Machine à états

**Ne pas en écrire une nouvelle.** `src/apps/calls/modules/dialer/domain/CallState.ts` définit déjà exactement les bons états :

```ts
'idle' | 'dialing' | 'ringing' | 'connected' | 'on_hold' | 'wrapping' | 'ended' | 'failed'
```

Il n'y a qu'à les piloter. Deux sources d'événements, et **la règle qui tranche entre elles** :

> **Le SDK pilote l'UI. Les webhooks pilotent le registre.**

L'UI ne doit jamais attendre un aller-retour webhook pour afficher « connecté » — ce serait 200-500 ms de latence perçue sur chaque transition, et surtout ça ne marcherait pas du tout en phase A (pas de webhook en trial). Inversement, l'audit, `dialer_calls` et la facturation ne doivent jamais faire confiance à un client.

Correspondance SDK → `CallPhase` :

| `call.state` (@telnyx/webrtc) | `CallPhase` |
|---|---|
| `new`, `requesting`, `trying` | `dialing` |
| `early`, `ringing` | `ringing` |
| `active` | `connected` |
| `held` | `on_hold` |
| `hangup`, `destroy` | `ended` |
| erreur SDK / token refusé | `failed` |

Correspondance webhook → `dialer_calls` :

| Événement Telnyx | Écriture |
|---|---|
| `call.initiated` | `insert` (jambe agent) ou `update started_at` |
| `call.answered` (jambe agent) | `answered_at` → **déclenche la composition du prospect** |
| `call.answered` (jambe prospect) | `bridged_at` |
| `call.hangup` | `ended_at`, `duration_sec`, `hangup_cause`, `cost_cents` réconcilié |
| `call.machine.detection.ended` | `amd_result` |

Fichier : `src/apps/calls/modules/dialer/application/useRtcCall.ts` — un hook, pas une classe. `orchestrator.ts` reste le stub qu'il est ; **il ne faut pas l'implémenter** : il a été écrit pour du multi-ligne parallèle, ce que la conformité interdit (D7).

## B.4 Micro — l'ordre des opérations est la partie qui compte

`getUserMedia` exige un **contexte sécurisé** (HTTPS ou `localhost`) : `vercel dev` en local et l'URL du tunnel conviennent tous les deux. Ce n'est pas le problème.

Le problème est l'ordre. Si on compose d'abord et qu'on demande le micro ensuite, le prospect sonne pendant que le commercial regarde une popup de permission Chrome.

```
clic « Appeler »
  → navigator.mediaDevices.getUserMedia({ audio: true })     ← D'ABORD, sur le geste utilisateur
      ├─ refusé → phase 'failed', message clair, ON NE COMPOSE PAS
      └─ accordé
          → POST ?resource=webrtc_token
          → client.connect()  (attendre 'telnyx.ready')
          → POST ?resource=dial                               ← seulement maintenant
```

Compléments, chacun justifié :

- **Pré-vol** : `navigator.permissions.query({ name: 'microphone' })` au montage de la vue, affiché comme un `<Tag>` dans la carte « État », à côté de « Caller ID » et « Webhook key ». C'est l'idiome existant de `DialerView.tsx:130-175`, on l'étend sans inventer.
- **Sortie audio** : un `<audio autoplay>` unique auquel le SDK attache le flux distant. L'autoplay est autorisé puisqu'on est après un geste utilisateur.
- **Sélecteur de périphérique** (`enumerateDevices`) : **hors périmètre v1.** Le casque par défaut du système marche. À ajouter quand quelqu'un se plaint, pas avant.

## B.5 Dry-run dans le navigateur

Garantie à tenir : **en dry-run, zéro paquet ne part vers `rtc.telnyx.com`.**

La façon dont on la tient importe plus que la garantie elle-même. Un booléen `if (dryRun) return` côté client se retourne dans la console en trois secondes. Donc, en miroir exact du choke point `telnyxPost` :

> **Le dry-run est appliqué côté serveur en n'émettant pas de token. Le navigateur ne peut pas se connecter parce qu'il n'a rien avec quoi se connecter.**

```ts
// src/apps/calls/modules/dialer/infrastructure/telnyx/rtcClient.ts
export async function createRtcClient(token: string | null) {
  if (!token) return null;                       // dry-run : le serveur n'a rien émis
  const { TelnyxRTC } = await import('@telnyx/webrtc');   // ponytail: lazy — voir B.9
  return new TelnyxRTC({ login_token: token });
}
```

Toute la vue traite `client === null` comme « mode simulation » : la machine à états joue `dialing → ringing → connected` sur des timers, aucun média, un `<Tag>` « simulation ». Ça reste utile pour les démos et les tests UI, et c'est **impossible à transformer en vrai appel** depuis le navigateur.

## B.6 Conformité B2B — ce que l'audio change et ce qu'il ne change pas

Le cadre de `docs/compliance/demarchage-b2b-france.md` tient : ARCEP 2022-1583 §7.1.3 exclut de la définition de « système automatisé » « les appels émis individuellement, **sans parallélisation possible** et sur la **commande explicite d'un humain** pour chaque appel ». B1 conserve les deux propriétés — mieux, l'appel de la jambe agent en premier rend la présence humaine *démontrable* : `dialer_calls.answered_at` de la jambe agent est **antérieur** au `started_at` de la jambe prospect. C'est une preuve horodatée, pas une déclaration.

Ce qu'il faut ajouter, en revanche :

1. 🔴 **Un seul appel actif par utilisateur, garanti par la base.** Aujourd'hui rien ne l'empêche : `calls_day_limit = 50` borne le volume quotidien, pas la **simultanéité**. Cinquante dials concurrents passeraient. C'est la fonctionnalité que la conformité interdit, et elle est actuellement autorisée par omission.

   Correctif — un index, pas du code applicatif :

   ```sql
   alter table public.dialer_calls add column if not exists owner_user_id uuid;
   create unique index if not exists dialer_calls_one_active_per_user
     on public.dialer_calls (owner_user_id) where ended_at is null;
   ```

   `handleDial` insère dans `dialer_calls` **avant** d'appeler Telnyx ; la violation d'unicité `23505` devient un `409 already_on_call`. La garantie légale la plus forte du produit tient alors en une ligne de DDL, et aucun bug applicatif futur ne peut la contourner. *(Note : `dialer_calls` n'a aujourd'hui que `logged_by`, pas de propriétaire d'appel — d'où la colonne à ajouter.)*

2. 🔴 **Pas d'enchaînement automatique.** Après `call.hangup`, la machine à états va en `wrapping` puis `idle`. Elle ne compose **jamais** le contact suivant. Pas de « suivant automatique », pas de compte à rebours, pas de file. Un commentaire explicite dans `useRtcCall.ts` doit dire *pourquoi*, en citant l'ARCEP — sinon un développeur bien intentionné ajoutera l'auto-next comme amélioration UX dans six mois.

3. 🟠 **Enregistrement : reporté, délibérément.** `dialer_calls.recording_path` et `transcript` existent, `dialContact` accepte déjà `record`. Ne pas l'activer avant : annonce en début d'appel, base légale et durée de conservation documentées, information des deux parties, procédure d'effacement. RGPD sur un enregistrement de voix, ce n'est pas une case à cocher. Le paramètre reste `false` par défaut — c'est le cas aujourd'hui (`api/dialer.js:169`), le garder.

4. 🟡 **`parallelism`** (D7) : au moment où on touche au schéma, poser `check (parallelism = 1)`.

## B.7 Budget — l'audio transforme un problème latent en problème réel

`estimatedCostCents: 1` était défendable pour un dial qui ne produit pas de conversation. Avec l'audio : un appel de 20 min vers un mobile FR coûte 10 à 15 centimes, pas 1. Et B1 facture potentiellement deux jambes.

Trois correctifs, par ordre de rapport valeur/effort :

**1. `time_limit_secs` — une ligne, le meilleur ratio du lot.**

```js
// api/_dialer/telnyx.js — dialContact()
timeout_secs: 30,          // existant : délai de sonnerie
time_limit_secs: 1800,     // NOUVEAU : durée max de communication
```

Aujourd'hui, si l'onglet du navigateur crashe pendant un appel connecté, **rien ne le raccroche**. La jambe tourne et facture. Un paramètre borne le pire cas. À faire même sans le reste.

**2. Réconciliation sur `call.hangup`.** Telnyx ne met pas le prix dans le webhook (l'autorité, c'est le CDR / Detail Records). Version paresseuse suffisante :

```js
// settings: dialer_cost_cents_per_min (défaut 2)
const cents = Math.max(1, Math.ceil(durationSec / 60) * ratePerMin);
// update dialer_calls.cost_cents + dialer_audit_log.cost_cents + le compteur de dépense
```

Approximatif mais **du bon ordre de grandeur**, ce qui suffit à faire enfin dire « euros » aux plafonds au lieu de « appels ». La réconciliation CDR exacte est un raffinement ultérieur, pas un prérequis.

**3. Garder la borne Telnyx.** Le *daily spend limit* de l'Outbound Voice Profile reste le seul contrôle qui parle en euros vrais tant que (2) n'est pas livré. Le runbook §3 doit rester **obligatoire**, pas indicatif.

## B.8 Garanties fail-closed du chemin audio

| # | Garantie | Mécanisme | Où |
|---|---|---|---|
| G1 | Pas de token WebRTC sans le triple gate | Même OR pessimiste que `handleDial` | `api/dialer.js` (`webrtc_token`) |
| G2 | Dry-run ⇒ pas de connexion possible | Le serveur n'émet pas de token ; `createRtcClient(null)` → `null` | serveur + `rtcClient.ts` |
| G3 | Token de courte durée, tracé | TTL 600 s + ligne d'audit par émission | `issueRtcToken` + `writeAudit` |
| G4 | Un appel actif par utilisateur | Index unique partiel `where ended_at is null` | base |
| G5 | Durée d'appel bornée | `time_limit_secs: 1800` sur les deux jambes | `telnyx.js` |
| G6 | Kill switch effectif sur les appels **en cours** | La vue en appel sonde `?resource=config` toutes les 15 s ; `enabled=false` → raccroche | `useRtcCall.ts` |
| G7 | Fenêtre d'appel réel auto-expirante | `dialer_enabled_until` (D1) | `config.js` |
| G8 | SDK confiné | Import de `@telnyx/webrtc` autorisé **uniquement** dans `infrastructure/telnyx/**` | `eslint.config.js` |

G6 mérite un mot : aujourd'hui le kill switch bloque les *nouveaux* dials et ne fait rien contre un appel déjà établi. Avec de l'audio et une durée réelle, c'est le scénario qui coûte. Le sondage de 15 s est la version paresseuse honnête — la version forte (raccrochage serveur de toutes les jambes vives) est une action admin de phase C.

G8 est déjà à moitié écrit : `eslint.config.js:91-93` dit *« tant que la lib Telnyx n'est pas installée, cette règle catche… Sera renforcée en 11.2 quand le SDK sera installé. »* Il suffit d'ajouter `'@telnyx/webrtc'` à la liste des imports restreints. Le repo s'est laissé une note ; on la traite.

## B.9 Plan par phases, au fichier près

### Phase 0 — Refermer la fenêtre · 2 min · **bloque tout le reste**

Les trois `UPDATE` de A.0. Puis D1 (`dialer_enabled_until`) dans la foulée pour ne plus jamais dépendre d'une discipline manuelle.

### Phase A — « prouver le son » · ~1 jour · **compte trial suffit, aucun webhook**

Objectif unique et binaire : **deux personnes s'entendent.**

| Fichier | Action |
|---|---|
| `package.json` | `npm i @telnyx/webrtc` |
| `eslint.config.js:99-114` | ajouter `'@telnyx/webrtc'` aux imports restreints (G8) |
| `api/_dialer/telnyx.js` | option `{ raw }` dans `telnyxPost` + `issueRtcToken()` (B.2) |
| `api/dialer.js` | `case 'webrtc_token'` dans le routeur + `handleWebrtcToken()` calqué sur `handleDial` |
| `api/_dialer/telnyx.test.js` | test : dry-run ⇒ token factice, **pas de `fetch`** |
| `api/dialer.test.js` | tests : 403 sans entitlement, `{token:null}` en dry-run, 409 sans credential |
| **nouveau** `src/apps/calls/modules/dialer/infrastructure/telnyx/rtcClient.ts` | `createRtcClient()` — import dynamique, `null` si pas de token |
| **nouveau** `src/apps/calls/modules/dialer/application/useRtcCall.ts` | hook : micro → token → connect → `newCall()` → `CallPhase` |
| `src/apps/calls/modules/dialer/dialerApi.ts` | `fetchRtcToken(token)` |
| `src/apps/calls/modules/dialer/DialerView.tsx` | `<Tag>` micro, `<audio>`, badge de phase, bouton **Raccrocher** |
| manuel (une fois) | Credential Connection Telnyx → `telephony_credentials` → `update dialer_user_entitlements set telnyx_credential_id = …` |

Volontairement en **variante A** (le navigateur compose) : c'est le seul moyen de prouver l'audio sans webhooks, donc sans compte payant. Code jetable : une trentaine de lignes dans le hook. Tout le reste (token, SDK, micro, machine à états, `<audio>`) est réutilisé tel quel en phase B.

> ⚠️ Fenêtre réelle **rouverte pour ce test**, un appel, **refermée immédiatement**. Et livrer D1 *avant* ce test, pas après.

### Phase B — remettre le serveur au centre · ~2-3 jours · **exige le compte payant**

Prérequis : clé Ed25519 dans `WEBHOOK_TELNYX_PUBLIC_KEY`, URL Vercel stable (plus de Quick Tunnel), Event Webhook configuré.

| Fichier | Action |
|---|---|
| `api/_dialer/webhooks.js:169-171` | remplacer le stub par le routeur `call.initiated / answered / hangup / machine.detection.ended` |
| **nouveau** `api/_dialer/calls.js` | `insertCall`, `updateCallFromEvent` — écritures dans `dialer_calls` (D2) |
| base (à la main) | `owner_user_id` + index unique partiel (B.6-1) |
| `api/dialer.js` `handleDial` | insert `dialer_calls` → `409 already_on_call` sur `23505` ; composer la **jambe agent** (`sip:{sip_username}@sip.telnyx.com`) |
| `api/_dialer/telnyx.js` | `time_limit_secs` ; `bridgeCalls()` ; `link_to` si l'auto-bridge est confirmé |
| `useRtcCall.ts` | passer de `newCall()` à `on(inbound) → answer()` ; **retirer la capacité de composer** |
| `webhooks.js` | réconciliation du coût sur `call.hangup` (B.7-2) |

### Phase C — durcir · ~1-2 jours

`from` / `connection_id` / `webhook_url` résolus côté serveur depuis `dialer_phone_numbers` (D5) · validation E.164 + allowlist de destinations (D6) · trancher sur `rateLimit.js` : câbler **ou** supprimer avec son annonce (D3) · provisioning automatique des credentials WebRTC · `check (parallelism = 1)` (D7) · retirer le champ Connection ID de l'UI.

### Explicitement **hors** périmètre

Enregistrement, transcription, résumé IA, hold/transfert, ACW, sélecteur de périphérique, multi-ligne (interdit), `orchestrator.ts`.

## B.10 Verdict — le plus petit pas qui prouve l'audio

> **Refermer la fenêtre (3 `UPDATE`, maintenant). Puis : une Credential Connection Telnyx, `?resource=webrtc_token` dans `api/dialer.js`, `@telnyx/webrtc` chargé en dynamique derrière `createRtcClient()`, et un bouton « Appeler » qui demande le micro avant de composer.**
>
> **Critère de succès, binaire, non négociable : Théo clique dans le navigateur, son portable sonne, et les deux côtés s'entendent. Puis il raccroche et la fenêtre se referme.**
>
> Estimation : ~1 jour. Aucun webhook, aucune migration, aucun compte payant. Le pont deux-jambes, la réconciliation des coûts et le provisioning viennent après — ce sont des problèmes d'architecture, et l'architecture peut attendre que le son sorte du haut-parleur.

Une seule chose doit précéder ce test : **D1, l'expiration automatique de la fenêtre.** La fenêtre de ce soir est encore ouverte au moment où ces lignes sont écrites. Rouvrir une fenêtre manuelle pour un second test sans avoir corrigé la cause, c'est reproduire l'incident en connaissance de cause.

---

## Annexe — vérifications exécutées

```
NODE_ENV=test npm run test         → 127 fichiers, 1125 tests, exit 0
NODE_ENV=test npm run build        → exit 0 (avertissement chunk > 500 kB, préexistant)
```

Base distante `xos-portal` (`vvbslsatsuxgykjczjdt`), lectures seules :

- `settings where key like 'dialer%'` → `dialer_enabled="true"`, `dialer_dry_run="false"` → **A.0**
- `dialer_user_entitlements` → 1 ligne, `enabled=true`, `dry_run=false`, `telnyx_credential_id` **null**
- `dialer_audit_log where action='dial'` → 7 lignes : 5 dry-run, 1 échec réel, 1 succès réel avec `command_id`
- `dialer_budget_reservations` → 6 `consumed` (6 ¢) + 1 `released` (1 ¢), cohérent ligne à ligne avec l'audit
- `dialer_webhook_events` → **0** (attendu en trial) · `dialer_phone_numbers` → **0**
- `information_schema.columns` pour `dialer_*` → `dialer_calls` possède `agent_call_control_id`, `bridged_at`, `cost_cents` ; `dialer_user_entitlements` possède `telnyx_credential_id` → **A.3**

Contrôles statiques :

- `grep -rn "dialer_calls" api src` → **aucune occurrence** : table orpheline (D2)
- `grep -rn "RateLimiter|TokenBucket" api src` → hors tests, seule référence `_dialer/index.js:7`, barrel non importé (D3)
- `ls api/*.js` hors tests et hors `_` → 10 fonctions Vercel sur 12 (B.2)
- `eslint.config.js:86-114` → règle de frontière Telnyx présente, note « à renforcer en 11.2 quand le SDK sera installé » (G8)
