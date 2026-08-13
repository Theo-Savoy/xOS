# Audit indépendant final — Lot 11.8 (issue #68) — Voice API + AMD power pool

> Agent : Cursor Grok 4.6 · Branche `feat/68-telnyx-power-dialer` · HEAD git `03efa42`  
> Périmètre : working tree non commité (fichiers listés au brief)  
> Méthode : revue adversariale du code + exécution des tests du lot. **Aucun fichier applicatif modifié.**

---

## Verdict global

**REJECT.** Le cœur serveur (Voice API, AMD winner-takes-all, RLS, fail-closed webhook, unique session, CAS `connecting|active` à la persistance agent) est largement à la hauteur des claims. Le chemin produit « le SDK reçoit l’invitation agent et l’accepte » est en revanche un **false green** : les tests injectent `call.clientState` au premier niveau, alors que `@telnyx/webrtc` 2.27.8 range cet état dans `call.options.clientState` et n’expose **jamais** `this.clientState`. En conditions réelles le poste n’accepte pas le leg agent ; le gagnant AMD reste en silence jusqu’au timeout.

Un second trou, plus étroit, peut **raccrocher une conversation humaine déjà active** si le webhook AMD est retraité après `status=active`.

Les tests du périmètre passent (120/120) — c’est précisément le problème : ils ne couvrent pas le contrat SDK réel ni le retry AMD post-`active`.

---

## Findings

