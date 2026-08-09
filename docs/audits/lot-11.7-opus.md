# Audit lot 11.7 — registre `dialer_calls` + budget par composition (Opus)

**Commit** : `3a416ee` (parent `1605855`) · **Diff** : `git diff 1605855..3a416ee`
(11 fichiers, +1079/−76) · **Mode** : lecture seule.

**Vérifs exécutées** : `npx tsc --noEmit` (0 erreur) · `npx vitest run api/dialer.test.js`
(28/28) · `npx vitest run useRtcCall.test.tsx useDialerPool.test.tsx` (8/8).

## Verdict synthétique

Le cœur serveur est solide : schéma cohérent, fail-loud du budget correct sur
`call_started`, idempotence séquentielle de `call_ended` réelle, pas de fuite
E.164 côté serveur. **Mais un chemin de sortie documenté comme couvert laisse
une ligne `dialing` orpheline avec budget réservé** (F1), et la couverture de
test frontend de la clôture est un faux-vert intégral (F2) — c'est précisément
ce qui a laissé passer F1. Je **rejette** : l'invariant « aucun orphelin avec
budget réservé » (thèse §7 et spec) est violé sur le hook mono-ligne en
production.

---

## F1 — BLOCKER · `useRtcCall` : démontage → ligne `dialing` orpheline + budget réservé

`src/apps/calls/modules/dialer/application/useRtcCall.ts:178-186`

Le cleanup de démontage n'appelle PAS `endCallRecord` :

```js
useEffect(() => {
  return () => {
    clearDialTimeout();
    clearSimTimers();
    stopTimer();
    dropClient();      // ← pas de endCallRecord()
  };
}, [...]);
```

`dropClient` (l.169-176) vide `clientRef.current` **avant** `safeDisconnect`.
Le SDK émet alors `telnyx.socket.close`, mais le handler est enveloppé dans
`onLive` (l.219-223) qui teste `clientRef.current === client` — désormais faux
→ le handler `socket.close` (qui appellerait `endCallRecord('failed')`) est
**neutralisé**. Aucun autre chemin ne clôt le registre au démontage.

**Scénario d'échec** : appel réel en cours (`call_record_id` ouvert, budget
réservé) → l'utilisateur quitte l'app Calls (route SPA qui démonte
`CallManagerApp` → `DialerProvider` → `useRtcCall`, cf. `DialerProvider.tsx:27`).
Cleanup exécuté : socket fermé, mais `notifyCallEnded` **jamais** émis. La ligne
reste `status='dialing'`, `ended_at IS NULL`, `reservation_id` non libérée.
Résultat : ligne fantôme + réservation budget mangée jusqu'à la réconciliation
webhooks (lot 11.8, non livré ici).

**Preuve de la contradiction** : le pool fait exactement l'inverse —
`useDialerPool.ts:413-430` clôt chaque `recordId` non nul dans son cleanup. La
spec (`docs/specs/lot-11.7-…md`, l.60-62) liste explicitement « **démontage** »
parmi les chemins de sortie couverts de `useRtcCall`. Il ne l'est pas.

**Correctif attendu** : ajouter `endCallRecord('ended')` (ou `'failed'`) dans le
cleanup de démontage de `useRtcCall`, symétrique au pool.

---

## F2 — MAJEUR (faux-vert) · La clôture frontend (§V4) n'est vérifiée par aucun test

`useRtcCall.test.tsx` · `useDialerPool.test.tsx`

`mockNotifyCallEnded` est câblé (`vi.fn()`) et son défaut `mockResolvedValue(true)`
posé, **mais jamais asservi à une assertion** dans aucun des deux fichiers
(`grep notifyCallEnded|toHaveBeenCalled` → 0 assertion sur `mockNotifyCallEnded`).
Les tests passent que la production clôture le registre ou non, sur **tous** les
chemins revendiqués (ended, hangup, socket.close, error, connect raté, timeout
20 s, démontage, startCall suivant). Le mock encode un contrat que rien ne
vérifie être émis — pattern faux-vert exact. C'est ce qui a masqué F1 : un test
`expect(mockNotifyCallEnded).toHaveBeenCalled()` après `unmount()` du mono-ligne
aurait échoué et attrapé F1 avant le commit.

Les modifs de test du lot se limitent au câblage des mocks et au passage de
`act(...)` en `act(async ...)` (flush microtâches) — **aucun nouveau cas** ne
verrouille un chemin de clôture.

---

## F3 — MINEUR (latent) · `closeCallRow` libère sur le SELECT, pas sur les lignes réellement mises à jour

`api/_dialer/persistence.js:75-106`

L'idempotence séquentielle est réelle et testée (lookup `.is('ended_at', null)`
+ `owner_user_id` → `closed:false` quand déjà close ou autre user :
`dialer.test.js:472-490`). En revanche `dialer_release_reservation` (l.97-105)
est déclenchée sur le résultat du **lookup**, jamais sur le nombre de lignes
effectivement modifiées par l'`UPDATE ... .is('ended_at', null)` (l.85-94, dont
l'`error` est vérifiée mais pas le `count`).

