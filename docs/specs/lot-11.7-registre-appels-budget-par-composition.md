# Lot 11.7 — Registre d'appels & budget par composition (dialer power)

**Date** : 2026-08-09 · **Base** : `1605855` · **Périmètre** :
`supabase/migrations/045_*`, `api/dialer.js`, `api/_dialer/persistence.js`,
`src/apps/calls/modules/dialer/{dialerApi.ts, application/useRtcCall.ts, application/useDialerPool.ts}`.

## Le trou que ce lot ferme

Avant 11.7, le transport WebRTC fonctionnait mais **aucun appel ne laissait
de trace en base** : `webrtc_token` réservait du budget sans jamais écrire de
ligne `dialer_calls`, et le registre créé par la migration 038 restait
orphelin (la migration 044 elle-même le constatait). Un appel power pouvait
passer sans persistance — impossible de réconcilier budget, historique ou
reporting.

## Changements de contrat

| Avant | Après |
| --- | --- |
| `webrtc_token` réserve le budget | `webrtc_token` n'émet qu'un token (un token couvre une session de plusieurs compositions) |
| Pas de trace d'appel | **`POST call_started`** : budget réservé + ligne `dialer_calls` 'dialing' **par composition**, AVANT `newCall` |
| Pas de clôture | **`POST call_ended`** : clôture idempotente, budget consommé si décroché (`answered=true`), libéré sinon |
| Pas d'historique | **`GET calls`** : historique user, numéros masqués (`maskE164`) |

Gate order `call_started` : JWT → flags.enabled (routeur) → rate → E.164 →
entitlement → dry-run (réponse explicite `call_record_id: null`, pas de ligne
fantôme) → caller_number (B7) → budget atomique → registre → audit (hash
FNV-1a du numéro, jamais d'E.164 en clair — S11).

**Fail-loud** : refus budget OU échec d'insert ⇒ le client reçoit 429/500 et
NE COMPOSE PAS. Une composition réelle sans trace ni budget est rendue
impossible par construction.

## Migration 045 — pivot power

`045_dialer_calls_power_pivot.sql` supersede l'intention de 044 (jamais
appliquée) : l'index « 1 appel actif par user » et la contrainte
`parallelism=1` étaient caduques depuis la décision power dialing 3 lignes
(2026-08-04). Ajouts : `campaign_id` nullable (appel en flux depuis le Runner
sans campagne), `owner_user_id` + `reservation_id` sur `dialer_calls` (le lien
ligne ↔ budget permet à `call_ended` de consommer/libérer la bonne
réservation sans table de liaison).

## Clôture : qui consomme, qui libère

- `answered=true` (décroché) ⇒ `dialer_release_reservation(p_result='consumed')`
- sinon (no_answer, voicemail, busy, failed, ended sans connexion) ⇒ `p_result='released'`
- Idempotence : la recherche porte `.is('ended_at', null)` + `owner_user_id` ;
  une ligne déjà close ou appartenant à un autre user ⇒ `closed:false`, aucun
  effet de bord. La réconciliation webhooks (lot 11.8) rattrapera les onglets
  morts avant clôture.

## Frontend

- `dialerApi.ts` : `notifyCallStarted` / `notifyCallEnded` / `fetchUserCalls` /
  `callBlockedMessage` (messages budget FR).
- `useDialerPool` : registre ouvert dans `dialSlot` AVANT `newCall` (un refus
  bloque la ligne sans composer), clos sur notification 'ended', `skip`,
  `hangupAll` et démontage.
- `useRtcCall` : même contrat mono-ligne sur tous les chemins de sortie
  (ended, hangup, socket.close, telnyx.error, connect raté, timeout 20 s,
  démontage, startCall suivant qui purge l'appel précédent).
- Dry-run inchangé (G2) : token null ⇒ client null ⇒ simulation sans réseau,
  le registre n'est jamais ouvert.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| `npm run test` | **1168 tests / 131 fichiers — verts** (+13 tests : 9 routeur 11.7, 1 contrat webrtc_token déplacé, mocks frontend) |
| `tsc --noEmit` | 0 erreur |
| `npm run build` | OK |
| `npm run lint` | 0 erreur (warnings pré-existants hors dialer) |

La dette R2 de l'audit 11.14 (« api/dialer.js sans aucun test alors qu'il
porte les gates budget/entitlement ») est close : le routeur a désormais 28
tests, dont le verrouillage du nouveau contrat budget-par-composition et de
l'absence de l'ancien.

## Suites

- **11.8** (bloqué prérequis Telnyx payant) : AMD premium + webhooks +
  réconciliation des lignes orphelines.
- Le timeout non-réponse 20 s du pool reste le placeholder des lots 11.5/11.6,
  remplacé par l'AMD en 11.8.