| ID | Sévérité | file:line | Description | Preuve | Recommandation |
|---|---|---|---|---|---|
| F-01 | **BLOQUANT** | `useDialerPool.ts:235-247` | Le filtre d’acceptation inbound lit `call.clientState`. Le SDK Telnyx stocke l’état d’invite dans `call.options.clientState`. `inviteKind` reste `null` → `call.answer()` n’est jamais appelé. Claim 1 / flux spec §11 cassés. | Voir §Preuve F-01. Tests verts : `useDialerPool.test.tsx:138-165` fabriquent `{ clientState: btoa(...) }` (forme que le SDK ne produit pas). | Lire `call.options?.clientState ?? call.clientState`. Fallback : accepter l’unique inbound tant que `sessionIdRef` est posé et `!agentCallRef`. Ajouter un test sur `{ options: { clientState }, direction: 'inbound' }`. |
| F-02 | **BLOQUANT** | `pool.js:362-367` puis `413-421` | Recheck **pré-dial** n’accepte que `status === 'connecting'`. Le short-circuit `winner_already_connected` est **après** ce throw. Retry AMD une fois la session `active` → « pool cancelled before agent dial » → hangup du winner (et de l’agent). | Voir §Preuve F-02. Le test « retry du même winner » (`pool.test.js:198-208`) force `status: 'connecting'`. Le test CAS `active` (`221-231`) ne touche que le **post-dial**. Aucun test `claimState=same` + `status=active`. | Avant le throw : si `status === 'active'` ou (`same` && `agent_call_control_id`) → `winner_already_connected`. Aligner le precheck sur `['connecting','active']`. |
| F-03 | **MAJEUR** | `useDialerPool.ts:320` | Hors `simulate`, un `pool_start` `dry_run` / sans `session_id` bascule **silencieusement** en démo (`startDemo()`), alors que le poste RTC réel peut déjà être enregistré. Contredit claim 7. | Lecture : `if (started.dry_run \|\| !started.session_id) { startDemo(); return; }` après `ensureAgentRegistered()`. Le test timeout (`useDialerPool.test.tsx:272-331`) ne couvre pas un 200 `dry_run`. | `pool-error` + zéro timer démo si `simulate===false`. |
| F-04 | **MAJEUR** | `useDialerPool.ts:303-314` + `poolLogic.ts:47-77` | `dispatch({ type: 'play' })` **avant** `telnyx.ready`. Timeout/erreur → `pool-error` (`running=false`) mais lignes restées `dialing`, file déjà consommée. Play redevient cliquable et no-op ; « Tout raccrocher » disparaît (`isRunning`). False green : le test timeout n’interdit pas `phase==='dialing'`. | Voir §Preuve F-04. `PowerDialerView.tsx:61-71` : hangup seulement si `isRunning`. | Ne dispatcher `play` qu’après ready, ou rollback (`reset` / restaurer la file) sur timeout. Tester `lines.every(idle\|skipped)` et file intacte. |
| F-05 | **MAJEUR** | `PowerDialerView.tsx:61-64` vs `useDialerPool.ts:346-369` | Claim 11 : hangup serveur en échec → session conservée **et retry exposé**. Le hook conserve `sessionIdRef` et un 2ᵉ `hangupAll()` rappelle le serveur (`useDialerPool.test.tsx:362-387`). L’UI, après `reset`, n’affiche plus le bouton hangup. Retry inaccessible. | `hangupAll` dispatch `reset` tout de suite → `isRunning=false`, lignes `idle` → `hasAttempted=false` → bouton Play (souvent disabled, file vidée). | Garder un CTA « Réessayer le raccrochage » tant que `sessionIdRef` est set ; ne pas `reset` visuel avant 200. |
| F-06 | **MAJEUR** | `pool.js:111-113` | Si tous les slots échouent, l’UPDATE `status='failed'` **n’inspecte pas** `{ error }`. Échec silencieux → session coincée en `dialing` + index unique `uq_dialer_pool_one_active_per_owner` → 409 sur tout nouveau `pool_start`. Écart matrice 8 (hors webhook). | Lecture directe ; pas de `.error` ni throw. Contraste : `completePoolWithoutWinner` (`197-200`) throw si `completeErr`. | Checker l’erreur ; throw/500. Réconciliation : forcer `failed` ou permettre hangup. |
| F-07 | **MINEUR** | `CallManagerApp.tsx:125-126,1997-2010` | Spec : URL directe `power-dialer` « retourne à l’accueil ». Implémentation : écran « Accès restreint », pas `sessions`. Pas d’élévation (le pool n’est pas monté). | `viewFromParams('power-dialer')` reste sur cette vue ; gate `canPowerDialer`. | `setView('sessions')` si `!canPowerDialer`. |
| F-08 | **INFO** | `webhooks.test.js:97-115` + `idempotency.js:50-68` | False green de la chaîne webhook **production**. `handleWebhook` d’intégration mocke `createClient` **sans** `rpc` → fallback INSERT, pas `dialer_claim_webhook_event`. Un `call.answered` sans `client_state` est `ignored` puis 200. Lease 5 min / retry `failed` non exercés bout-en-bout. | `npx vitest run api/_dialer/webhooks.test.js` (hors batch 11.8, lu). `checkAndRecordWebhook` n’emprunte le RPC que si `typeof client.rpc === 'function'`. | Test `handleWebhook` avec `rpc` + `processPoolWebhook` AMD/agent ; replay `failed` vs `processed`. |

---

## Preuves détaillées

### F-01 — propriété SDK (false green du happy path)

Code produit :

```235:247:src/apps/calls/modules/dialer/application/useDialerPool.ts
        const inviteState = (call as { clientState?: string }).clientState;
        // ...
        if (
          (call as { direction?: string }).direction === 'inbound' &&
          inviteSessionId === sessionIdRef.current &&
          inviteKind === 'agent' &&
          !agentCallRef.current
        ) {
```

Contrat SDK (`node_modules/@telnyx/webrtc`) :

- `BaseCall.d.ts` : `options: IVertoCallOptions` (`clientState?: string`) ; `direction: Direction` ; **pas** de champ `clientState` sur l’instance.
- Bundle (invite inbound) : `m.client_state&&(h.clientState=m.client_state)` puis `new Call(session, h)` — l’état va dans **les options du constructeur**.
- Recherche `this.clientState=` dans `bundle.js` : **aucun hit** (`python3`, 2026-08-13).

Le test « accepte uniquement l’invitation agent » pose `clientState` **sur l’objet call**, pas dans `options`. Il passe donc sans coller au SDK.