**Scénario** : deux clôtures concurrentes de la MÊME ligne (client +
réconciliation webhook du lot 11.8) — les deux lisent `ended_at IS NULL`, l'une
gagne l'UPDATE, l'autre le rate silencieusement (0 ligne, pas d'erreur), mais
**les deux appellent `release`** → double consommation/libération. L'idempotence
finale repose donc entièrement sur l'idempotence de la RPC distante
`dialer_release_reservation` (schéma remote 041/042, **non vérifiable ici**).

Non atteignable aujourd'hui (le client met `call_record_id` à `null` de façon
synchrone avant toute notif → pas de double clôture depuis un même onglet ;
aucun second closeur avant 11.8). **À fermer avant que 11.8 ne branche le
réconciliateur** : garder le release sur les lignes réellement affectées par
l'UPDATE (ou garantir l'idempotence RPC).

---

## F4 — MINEUR · `maskE164` révèle intégralement les entrées de longueur 4–6

`api/_dialer/persistence.js:22-25`

`slice(0, 6)` renvoie la chaîne **entière** pour toute entrée de longueur ≤ 6 ;
le plancher `length < 4 → '****'` est trop bas. Ex. `maskE164('+3312')` →
`'+3312****12'` (numéro complet + suffixe). Non atteignable via le registre :
`to_number` passe toujours la validation E.164 de `call_started`
(`/^\+[1-9]\d{6,14}$/`, ≥ 9 caractères) avant l'insert, donc aucune fuite en
production. Mais la fonction exportée est fragile hors de ce garde-fou —
relever le plancher à ~9 ou masquer par longueur.

---

## F5 — INFO · Migration 045 : FK vers une table sans migration committée

`supabase/migrations/045_*.sql:37-39`

`reservation_id … references public.dialer_budget_reservations(id)` : cette
table n'a **aucun fichier de migration committé** (remote 041/042 appliqués à la
main, cf. `budget.js:11-13`). Un `supabase db reset` from-scratch casse à 045.
Conforme à la convention « migrations Supabase manuelles » du projet
(non-régression), mais la reproductibilité locale du schéma reste cassée. Par
ailleurs 045 est **non destructif** rejoué après 044 (`add column if not exists`,
`drop index/constraint if exists`, `set default`) — OK.

---

## F6 — INFO · `handleDial` (resource=dial) n'écrit pas de ligne registre

`api/dialer.js:445-580` — Hors contrat registre par conception (le commentaire
`dialerApi.ts:11-14` acte que `dial` n'a aucun appelant en production). Pas
d'orphelin : `dial` réserve **et** consomme/libère sa réservation dans la même
requête (l.552 / l.569). Intentionnel, pas un défaut.

---

## F7 — INFO · Commentaire obsolète `DialerProvider.tsx:8-9`

Cite « la garantie base (index 044, 1 appel actif par user) complète celle-ci
côté serveur » — or 045 **supprime** `dialer_calls_one_active_per_user`. La
garantie serveur invoquée n'existe plus (choix produit power dialing assumé),
le commentaire est trompeur. Doc à corriger.

---

## Checklist du brief

| # | Vérif | Résultat |
| - | --- | --- |
| 1 | Cohérence schéma ↔ code | ✅ colonnes écrites (`campaign_id, contact_id, owner_user_id, reservation_id, to_number, status, started_at` ; update `status, ended_at, duration_sec, hangup_cause`) toutes présentes (038 + 044/045). Statuts terminaux ⊂ check 038. |
| 2 | Idempotence `call_ended` | ⚠️ séquentielle réelle et testée ; **F3** sur le release en concurrence. |
| 3 | Fail-loud budget | ✅ `call_started` : refus budget → 429 sans insert ; insert raté → release + 500 (testé l.367-393). `dial` hors scope registre (**F6**). |
| 4 | Clôture frontend exhaustive | ❌ **F1** (démontage mono-ligne) + **F2** (non testée). |
| 5 | Fuite E.164 | ✅ serveur : audit = hash FNV-1a, `call_started` ne renvoie que l'id, `calls` masqué. **F4** sur `maskE164` hors chemin registre. |
| 6 | Migration 045 sûre | ⚠️ non destructive rejouée après 044 ; **F5** sur la FK/replay. |
| 7 | Tests non faux-verts | ❌ **F2** ; côté routeur les mocks (`makeChain`, thenable `{data,error}`) reflètent supabase-js correctement. |
| 8 | Rate limiter | ⚠️ `__testRateLimiter` exporté = dette test assumée (commentée l.48-50). Bucket in-memory par instance, clé `user:<id>` : pas de fuite inter-users (chaque user son bucket), mais non partagé multi-instance (noté l.44-46). Acceptable. |

## Blockers

- **F1** : orphelin `dialing` + budget réservé au démontage de `useRtcCall`
  (chemin production, revendiqué couvert par la spec). Correctif : une ligne
  (`endCallRecord` dans le cleanup), symétrique au pool. F2 doit accompagner le
  correctif (assertion `notifyCallEnded` sur les chemins de sortie).

AUDIT_VERDICT=REJECT findings=7 blockers=1
