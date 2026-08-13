# Vérification r2 — Lot 11.8 (issue #68) — corrections F-01…F-08

> Agent : Cursor Grok 4.6 · Branche `feat/68-telnyx-power-dialer` · HEAD git `3ccae2f`  
> Périmètre : working tree non commité (corrections des 8 findings du round 1)  
> Méthode : relecture du **code** (pas des messages de commit) + exécution des tests.  
> **Aucun fichier applicatif modifié.** Livrable unique : ce fichier.

Round 1 : `docs/audits/lot-11.8-audit-final-grok.md` — `AUDIT_VERDICT=REJECT findings=8 blockers=2`.

---

## Tableau des findings

| ID | Round 1 | Verdict r2 | file:line | Preuve |
|---|---|---|---|---|
| F-01 | BLOQUANT | **VÉRIFIÉ** | `useDialerPool.ts:243-244` + tests `:147,:172,:231` | Lecture `call.options?.clientState ?? call.clientState`. Les 3 fixtures `btoa(...)` sont sous `options: { clientState }`. SDK 2.27.8 : `BaseCall.options: IVertoCallOptions` (`clientState` dans les options, **pas** sur l’instance). |
| F-02 | BLOQUANT | **VÉRIFIÉ** | `pool.js:376-381` + `pool.test.js:221-237` | Short-circuit `same && agent_call_control_id` **avant** le throw statut. Precheck `['connecting','active']`. Test F-02 : winner/`cc-agent-existing` jamais raccrochés, losers nettoyés, `failUpdate` non appelé. |
| F-03 | MAJEUR | **VÉRIFIÉ** | `useDialerPool.ts:313` + `:338-344` + test `:402-416` | `startDemo()` uniquement si `simulate`. Hors simulate, `dry_run` / sans `session_id` → `pool-error` « Session power refusée par le serveur… », zéro timer démo. |
| F-04 | MAJEUR | **VÉRIFIÉ** | `useDialerPool.ts:322-333` + `:352-365` + test `:272-304` | Timeout/erreur readiness : `reset` + file restaurée + lignes idle + `running=false`. Catch général borné à `!sessionIdRef.current` (ne wipe pas une session déjà démarrée). |
| F-05 | MAJEUR | **VÉRIFIÉ** | `useDialerPool.ts:33,390,395-404` + `PowerDialerView.tsx:61-68` + test `:371-398` | `hangupRetryable` remis à `false` **au début** de `hangupAll`. `stop` d’abord ; `reset` seulement après 200. CTA « Réessayer le raccrochage ». Hook : `true` après 1er **et** 2e échec. |
| F-06 | MAJEUR | **VÉRIFIÉ** | `pool.js:111-119` | UPDATE `status='failed'` inspecte `{ error: failedErr }` et `throw`. Handler `dialer.js:694-696` → 500. Plus de 200 silencieux avec session coincée en `dialing`. |
| F-07 | MINEUR | **ÉCART** | `CallManagerApp.tsx:243,588-590` vs `:2004-2018` | Le `useEffect` redirige bien `power-dialer` → `sessions` si `!canPowerDialer`. **Mais** `canPowerDialer` démarre à `false` : une URL directe entitlementée est expulsée avant le fetch config, et l’écran « Accès restreint » reste dans le JSX (flash). Pas d’élévation (le pool n’est monté que si `canPowerDialer`). |
| F-08 | INFO | **VÉRIFIÉ** | `idempotency.js:50-68` + `idempotency.test.js:60-87` | Pas de fix code exigé. Chemin prod `client.rpc` → `dialer_claim_webhook_event` couvert unitairement (claim `true` ; duplicate `processed` vs lease `pending`). |

**Compte r2 : 7 VÉRIFIÉ, 1 ÉCART (mineur), 0 MAL FAIT, 0 bloquant résiduel.**

---

## Preuves détaillées

### F-01 — VÉRIFIÉ

```243:261:src/apps/calls/modules/dialer/application/useDialerPool.ts
        const inviteState = (call as { options?: { clientState?: string }; clientState?: string }).options?.clientState
          ?? (call as { clientState?: string }).clientState;
        // ...
        if (
          (call as { direction?: string }).direction === 'inbound' &&
          inviteSessionId === sessionIdRef.current &&
          inviteKind === 'agent' &&
          !agentCallRef.current
        ) {
          agentCallRef.current = call;
          call.muteAudio?.();
          const audio = document.querySelector<HTMLAudioElement>('audio[data-rtc-agent]');
          void call.answer?.(audio ? { remoteElement: audio } : undefined);
        }
```

Contrat SDK relu (`node_modules/@telnyx/webrtc` 2.27.8) :

- `BaseCall.d.ts:19` : `options: IVertoCallOptions` ; **aucun** champ `clientState` sur l’instance.
- `IVertoCallOptions.clientState?: string` (`interfaces.d.ts:55`).

Tests (forme SDK réelle, plus de `clientState` au 1er niveau) :