`direction === 'inbound'` est, lui, correct (`Direction.Inbound = "inbound"`).

### F-02 — retry AMD après `active`

```362:367:api/_dialer/pool.js
    if (!liveSession || liveSession.status !== 'connecting' || liveSession.winner_call_id !== call.id) {
      throw new Error('pool cancelled before agent dial');
    }
    if (claimState === 'same' && liveSession.agent_call_control_id) {
      return { status: 'processed', result: 'winner_already_connected' };
    }
```

Le catch raccroche systématiquement le winner (`413-421`) puis tente `status='failed'` sur `['dialing','connecting','active']`.

Course réaliste :

1. AMD `human` → claim + dial agent + persist `agent_call_control_id` → return `winner`.
2. `webhooks.js:175-180` : UPDATE `processed` échoue → catch marque `failed`, **503**.
3. `call.answered` agent (autre `event_id`) passe la session à `active`.
4. Telnyx rejoue l’AMD (503) ; RPC reprend le `failed` ; precheck throw → hangup du live.

L’idempotence **happy path** (event déjà `processed`) protège le doublon nominal. Elle ne protège pas l’échec de clôture d’event. Le CAS post-dial (`392-395`) accepte bien `active` — matrice 4 pour **ce** CAS est vraie ; le precheck ne l’est pas.

### F-04 — timeout ready

```303:314:src/apps/calls/modules/dialer/application/useDialerPool.ts
    dispatch({ type: 'play' });
    // ...
      if (!registered) {
        dispatch({ type: 'pool-error', error: 'Poste WebRTC indisponible — impossible de lancer le pool.' });
        return;
      }
```

`pool-error` (`poolLogic.ts:136`) ne remet pas les lignes à `idle` et ne restaure pas la file. Le test timeout (`useDialerPool.test.tsx:291-295`) vérifie `connected`/`ringing` absents et `isRunning===false`, **pas** `dialing`.

Exécution tests (2026-08-13) :

```
npx vitest run api/_dialer/pool.test.js api/_dialer/telnyx.test.js api/dialer.test.js \
  api/_dialer/config.test.js api/_dialer/idempotency.test.js \
  src/apps/calls/modules/dialer/application/useDialerPool.test.tsx \
  src/apps/calls/modules/dialer/application/poolLogic.test.ts \
  src/apps/calls/modules/dialer/PowerDialerView.test.tsx \
  src/apps/calls/modules/dialer/application/useRtcCall.test.tsx

Test Files  9 passed (9)
     Tests  120 passed (120)
```

---

## Matrice de vérification (1–15)

