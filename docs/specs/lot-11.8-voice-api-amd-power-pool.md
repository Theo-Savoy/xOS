# Lot 11.8 — Power pool Voice API + AMD + poste agent WebRTC

Date : 2026-08-13
Statut : implémentation

## Décision

Les legs prospect sont créés par **Telnyx Voice API / Call Control**, jamais par le SDK WebRTC du navigateur. Le navigateur reste un **poste agent WebRTC enregistré**, sans leg média prospect pendant la sonnerie ou l’analyse AMD.

Le premier résultat AMD `human` gagne. `not_sure` est traité comme humain, conformément à la recommandation Telnyx. `machine`, `fax_detected`, `silence` et les filtres explicites sont terminaux et ne sont jamais connectés à l’agent.

## Pourquoi l’ancien design est refusé

Le pool 11.5 ouvrait N appels WebRTC dans le navigateur. Cela attachait N flux distants, exposait la tonalité/early media des appels en attente et utilisait l’état `active` du SDK comme faux signal humain. Trois appels WebRTC ne fournissent pas un AMD Call Control fiable et ne permettent pas un winner-takes-all atomique entre instances Vercel.

## Flux nominal

1. L’interface n’affiche le power dialer que si `settings.dialer_enabled`, l’entitlement utilisateur et la configuration Telnyx l’autorisent. Sans activation, l’interface Combo historique est inchangée.
2. L’agent choisit 1 à 5 appels parallèles, puis clique **Play**.
3. Le navigateur obtient un JWT WebRTC et enregistre le poste. Aucun appel prospect n’est créé par le SDK.
4. `POST pool_start` valide JWT → flag → entitlement → dry-run → E.164 → caller ID → limite parallèle → budgets.
5. Le serveur crée une session et une ligne `dialer_calls` par destination, puis appelle `POST /v2/calls` avec :
   - `from` explicite ;
   - `privacy: none` ;
   - `answering_machine_detection: premium` ;
   - `client_state` contenant uniquement les identifiants techniques ;
   - `command_id` stable ;
   - webhook HTTPS stable.
6. Jusqu’au résultat AMD, le navigateur ne reçoit aucun média prospect. L’élément audio agent reste muet.
7. Le webhook signé et dédupliqué corrèle le leg via `client_state` / `call_control_id` et met à jour `dialer_calls`.
8. Sur `machine`/filtre : raccrochage du leg et clôture `voicemail`.
9. Sur `human`/`not_sure` : une RPC verrouille la session et élit atomiquement le premier gagnant. Les autres legs sont raccrochés.
10. Le serveur compose l’identité SIP de la telephony credential de l’agent avec `link_to=<winner>` et `bridge_on_answer=true`.
11. Le SDK reçoit cette unique invitation, l’accepte, puis déverrouille le son lorsque son état devient `active`.
12. À la fin du gagnant, la session passe `completed`. Aucun auto-next : l’agent relance explicitement.

## Contrats HTTP

- `POST ?resource=pool_start` — `{ destinations, parallelism, caller_number? }`
- `GET ?resource=pool_status&session_id=…` — état masqué de la session et des lignes
- `POST ?resource=pool_hangup` — session entière ou ligne précise
- `POST ?resource=pool_redial` — relance explicite de lignes terminées
- `POST ?resource=webrtc_token` — JWT + `sip_uri`, aucun budget réservé

Toutes les routes sauf le webhook exigent un JWT. Le webhook exige Ed25519 et une fenêtre anti-rejeu.

## Persistance et concurrence

`dialer_pool_sessions` porte `owner_user_id`, `parallelism`, `status`, `winner_call_id`. `dialer_calls` reçoit `pool_session_id`, `pool_slot`, les identifiants Call Control et `amd_result`.

`dialer_claim_pool_winner(session, call)` verrouille la session `FOR UPDATE`. Un seul appel peut devenir gagnant. La clôture des lignes et des réservations reste idempotente via `closeCallRow`.

## Audio

- Aucun élément audio par prospect.
- Un seul `<audio data-rtc-agent>` pour le leg agent.
- `muted=true` avant `active`; `muted=false` uniquement sur `active`.
- Pas de ringback/early media prospect côté navigateur.

## Relance et raccrochage

- **Raccrocher ligne** : Call Control `hangup`, idempotent si le leg est déjà fini.
- **Tout raccrocher** : tous les legs actifs et le leg agent, session `cancelled`.
- **Relancer** : nouvelle session et nouveaux `command_id`; aucune réutilisation d’un leg terminé.
- Après une conversation, les perdants `skipped` restent relançables, le gagnant sort du flux.

## Dry-run et feature-off

- Dry-run ne crée ni appel Telnyx ni token WebRTC réel.
- Feature-off : aucune requête Telnyx, aucun abonnement/polling, aucun rendu power additionnel dans les écrans historiques.
- L’URL directe `power-dialer` retourne à l’accueil si la feature n’est pas utilisable.

## Vérification

1. Tests transport : corps Voice API, `from`, `privacy:none`, AMD, idempotence, hangup/bridge.
2. Tests webhook : signature, déduplication, machine, humain, course de deux humains, hangup.
3. Tests frontend : parallelism 1–5, poste enregistré avant Play, audio muet avant `active`, winner coupe les autres, raccrocher, relancer.
4. Tests de non-régression : feature-off conserve l’interface Combo historique.
5. Validation live bornée : webhook non signé → 401; événement Telnyx signé observé; aucun appel réel hors destination contrôlée.