```147:147:src/apps/calls/modules/dialer/application/useDialerPool.test.tsx
      options: { clientState: btoa(JSON.stringify({ poolSessionId: 'pool-1', kind: 'agent' })) },
```

Idem lignes 172 et 231 (prospect refusé). Grep `clientState` dans le test : **3 hits, tous sous `options`**.

Le fallback `?? call.clientState` ne réintroduit pas le false green : les fixtures ne l’alimentent plus.

### F-02 — VÉRIFIÉ (pas de hangup winner `active` sur retry idempotent)

Ordre réel dans `processPoolWebhook` après claim `same`/`claimed` et cleanup losers :

1. Throw seulement si `!liveSession` ou `winner_call_id !== call.id` (`pool.js:369-371`).
2. **Puis** short-circuit (`376-377`).
3. **Puis** precheck statut `['connecting','active']` (`379-381`).

Le throw « `status !== 'connecting'` » du round 1 n’existe plus. Un retry AMD avec session `active` + `agent_call_control_id` **return** `winner_already_connected` sans entrer dans le `catch` (`415-450`) qui raccroche winner/agent.

Test dédié `pool.test.js:221-237` :

- `winnerClient({ status: 'active', agentCallControlId: 'cc-agent-existing' })` + `rpc → 'same'`.
- `result === 'winner_already_connected'`.
- `hangupCall` **jamais** avec `cc-winner` ni `cc-agent-existing`.
- Losers `cc-loser-1` / `cc-loser-3` toujours raccrochés.
- `client.failUpdate.update` non appelé → session **pas** passée `failed`.

Régression adjacente : le CAS post-dial accepte toujours `['connecting','active']` (`pool.js:401,409`) ; le test « agent answered avant persist » (`pool.test.js:239-248`) ne raccroche **pas** le winner. Le hangup winner du `catch` reste limité aux échecs **après** le short-circuit (annulation CAS, dial agent raté) — ce n’est pas le scénario F-02.

### F-03 — VÉRIFIÉ

`startDemo()` n’est appelé qu’ici :

```313:313:src/apps/calls/modules/dialer/application/useDialerPool.ts
    if (simulate) { startDemo(); return; }
```

Chemin prod :

```338:344:src/apps/calls/modules/dialer/application/useDialerPool.ts
      if (started.dry_run || !started.session_id) {
        dispatch({ type: 'pool-error', error: 'Session power refusée par le serveur (dry-run actif ou session non créée).' });
        return;
      }
```

Test F-03 (`useDialerPool.test.tsx:402-416`) : `dry_run: true, session_id: null` → erreur `/Session power refusée par le serveur/`, `isRunning===false`, aucune ligne `ringing`/`connected`.

Observation (non-réouverture) : ce `return` ne fait **pas** le rollback F-04. Après `dispatch('play')` les lignes restent `dialing` et la file consommée. Le correctif demandé (erreur explicite, zéro démo) est en place ; ce n’est pas un hangup live ni un false green d’acceptation agent.

### F-04 — VÉRIFIÉ (rollback sans wipe d’une session réelle)

Timeout / `registered===false` :

```322:333:src/apps/calls/modules/dialer/application/useDialerPool.ts
        const rollbackQueue = [
          ...before.lines.filter((line) => line.phase === 'skipped' && line.destination).map((line) => line.destination),
          ...before.queue,
        ];
        stateRef.current = createPoolState(size, rollbackQueue);
        dispatch({ type: 'reset', queue: rollbackQueue });
        dispatch({ type: 'pool-error', error: 'Poste WebRTC indisponible — impossible de lancer le pool.' });
```

Catch général :

```352:365:src/apps/calls/modules/dialer/application/useDialerPool.ts
      if (!sessionIdRef.current) {
        const rollbackQueue = [ /* same reconstruction */ ];
        stateRef.current = createPoolState(size, rollbackQueue);
        dispatch({ type: 'reset', queue: rollbackQueue });
      }
      dispatch({ type: 'pool-error', error: telnyxErrorMessage(error) });
```

`createPoolState` (`PoolState.ts:33-45`) : lignes `idle`, `running: false`, file = argument. `pool-error` (`poolLogic.ts:135-136`) ne touche pas les lignes — d’où le `reset` **avant**.

Test timeout enrichi (`useDialerPool.test.tsx:299-304`) : pas de `dialing` ni `skipped`, `queue` restaurée à la destination capturée **avant** play, `isRunning===false`, zéro `pool_start`.

Invariant adjacent : si `startPowerPool` a posé `sessionIdRef` (`346`), le catch **ne** reset **pas**. Une session réellement démarrée survit à une erreur de poll/`applyServerStatus`.

### F-05 — VÉRIFIÉ

Hook :

- Expose `hangupRetryable` (`useDialerPool.ts:33,58,452`).
- `setHangupRetryable(false)` en tête de `hangupAll` (`390`) — avant l’appel réseau.
- Session présente : `dispatch('stop')` seulement (`398`) ; `reset` dans le `.then` 200 (`403-404`).
- Échec : `setHangupRetryable(true)` + `pool-error` ; `sessionIdRef` conservé (`409-413`).