| # | Statut | Preuve |
|---|---|---|
| 1. Deux `pool_start` → 409 | **VÉRIFIÉ** | Index `uq_dialer_pool_one_active_per_owner` (`048:16-18`, statuts `dialing\|connecting\|active\|cancelling`). API : `pool.js:41-42` code `23505`. Test : `pool.test.js:111-122`. |
| 2. Clé webhook absente → 503, zéro provider | **VÉRIFIÉ** (avec trou de test routeur) | `startPool` : `pool.js:30-32` + test `pool.test.js:95-109` (`dialContact` non appelé). `webrtc_token` / `dial` : `dialer.js:182-184,504-506` + `dialer.test.js:180-207`. **Écart de couverture** : ce test handler n’appelle pas `resource=pool_start`. |
| 3. Retry winner après échec partiel | **ÉCART** | `same` + `agent_call_control_id` → no-op (`pool.js:365-367`, test `210-218`). `same` sans agent id **recompose** (`198-208`) — voulu si persist incomplète. `same` + `status=active` → **F-02**. |
| 4. Agent déjà `active` avant CAS persist | **VÉRIFIÉ** (CAS seulement) | Post-dial `['connecting','active']` (`385-395`). Test `pool.test.js:221-231`. Precheck **non** aligné (F-02). |
| 5. Annulation avant CAS | **VÉRIFIÉ** | RPC `cancelling` → `inactive` (`048:71`, `pool.js:314-316`). Test `260-268`. Course persist : hangup agent+winner (`233-248`). UPDATE `failed` borné aux statuts live (`431-434`) : n’écrase pas `cancelling`. |
| 6. AMD tardif sur ligne terminée | **VÉRIFIÉ** (SQL + branche JS) | `dialer_claim_pool_winner_state` : `ended_at is null` + `status in ('dialing','ringing','answered')` sinon `inactive` (`048:62-68`). JS : `claimState === 'inactive'` (`314-316`). Test SQL-string `pool.test.js:485-495` ; pas d’unité JS « ligne ended ». |
| 7. `answered` tardif | **VÉRIFIÉ** | `dialer_mark_call_answered` : `status = case when ended_at is null then 'answered' else status end` + réservation → `consumed` si `reserved\|released\|expired` (`048:103-114`). Test SQL + délégation RPC `pool.test.js:463-481`. |
| 8. Terminaux monotones + `{ error }` checkés | **ÉCART** | Webhook : throw si erreur session/claim/completion (tests `335-461`). Hangup agent : `.in('status', ['connecting','active'])` — n’écrit pas `cancelled`/`failed`. **F-06** : UPDATE `failed` de `startPool` non checké. `getPoolStatus` : `error \|\| !session` → 404 (`pool.js:128`) masque une erreur DB. |
| 9. Pas de `pool_start` avant `telnyx.ready` | **VÉRIFIÉ** (start) / **ÉCART** (échec) | Test `useDialerPool.test.tsx:101-136,272-331,389-410` : zéro `pool_start` avant ready / timeout / unmount. **F-03** démo silencieuse ; **F-04** UI `dialing` résiduelle. `newCall` prospect jamais appelé (`132`). |
| 10. Winner terminé sans `bridged` → pas redialé | **VÉRIFIÉ** | `winnerDestinationRef` dès `winner_call_id` (`useDialerPool.ts:131-134`). `redial` filtre cette dest (`380-381`). Test `333-360`. |
| 11. Hangup échec → session + retry ; epoch | **ÉCART** (UI) | Hook : `sessionIdRef` conservé, epoch `353` vs poll `126`. Test hook `362-387`. **F-05** : bouton absent. |
| 12. Skip ligne ≠ remplaçant serveur | **VÉRIFIÉ** | `poolLogic.ts:80-89` : skip sans `shift` file. Tests `poolLogic.test.ts:29-35`, `PowerDialerView.test.tsx:99-120`, `useDialerPool.test.tsx:210-224`. |
| 13. Hangup ligne idempotent ; tout raccrocher → `cancelled` | **VÉRIFIÉ** | Hangup ligne : `.is('ended_at', null)` (`pool.js:152-154`) → no-op si déjà fini. Session : `dialer_begin_pool_cancellation` puis `cancelled` seulement depuis `cancelling` (`144-181`). Tests `285-311`. Hangup Telnyx incertain : pas de `closeCallRow` (`286-297`). |
| 14. Redial → nouvelle session / `command_id` | **VÉRIFIÉ** (impl.) / **ÉCART** (contrat HTTP) | Pas de `resource=pool_redial` (spec §Contrats). Le client rappelle `pool_start`. `command_id = xos-pool-${pool.id}-${slot}` (`pool.js:69`) → nouvel UUID session. Winner sort (matrice 10) ; skipped relançables (`redial` + reducer `play`). |
| 15. RLS deny_all ; security definer → `service_role` | **VÉRIFIÉ** (contrat SQL) | `046:39-42` policy `deny_all`. `048` : `revoke all … from public, anon, authenticated` + `grant execute … to service_role` sur `dialer_begin_pool_cancellation`, `dialer_claim_pool_winner_state`, `dialer_mark_call_answered`, `dialer_claim_pool_winner`. `047` idem webhook claim. Pas d’exécution Postgres ici. |

---

## Claims 1–8 (synthèse)

