# Revue transport audio WebRTC — HEAD `6b43c5a`

## Chemin réel aujourd’hui

- `DialerView` garde le double-clic, pose `dialing=true`, puis appelle `dialCall`; l’état retombe dès la réponse HTTP et le succès n’est qu’un JSON (`DialerView.tsx:65-70,85-118,233-237`).
- `dialCall` envoie le JWT Supabase à `POST /api/dialer?resource=dial` avec numéro, `connection_id` et webhook fournis par le navigateur (`dialerApi.ts:86-102`).
- Le routeur vérifie ce JWT (`api/dialer.js:225-249`), puis `handleDial` relit flags/entitlement, calcule le dry-run à trois niveaux et réserve 1 centime (`api/dialer.js:82-137`).
- `dialContact` fait côté serveur `POST /v2/calls` et retourne les trois IDs Telnyx (`api/dialer.js:163-194`; `api/_dialer/telnyx.js:62-103`). Cela crée une seule jambe PSTN, sans audio navigateur.
- Rien d’autre n’existe : aucune dépendance Voice SDK dans `package.json:16-44`, aucun `newCall`, aucune commande `bridge`; le webhook ne fait que persister, son routeur est un stub (`api/_dialer/webhooks.js:158-172`).

## Architecture à retenir

- Une « jonction WebRTC via gateway » automatique à cette jambe PSTN n’existe pas. Le SDK crée sa propre jambe; Telnyx demande de la parker, de créer la jambe PSTN côté backend, puis de les bridger ([architecture](https://developers.telnyx.com/docs/voice/webrtc/architecture), [outbound dialer](https://developers.telnyx.com/docs/voice/webrtc/use-cases/outbound-dialer/index)).
- Donc restructurer le flux, mais conserver `dialContact` comme création de la jambe B : (1) endpoint JWT XOS → token WebRTC, (2) SDK navigateur `newCall` → jambe A parked, (3) webhook serveur valide l’intention et réserve le budget, (4) `POST /v2/calls` jambe B, (5) `/actions/bridge` A↔B.
- La connexion SIP doit avoir **Park Outbound Calls** activé : sinon le token navigateur contourne `/resource=dial`, ses budgets et son audit. Le navigateur ne reçoit jamais la clé API Telnyx.
- Le schéma a déjà `telnyx_credential_id` par utilisateur (`supabase/migrations/042_dialer_user_entitlements.sql:10-20`), mais `loadUserEntitlements` ne le sélectionne pas (`api/_dialer/budget.js:99-114`).

## Frontière dry-run

- Le choke point actuel est `telnyxPost`: court-circuit avant son unique `fetch` Telnyx (`api/_dialer/telnyx.js:34-55`). Il ne couvre ni un nouveau `fetch /telephony_credentials/:id/token`, ni la connexion directe du SDK à `rtc.telnyx.com`.
- L’endpoint credential doit recalculer exactement `cfg || org || user` comme `handleDial`, refuser tout vrai token en dry-run et passer toute API Telnyx par l’adapter; le frontend dry-run doit utiliser un transport simulé et ne jamais instancier le SDK.
- Bug existant : l’UI oublie `config.entitlement.dry_run` dans `dryRunActive` (`DialerView.tsx:120`) alors que l’API le renvoie (`api/dialer.js:61-64`) : affichage « appel réel » possible malgré simulation serveur.

## État d’appel

- `dialingRef` est seulement un verrou pendant la requête; il ne modélise ni ringing/connected/ended, ni appel courant, durée, raccrochage, mute, média distant, permission micro, devices ou reconnexion.
- Une union `CallPhase` correcte existe mais n’est pas branchée (`domain/CallState.ts:11-46`). Ajouter un reducer piloté par les événements SDK et les webhooks serveur; `connected` exige jambe WebRTC active **et** `call.bridged`, jamais le seul HTTP 200/`call.answered`.
- Corréler A/B par intention signée et IDs Telnyx, persister les transitions idempotentes puis les pousser au client; `webhooks.js:165-166` et la route `calls` encore 501 (`api/dialer.js:252-257`) sont les trous actuels.

## Sécurité des credentials

- Même `verifyJWT` Supabase, puis entitlement actif; le serveur choisit credential, connection, caller ID et destination depuis ses données — aucun ID privilégié accepté du body. Ajouter rate-limit, `Cache-Control: no-store`, audit sans token, et révocation à la fermeture de session.
- Le JWT Telnyx dure 24 h ou jusqu’à expiration du credential parent ([auth JWT](https://developers.telnyx.com/docs/voice/webrtc/auth/jwt)); pour un TTL réellement court, créer/renouveler un credential parent avec `expires_at` ([API credential](https://developers.telnyx.com/api-reference/credentials/create-a-credential)). Le token est rejouable jusqu’à expiration : mémoire seulement, CSP/XSS stricte, jamais localStorage/log.
- Un token volé authentifie le SDK et hérite de la connexion SIP : sans parking il peut appeler et coûter. Avec parking, whitelist OVP, spend limit Telnyx et validation serveur de chaque intention, il ne peut pas atteindre seul le PSTN (mais peut encore abuser de jambes WebRTC).

## Budget

- `estimatedCostCents: 1` est consommé dès la création (`api/dialer.js:124-129,181-190`), sans durée ni réconciliation; une conversation de 5 min n’est donc pas bornée à 1 centime.
- Telnyx facture la jambe WebRTC $0,002/min, séparément de la jambe voix et des options ([coûts WebRTC](https://developers.telnyx.com/docs/voice/webrtc/sdk-commonalities)). Réserver `durée_max × (tarif WebRTC + PSTN + AMD/options)`, imposer un hangup serveur à la durée max, puis solder sur CDR/coût réel.

## Top 3 gotchas / verdict

1. **Deux jambes obligatoires** : sans park + bridge, le prospect décroche face au silence; le REST actuel n’est pas un transport audio.
2. **Le token est une voie de dépense parallèle** : triple gate dry-run + parking + TTL/révocation doivent précéder le SDK, sinon les caps XOS sont contournables.
3. **Ni cycle de vie ni budget/minute** : un HTTP 200 n’est pas « connected » et la réservation fixe ne borne aucun appel long.

**Verdict :** architecture serveur-dial + « join » telle quelle, non. Adopter le pattern Telnyx hybride browser-first parked + backend Call Control/bridge : restructuration du flux, réemploi de `dialContact`, budgets et audit côté serveur.