UI :

```61:68:src/apps/calls/modules/dialer/PowerDialerView.tsx
          {pool.isRunning ? (
            <Button variant="danger" onClick={pool.hangupAll}>Tout raccrocher</Button>
          ) : pool.hangupRetryable ? (
            <Button
              variant="danger"
              onClick={pool.hangupAll}
              title="Le raccrochage serveur a échoué — la session est encore active côté Telnyx."
            >Réessayer le raccrochage</Button>
```

Test hook (`:371-398`) : après rejet, `hangupRetryable === true` ; 2e `hangupAll` rappelle `hangupPowerPool` avec le même `pool-1` ; `hangupRetryable` toujours `true`.

### F-06 — VÉRIFIÉ

```111:119:api/_dialer/pool.js
  if (!calls.some((call) => call.status === 'dialing')) {
    const { error: failedErr } = await client.from('dialer_pool_sessions')
      .update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', pool.id);
    if (failedErr) {
      throw new Error(`pool failure persistence failed: ${failedErr.message}`);
    }
  }
```

`pool_start` (`dialer.js:661-662`) n’avale pas l’exception : le `catch` du handler (`694-696`) renvoie 500 `internal_error`. Plus de 200 avec session `dialing` + index unique → 409. Pas de test unitaire dédié au throw (non exigé par le brief r2) ; le check `{ error }` + throw est lu dans le code.

### F-07 — ÉCART (mineur, pas bloquant)

Correctif attendu présent :

```585:590:src/apps/calls/CallManagerApp.tsx
  useEffect(() => {
    if (view === 'power-dialer' && !canPowerDialer) setView('sessions');
  }, [view, canPowerDialer]);
```

Écart concret :

1. `canPowerDialer` est initialisé à `false` (`:243`) et n’est posé à `true` qu’après `fetchDialerConfig` (`:515-517`). L’effet part donc **toujours** sur une URL directe `view=power-dialer`, y compris pour un user entitlementé. Après le fetch, `view` est déjà `sessions` : pas de restauration. Le bouton Sessions (`SessionsView.tsx:299`) reste le chemin nominal une fois le flag chargé.
2. L’écran « Accès restreint » (`:2008-2017`) n’est pas retiré ; il peut flasher une frame avant l’effet. Le pool n’est monté que si `canPowerDialer` (`:2005-2006`) — pas d’élévation.

Ce n’est pas le trou d’accès du round 1. Pas de raison de rouvrir un bloquant.

### F-08 — VÉRIFIÉ (info, pas de fix exigé)

```50:68:api/_dialer/idempotency.js
  if (signatureOk && typeof client.rpc === 'function') {
    const { data: claimed, error } = await client.rpc('dialer_claim_webhook_event', {
      p_event_id: eventId,
      p_event_type: eventType || 'unknown',
      p_payload: payload,
    });
    // claimed === true → nouveau ; sinon lookup processed/ignored vs pending (lease)
```

Unité : `idempotency.test.js:60-67` (RPC `data: true` → pas duplicate) ; `:69-87` (`processed` → duplicate terminal ; `pending` → `isProcessing`). `pool.test.js` couvre les RPC winner/answered, pas le claim webhook — hors exigence r2.

---

## Vérifications croisées (régression)

| Check | Résultat |
|---|---|
| `npx vitest run api/_dialer/pool.test.js api/dialer.test.js src/apps/calls/modules/dialer` | 8 files, **107 passed** |
| Périmètre round 1 + telnyx/config/idempotency | 9 files, **122 passed** (120 au round 1 ; + tests F-02/F-03) |
| `npm run test` | **1220 passed** / 133 files |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | **0 errors**, 36 warnings préexistants |
| `git diff --check` | clean |
| F-02 : aucun hangup winner `active` sur retry `same`+agent | voir §F-02 ; catch non atteint |
| F-04 : rollback seulement si `!sessionIdRef.current` | `useDialerPool.ts:357` |
| F-05 : reset visuel après 200 ; `hangupRetryable=false` en tête de `hangupAll` | `390` puis `403-404` |

---

## Verdict global

Les deux bloquants du round 1 sont **fermés dans le code** : le poste lit `options.clientState` (contrat SDK réel, tests alignés), et un replay AMD après `active` ne raccroche plus une conversation bridgée. F-03 à F-06 et F-08 matchent le brief de correction. Reste un **ÉCART mineur F-07** (course `canPowerDialer===false` au mount sur URL directe) : pas d’élévation, pas de hangup live, le bouton Sessions reste le chemin après chargement des flags.

Je n’ouvre pas de nouveau bloquant. Shipper F-01/F-02 est désormais défendable ; F-07 peut être un follow-up (tri-état `unknown/true/false` avant de rediriger).

AUDIT_VERDICT=APPROVE findings=1 blockers=0
worker_done