| Claim | Statut |
|---|---|
| 1. Legs prospect Voice API serveur ; navigateur = poste inbound unique | **ÉCART** — dial prospect : `privacy:none`, AMD premium, `from`, `command_id`, webhook HTTPS (`telnyx.js:67-83`, `telnyx.test.js:17-41`). **F-01** : l’inbound agent n’est pas accepté sur le contrat SDK réel. |
| 2. Premier AMD `human`/`not_sure` gagne ; machine/fax/silence/screening terminaux | **VÉRIFIÉ** (code) — `HUMAN_RESULTS` / `MACHINE_RESULTS` (`pool.js:8-9`) + RPC `FOR UPDATE`. Pas de test unitaire **machine** (hangup + `voicemail`) dans `pool.test.js`. |
| 3. Bridge agent `link_to` + `bridge_on_answer` ; audio muet avant `active` | **ÉCART** — transport agent : `telnyx.test.js:43-61`. Mute UI : `PowerDialerView.tsx:31-36`, test `useDialerPool.test.tsx:156-163` — **conditionné à F-01**. |
| 4. Gates JWT → flags → entitlement → dry-run → E.164 → caller ID → parallel 1..5 → budget → webhook key | **VÉRIFIÉ** — router JWT (`dialer.js:612-613`) + `flags.enabled` 503 (`624-629`) ; `startPool` parallel/E.164 (`18-23`), dry-run avant Telnyx (`27-29`), webhook/connection/caller/credential (`30-32`), ownership (`34-35`), `reserveBudget` par slot (`52-64`). |
| 5. Webhook Ed25519 fail-closed, anti-rejeu, dédup, retry, persist rejets | **VÉRIFIÉ** (unité) — `webhooks.js:126-149` 503/401 ; `recordAttempt` préfixe `rejected:` (`209`) pour ne pas squatter la PK. Retry atomique SQL `047`. **F-08** : intégration sans RPC. |
| 6. Une session / user ; winner idempotent ; close/release une fois | **VÉRIFIÉ** — index 048 + `closeCallRow` UPDATE `.is('ended_at', null)` puis release (`persistence.js:102-124`). Winner `same/loser/claimed/inactive` (`048:46-76`). |
| 7. Frontend ready-gate, timeout sans démo, winner hors redial, hangup retryable, unmount, mute | **ÉCART** — ready-gate et unmount OK ; **F-03, F-04, F-05**. |
| 8. Feature-off / dry-run : pas Telnyx, Combo inchangé | **VÉRIFIÉ** — `canPowerDialer` exige connection + webhook key (`CallManagerApp.tsx:515-517`) ; bouton Sessions seulement si true (`SessionsView.tsx:299-303`). Dry-run token `null` (`dialer.js:176-179`, test `146-156`) ; `startPool` dry-run sans insert (`pool.js:29`). Combo `useRtcCall` inchangé. |

---

## Points solides (ne pas « trouver » deux fois)

- `dialContact` ignore `connection_id` / `webhook_url` client sur le chemin pool (config serveur + `webhookUrl()`).
- Course deux humains : un `claimed`, l’autre `loser` + hangup ; hangup loser incertain → pas de `closeCallRow` (`pool.test.js:250-258`).
- Budget agent non réservé (SIP vers credential interne) ; prospects réservés 1 ¢ / slot.
- `command_id` agent stable `xos-agent-${sessionId}` (idempotence Telnyx si retry de dial).
- Masquage E.164 sur `pool_status` (`pool.js:135`).
- Feature power absente du hub Combo tant que flags/entitlement/connection/clé webhook manquent.

---

## Recommandation de lot

Corriger **F-01** et **F-02** avant tout essai live. Sans F-01 le power dialer compose des prospects AMD et n’attache jamais l’humain. Sans F-02 un 503 de clôture d’event peut jeter la conversation. F-03 à F-06 sont des dettes de vérité UI / monotonicité, pas des excuses pour shipper F-01.

AUDIT_VERDICT=REJECT findings=8 blockers=2
worker_done
