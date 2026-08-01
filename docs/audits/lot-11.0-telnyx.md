# Lot 11.0 — Audit Telnyx Call Control API

> **Statut** : ✅ Terminé
> **Date** : 2026-07-23
> **Source** : SDK `telnyx` npm (Stainless-generated), OpenAPI spec Telnyx v2

---

## 1. Architecture générale

Telnyx Call Control = API REST stateless. Chaque appel est une ressource identifiée par `call_control_id`. Les commandes (dial, bridge, hangup, record) sont des POST sur `/calls/{id}/actions/*`. Les événements arrivent par webhook HTTP POST sur l'URL configurée.

**SDK recommandé** : `npm install telnyx` (TypeScript natif, auto-retry, pagination). Alternative : REST direct via `fetch` — les endpoints sont stables et documentés.

**Décision** : REST direct via `fetch` dans `api/_dialer/telnyx.js` — le SDK ajoute 200KB de dépendances pour des endpoints qu'on n'utilise pas. Les 5 endpoints critiques sont simples.

---

## 2. Flow de dial parallèle (Power Dialer)

### 2.1 POST /calls — Dial

```
POST https://api.telnyx.com/v2/calls
Authorization: Bearer ***
Content-Type: application/json
```

**Paramètres critiques** :

| Champ                         | Type                 | Requis | Description                                                                              |
| ----------------------------- | -------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `connection_id`               | string               | ✅     | ID de la Call Control App (ex-connection)                                                |
| `from`                        | string               | ✅     | Numéro caller ID en +E164 (doit être un numéro Telnyx du compte)                         |
| `to`                          | string \| string[]   | ✅     | Numéro destination +E164 ou SIP URI                                                      |
| `webhook_url`                 | string               | ❌     | Override l'URL webhook pour CET appel                                                    |
| `webhook_url_method`          | `POST` \| `GET`      | ❌     | Méthode HTTP du webhook (défaut POST)                                                    |
| `client_state`                | string               | ❌     | **Base64-encoded** — état custom renvoyé dans chaque webhook                             |
| `command_id`                  | string               | ❌     | Idempotence — Telnyx ignore les doublons                                                 |
| `answering_machine_detection` | enum                 | ❌     | `premium` \| `detect` \| `detect_beep` \| `detect_words` \| `greeting_end` \| `disabled` |
| `record`                      | `record-from-answer` | ❌     | Démarre l'enregistrement auto à la réponse                                               |
| `record_channels`             | `single` \| `dual`   | ❌     | Mono ou stéréo (défaut single)                                                           |
| `record_format`               | `wav` \| `mp3`       | ❌     | Format du fichier                                                                        |
| `timeout_secs`                | number               | ❌     | Timeout avant abandon (défaut ~60s)                                                      |
| `sip_region`                  | enum                 | ❌     | `US` \| `Europe` \| `Canada` \| `Australia` \| `Middle East`                             |
| `from_display_name`           | string               | ❌     | Nom affiché (max 128 chars)                                                              |
| `webhook_retries_policies`    | object               | ❌     | Politique de retry webhook custom                                                        |

**Réponse** :

```json
{
  "data": {
    "call_control_id": "AgDIxmoRX6QMuaIj_uXRXnPAXP0QlNfXczRrZvZakpWxBlpw48KyZQ==",
    "call_leg_id": "428c31b6-7af4-4bcb-b7f5-5013ef9657c1",
    "call_session_id": "428c31b6-abf3-3bc1-b7f4-5013ef9657c1",
    "is_alive": true,
    "recording_id": "rec_..." // si record=record-from-answer
  }
}
```

### 2.2 Code — Dial parallèle N contacts

```js
// api/_dialer/telnyx.js
const TELNYX_API = 'https://api.telnyx.com/v2';

async function telnyxPost(path, body, apiKey) {
  const res = await fetch(`${TELNYX_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new TelnyxError(res.status, err?.errors?.[0] || err);
  }
  return res.json();
}

/**
 * Dial un contact. Retourne { call_control_id, call_leg_id }.
 * client_state = base64(JSON({ sessionId, contactId, userId }))
 */
async function dialContact({
  apiKey,
  connectionId,
  from,
  to,
  webhookUrl,
  clientState,
  amd = 'premium',
}) {
  const { data } = await telnyxPost(
    '/calls',
    {
      connection_id: connectionId,
      from,
      to,
      webhook_url: webhookUrl,
      webhook_url_method: 'POST',
      client_state: Buffer.from(JSON.stringify(clientState)).toString('base64'),
      answering_machine_detection: amd,
      sip_region: 'Europe',
      timeout_secs: 30,
    },
    apiKey,
  );
  return {
    callControlId: data.call_control_id,
    callLegId: data.call_leg_id,
    callSessionId: data.call_session_id,
  };
}

/**
 * Dial N contacts en parallèle. Retourne Map<contactId, dialResult>.
 */
async function dialParallel({
  apiKey,
  connectionId,
  from,
  contacts,
  webhookUrl,
  sessionId,
  userId,
}) {
  const results = new Map();
  const promises = contacts.map(async (contact) => {
    try {
      const result = await dialContact({
        apiKey,
        connectionId,
        from,
        to: contact.phone,
        webhookUrl,
        clientState: { sessionId, contactId: contact.id, userId },
      });
      results.set(contact.id, { ...result, contact, status: 'dialing' });
    } catch (err) {
      results.set(contact.id, {
        contact,
        status: 'dial_failed',
        error: err.message,
      });
    }
  });
  await Promise.allSettled(promises);
  return results;
}
```

### 2.3 client_state — le mécanisme clé

`client_state` est un string **Base64** que Telnyx renvoie dans **chaque** webhook de l'appel. C'est le mécanisme pour corréler les webhooks avec notre état applicatif sans lookup DB.

```js
// Encoder
const clientState = Buffer.from(
  JSON.stringify({
    sessionId: 'sess_abc123',
    contactId: 'contact_xyz',
    userId: 'user_001',
    batchIndex: 2,
  }),
).toString('base64');

// Décoder dans le webhook handler
function decodeClientState(b64) {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
```

---

## 3. Webhook Events — Payloads détaillés

Tous les webhooks ont la même enveloppe :

```json
{
  "id": "evt_...",
  "event_type": "call.answered",
  "occurred_at": "2026-07-23T10:30:00.000Z",
  "record_type": "event",
  "payload": { ... }
}
```

### 3.1 call.initiated

Premier webhook. Confirm que le dial a été accepté.

```json
{
  "event_type": "call.initiated",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "direction": "outgoing",
    "from": "+33123456789",
    "to": "+33987654321",
    "caller_id_name": "XOS Déchet",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "state": "dialing",
    "connection_codecs": "PCMU,PCMA",
    "custom_headers": []
  }
}
```

### 3.2 call.answered

Le prospect a décroché. **C'est le trigger pour le bridge.**

```json
{
  "event_type": "call.answered",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "from": "+33123456789",
    "to": "+33987654321",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "state": "answered",
    "start_time": "2026-07-23T10:30:05.000Z",
    "tags": [],
    "custom_headers": [],
    "sip_headers": []
  }
}
```

### 3.3 call.hangup

Fin d'appel. `hangup_cause` est critique pour le routing.

```json
{
  "event_type": "call.hangup",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "from": "+33123456789",
    "to": "+33987654321",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "state": "hangup",
    "start_time": "2026-07-23T10:30:05.000Z",
    "hangup_cause": "normal_clearing",
    "hangup_source": "callee",
    "sip_hangup_cause": "200",
    "tags": []
  }
}
```

**Valeurs de `hangup_cause`** :

| Cause               | Signification            | Action Power Dialer       |
| ------------------- | ------------------------ | ------------------------- |
| `normal_clearing`   | Raccrochage normal       | Logger durée              |
| `no_answer`         | Pas de réponse (timeout) | Marquer no-answer, next   |
| `user_busy`         | Occupé                   | Marquer busy, retry later |
| `call_rejected`     | Rejeté                   | Marquer rejected          |
| `originator_cancel` | Annulé par nous          | Ignorer                   |
| `timeout`           | Timeout réseau           | Marquer failed            |
| `not_found`         | Numéro inexistant        | Marquer invalid           |
| `time_limit`        | Limite de durée atteinte | Logger                    |
| `unspecified`       | Autre                    | Logger                    |

### 3.4 call.machine.detection.ended (Standard AMD)

```json
{
  "event_type": "call.machine.detection.ended",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "from": "+33123456789",
    "to": "+33987654321",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "result": "human"
  }
}
```

**`result`** : `human` | `machine` | `not_sure`

### 3.5 call.machine.premium.detection.ended (Premium AMD)

```json
{
  "event_type": "call.machine.premium.detection.ended",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "from": "+33123456789",
    "to": "+33987654321",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "result": "human_business"
  }
}
```

**`result`** : `human_residence` | `human_business` | `machine` | `silence` | `fax_detected` | `not_sure`

> **Note FR** : Premium AMD est plus fiable pour les messageries françaises. `human_business` vs `human_residence` permet de filtrer les pros vs particuliers.

### 3.6 call.machine.greeting.ended / call.machine.premium.greeting.ended

Envoyé quand le beep de la messagerie est détecté. Utile pour laisser un message.

### 3.7 call.bridged

```json
{
  "event_type": "call.bridged",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "from": "+33123456789",
    "to": "+33987654321",
    "client_state": "eyJzZXNzaW9uSWQi..."
  }
}
```

### 3.8 call.recording.saved

```json
{
  "event_type": "call.recording.saved",
  "payload": {
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "channels": "dual",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "recording_started_at": "2026-07-23T10:30:05.000Z",
    "recording_ended_at": "2026-07-23T10:35:12.000Z",
    "recording_urls": {
      "wav": "https://telnyx-recordings.s3.amazonaws.com/...?expires=...",
      "mp3": "https://telnyx-recordings.s3.amazonaws.com/...?expires=..."
    },
    "public_recording_urls": { "wav": null, "mp3": null }
  }
}
```

> ⚠️ **Les URLs `recording_urls` expirent après 10 minutes.** Il faut télécharger le fichier immédiatement dans le webhook handler et le stocker dans Supabase Storage. `public_recording_urls` nécessite activation par le support Telnyx.

### 3.9 call.recording.transcription.saved

```json
{
  "event_type": "call.recording.transcription.saved",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "recording_id": "rec_...",
    "recording_transcription_id": "tr_...",
    "status": "completed",
    "transcription_text": "Bonjour, c'est Jean de la société..."
  }
}
```

### 3.10 call.conversation_insights.generated (AI Insights)

```json
{
  "event_type": "call.conversation_insights.generated",
  "payload": {
    "call_control_id": "AgDI...",
    "call_leg_id": "428c...",
    "call_session_id": "428c...",
    "connection_id": "7267...",
    "client_state": "eyJzZXNzaW9uSWQi...",
    "insight_group_id": "ig_...",
    "results": [
      {
        "insight_id": "ins_...",
        "result": { "summary": "...", "sentiment": "positive" }
      }
    ]
  }
}
```

---

## 4. Bridge Mechanics — Connecter le commercial

### 4.1 POST /calls/{call_control_id}/actions/bridge

```
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/bridge
```

**Paramètres** :

| Champ                    | Type                                     | Description                                     |
| ------------------------ | ---------------------------------------- | ----------------------------------------------- |
| `call_control_id` (body) | string                                   | **Le call_control_id du commercial** (2e appel) |
| `client_state`           | string                                   | Base64 state                                    |
| `play_ringtone`          | bool                                     | Jouer une sonnerie au prospect en attendant     |
| `record`                 | `record-from-answer`                     | Démarrer l'enregistrement au bridge             |
| `record_channels`        | `single` \| `dual`                       | Canaux d'enregistrement                         |
| `record_format`          | `wav` \| `mp3`                           | Format                                          |
| `hold_after_unbridge`    | bool                                     | Mettre en attente au lieu de raccrocher         |
| `park_after_unbridge`    | `self`                                   | Parker l'appel au lieu de raccrocher            |
| `prevent_double_bridge`  | bool                                     | Empêcher le double bridge                       |
| `mute_dtmf`              | `none` \| `both` \| `self` \| `opposite` | Bloquer les DTMF                                |

### 4.2 Stratégie A — PSTN Callback (recommandé pour terrain)

Le plus simple : on appelle le commercial sur son téléphone, puis on bridge les deux appels.

```js
async function bridgeToRepPSTN({
  apiKey,
  prospectCallControlId,
  connectionId,
  repPhone,
  webhookUrl,
  clientState,
}) {
  // 1. Dial le commercial
  const { data: repCall } = await telnyxPost(
    '/calls',
    {
      connection_id: connectionId,
      from: prospectFrom, // même caller ID
      to: repPhone,
      webhook_url: webhookUrl,
      client_state: Buffer.from(
        JSON.stringify({ ...clientState, leg: 'rep' }),
      ).toString('base64'),
    },
    apiKey,
  );

  // 2. Attendre call.answered du commercial (via webhook)
  //    → dans le webhook handler, quand on reçoit call.answered pour leg=rep :

  // 3. Bridge les deux appels
  await telnyxPost(
    `/calls/${prospectCallControlId}/actions/bridge`,
    {
      call_control_id: repCall.call_control_id,
      play_ringtone: true,
      record: 'record-from-answer',
      record_channels: 'dual',
      record_format: 'mp3',
    },
    apiKey,
  );
}
```

**Flow complet** :

1. `dial(prospect)` → `call.initiated` → `call.answered` (prospect décroche)
2. AMD confirme `human` → `dial(rep)` → `call.answered` (commercial décroche)
3. `bridge(prospect, rep)` → `call.bridged` → conversation
4. `call.hangup` → `call.recording.saved` → `call.recording.transcription.saved`

### 4.3 Stratégie B — WebRTC (SIP.js dans le navigateur)

Pour un commercial 100% laptop. Nécessite une connexion SIP (WebRTC) dans Telnyx.

```js
// Frontend — SIP.js
import { UserAgent } from 'sip.js';

const userAgent = new UserAgent({
  uri: UserAgent.makeURI('sip:rep_username@sip.telnyx.com'),
  transportOptions: {
    server: 'wss://sip.telnyx.com:7443',
  },
  authorizationUsername: 'rep_username',
  authorizationPassword: '***',
  displayName: 'Commercial XOS',
});

await userAgent.start();

// Quand le backend notifie (via WebSocket/SSE) qu'un prospect est en ligne :
// Le commercial reçoit un appel SIP entrant de Telnyx
// SIP.js gère l'acceptation automatique ou manuelle
```

**Backend** : Au lieu de `dial(repPhone)`, on fait `dial('sip:rep_username@sip.telnyx.com')`.

> **Décision recommandée** : PSTN callback pour la V1 (zéro config côté commercial, marche sur mobile). WebRTC en V2 si l'équipe est sédentaire.

### 4.4 Stratégie C — bridge_on_answer (dial direct avec link_to)

Telnyx supporte le bridge automatique au dial :

```js
// Dial le prospect avec bridge_intent vers l'appel du commercial
await telnyxPost(
  '/calls',
  {
    connection_id: connectionId,
    from,
    to: prospectPhone,
    bridge_on_answer: true,
    link_to: repCallControlId, // l'appel du commercial doit exister
    webhook_url: webhookUrl,
  },
  apiKey,
);
```

> ⚠️ `link_to` requiert que l'appel du commercial existe déjà. Moins flexible que le bridge manuel.

---

## 5. Recording + Transcription Pipeline

### 5.1 Démarrer l'enregistrement

**Option A — Au dial** (recommandé pour le power dialer) :

```js
await telnyxPost(
  '/calls',
  {
    connection_id: connectionId,
    from,
    to: prospectPhone,
    record: 'record-from-answer',
    record_channels: 'dual', // stéréo : canal A = prospect, canal B = commercial
    record_format: 'mp3',
    record_max_length: 3600, // 1h max
  },
  apiKey,
);
```

**Option B — Après le bridge** (enregistrement manuel) :

```js
// POST /calls/{call_control_id}/actions/record_start
await telnyxPost(
  `/calls/${callControlId}/actions/record_start`,
  {
    channels: 'dual',
    format: 'mp3',
    transcription: true, // ← transcription post-call intégrée
    transcription_engine: 'B', // B = Telnyx (supporte FR)
    transcription_language: 'fr', // Français
    play_beep: false, // pas de beep (B2B, pas légalement requis en FR pro)
    max_length: 3600,
  },
  apiKey,
);
```

### 5.2 Transcription post-call

La transcription est déclenchée via `transcription: true` dans `record_start` ou `record_stop`. Le résultat arrive par webhook `call.recording.transcription.saved`.

**Engines disponibles** :

| Engine          | Code              | FR support   | Qualité FR |
| --------------- | ----------------- | ------------ | ---------- |
| Google          | `A`               | ✅           | Bonne      |
| Telnyx          | `B`               | ✅           | Bonne      |
| Deepgram Nova-3 | `deepgram/nova-3` | ❌ (en only) | N/A        |

> **Décision** : Engine `B` (Telnyx) avec `transcription_language: 'fr'`. Si qualité insuffisante, fallback Deepgram via leur API directe (pas via Telnyx).

### 5.3 Télécharger l'enregistrement

```js
// Dans le webhook handler pour call.recording.saved
async function handleRecordingSaved(payload) {
  const { recording_urls, call_leg_id, client_state } = payload;
  const state = decodeClientState(client_state);

  // ⚠️ Les URLs expirent en 10 minutes !
  const mp3Url = recording_urls?.mp3;
  if (!mp3Url) return;

  // Télécharger
  const response = await fetch(mp3Url);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Stocker dans Supabase Storage
  const path = `recordings/${state.sessionId}/${call_leg_id}.mp3`;
  await supabase.storage.from('call-recordings').upload(path, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  });

  // Mettre à jour la DB
  await supabase.from('call_recordings').upsert({
    call_leg_id,
    session_id: state.sessionId,
    contact_id: state.contactId,
    storage_path: path,
    duration_secs: computeDuration(
      payload.recording_started_at,
      payload.recording_ended_at,
    ),
    format: 'mp3',
    channels: payload.channels,
  });
}
```

### 5.4 AI Summarize

Telnyx n'a **pas** d'endpoint "summarize" dédié dans Call Control. Deux options :

1. **Telnyx AI Assistants** (`call.conversation_insights.generated`) — insights auto si un AI Assistant est configuré sur la connexion. Pas adapté au power dialer humain.

2. **LLM externe** (recommandé) — endpoint Vercel dédié :

```js
// api/_dialer/summarize.js
async function summarizeCall(transcriptionText, contactContext) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        {
          role: 'user',
          content: `Contact: ${contactContext}\n\nTranscription:\n${transcriptionText}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  return response.json();
}

const SUMMARIZE_PROMPT = `Tu es un assistant commercial. Analyse la transcription d'un appel B2B et retourne un JSON :
{
  "summary": "résumé en 2-3 phrases",
  "sentiment": "positive|neutral|negative",
  "next_steps": ["action 1", "action 2"],
  "meddic": {
    "metrics": "...",
    "economic_buyer": "...",
    "decision_criteria": "...",
    "decision_process": "...",
    "identify_pain": "...",
    "champion": "..."
  },
  "appointment_detected": true/false,
  "appointment_date": "YYYY-MM-DD ou null",
  "outcome": "connected|voicemail|no_answer|rejected|wrong_number"
}`;
```

---

## 6. Number Management

### 6.1 Acheter un numéro FR

```js
// 1. Chercher des numéros disponibles
const available = await telnyxGet(
  '/available_phone_numbers',
  {
    filter: {
      country_code: 'FR',
      number_type: 'local',
      limit: 10,
    },
  },
  apiKey,
);

// 2. Commander
const order = await telnyxPost(
  '/number_orders',
  {
    phone_numbers: [{ phone_number: '+33123456789' }],
    billing_group_id: 'bg_...',
  },
  apiKey,
);
```

### 6.2 Configurer le caller ID par campagne

```js
// Mettre à jour les settings voice d'un numéro
await telnyxPatch(
  `/phone_numbers/${phoneNumberId}/voice`,
  {
    connection_id: connectionId, // associer à la Call Control App
    // Le numéro est maintenant utilisable comme `from` dans dial()
  },
  apiKey,
);
```

**Pour le power dialer** : Le `from` est passé à chaque `dial()`. On peut avoir plusieurs numéros et choisir par campagne/Hub :

```js
// Dans la config de session
const campaignConfig = {
  connectionId: 'conn_...',
  callerIds: ['+33123456789', '+33198765432'], // rotation
  defaultCallerId: '+33123456789',
};
```

### 6.3 Réglementation FR

- Les numéros FR nécessitent un **address** (adresse française) et potentiellement un **regulatory requirement** (KYC).
- Vérifier via `GET /phone_numbers_regulatory_requirements?country_code=FR&number_type=local`.
- Le caller ID doit être un numéro Telnyx du compte (pas de spoofing).

---

## 7. Concurrency & Rate Limits

### 7.1 Limites API

| Ressource                | Limite                   | Notes                                |
| ------------------------ | ------------------------ | ------------------------------------ |
| POST /calls (dial)       | ~100 req/min par compte  | Suffisant pour 5 dials parallèles    |
| Actions (bridge, hangup) | ~100 req/min             |                                      |
| Webhooks                 | Pas de limite documentée | Telnyx retry automatiquement         |
| Concurrent calls         | Dépend du plan           | Défaut ~10-20 concurrent, extensible |

### 7.2 Pour le power dialer (3-5 parallèles)

Aucun risque de rate limit. 5 dials simultanés = 5 POST /calls, puis quelques actions. Très en dessous des limites.

### 7.3 SDK auto-retry

Le SDK `telnyx` retry automatiquement 2x avec backoff exponentiel sur :

- Erreurs réseau
- 408 Timeout
- 409 Conflict
- 429 Rate Limit
- 5xx

En REST direct, implémenter un retry simple :

```js
async function telnyxPostWithRetry(path, body, apiKey, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await telnyxPost(path, body, apiKey);
    } catch (err) {
      if (i === maxRetries) throw err;
      if (err.status === 429 || err.status >= 500) {
        await sleep(Math.pow(2, i) * 500); // 500ms, 1s
        continue;
      }
      throw err; // 4xx (sauf 429) = pas de retry
    }
  }
}
```

---

## 8. Error Handling & Edge Cases

### 8.1 Tous les N appels → voicemail

**Scénario** : 5 dials parallèles, tous détectés `machine` par AMD.

**Handling** :

```js
// Dans le webhook handler
async function handleMachineDetection(payload) {
  const state = decodeClientState(payload.client_state);
  const { sessionId, contactId } = state;

  if (payload.result === 'machine' || payload.result === 'silence') {
    // Marquer comme voicemail
    await updateCallStatus(sessionId, contactId, 'voicemail');

    // Option A : raccrocher
    await telnyxPost(
      `/calls/${payload.call_control_id}/actions/hangup`,
      {},
      apiKey,
    );

    // Option B : laisser un message (si configuré)
    // await telnyxPost(`/calls/${payload.call_control_id}/actions/speak`, {
    //   payload: 'Bonjour, c'est XOS Déchet. Nous cherchons à vous joindre...',
    //   voice: 'female',
    //   language: 'fr-FR',
    // }, apiKey);

    // Vérifier si TOUS les appels du batch sont terminés
    const batch = await getBatchStatus(sessionId);
    if (batch.allTerminated && batch.noneConnected) {
      // Notifier le commercial : "Aucun contact n'a décroché"
      await notifyRep(sessionId, 'batch_no_answer');
      // Lancer le batch suivant automatiquement
      await launchNextBatch(sessionId);
    }
  }
}
```

### 8.2 Webhook retries

Telnyx retry les webhooks failed. Configurable via `webhook_retries_policies` au dial :

```js
webhook_retries_policies: {
  'call.answered': { retries_ms: [1000, 3000, 5000] },
  'call.hangup': { retries_ms: [1000, 3000] },
}
```

**Notre webhook handler doit être idempotent** :

```js
// Idempotence via call_leg_id + event_type
async function handleWebhook(event) {
  const key = `${event.payload.call_leg_id}:${event.event_type}`;
  const existing = await supabase
    .from('webhook_log')
    .select('id')
    .eq('idempotency_key', key)
    .single();
  if (existing) return { ok: true }; // déjà traité

  await supabase
    .from('webhook_log')
    .insert({ idempotency_key: key, event_type: event.event_type });
  // ... traiter l'événement
}
```

### 8.3 Network failures

| Scénario                | Comportement Telnyx                            | Action                        |
| ----------------------- | ---------------------------------------------- | ----------------------------- |
| Webhook unreachable     | Retry avec backoff                             | Idempotence handler           |
| API timeout au dial     | Retry SDK auto                                 | `command_id` pour idempotence |
| Call dropped mid-bridge | `call.hangup` avec `hangup_cause: unspecified` | Logger, notifier rep          |
| Recording URL expired   | Perte du fichier                               | Télécharger dans les 10 min   |
| Transcription failed    | Pas de webhook `transcription.saved`           | Timeout + fallback Deepgram   |

### 8.4 Hangup d'un appel en cours

```js
// POST /calls/{call_control_id}/actions/hangup
await telnyxPost(`/calls/${callControlId}/actions/hangup`, {}, apiKey);
// → webhook call.hangup avec hangup_cause: normal_clearing
```

---

## 9. Cost Model — Session B2B FR typique

### 9.1 Tarifs Telnyx (2026, à vérifier sur telnyx.com/pricing)

| Poste                | Tarif estimé  | Notes                   |
| -------------------- | ------------- | ----------------------- |
| Numéro FR local      | ~1€/mois      | + achat initial ~1€     |
| Outbound FR (fixe)   | ~0.008€/min   | ~0.48€/h                |
| Outbound FR (mobile) | ~0.015€/min   | ~0.90€/h                |
| AMD Premium          | ~0.005€/appel | Par appel avec AMD      |
| Recording            | ~0.002€/min   | Stockage inclus         |
| Transcription        | ~0.01€/min    | Engine Telnyx/Google    |
| Webhook              | Gratuit       | Pas de coût par webhook |

### 9.2 Session type : 50 dials, 10 connects, 5min avg

**Hypothèses** :

- 50 dials vers des fixes FR (B2B)
- 10 réponses humaines (20% connect rate)
- 5 min de conversation moyenne par connect
- 40 voicemail/no-answer (durée moyenne 30s avant hangup)
- AMD premium sur tous les appels
- Enregistrement + transcription sur les 10 connects

| Poste                             | Calcul          | Coût        |
| --------------------------------- | --------------- | ----------- |
| Outbound 10 connects × 5min       | 50 min × 0.008€ | 0.40€       |
| Outbound 40 non-connects × 0.5min | 20 min × 0.008€ | 0.16€       |
| AMD Premium × 50                  | 50 × 0.005€     | 0.25€       |
| Recording 10 × 5min               | 50 min × 0.002€ | 0.10€       |
| Transcription 10 × 5min           | 50 min × 0.01€  | 0.50€       |
| **Total session**                 |                 | **~1.41€**  |
| **Coût par connect**              | 1.41€ / 10      | **~0.14€**  |
| **Coût par dial**                 | 1.41€ / 50      | **~0.028€** |

> **Note** : Si les appels sont vers des mobiles, multiplier le coût outbound par ~2. Total session ~2.20€.

### 9.3 Coût mensuel estimé (1 commercial, 2 sessions/jour, 22 jours)

|               | Fixe          | Mobile        |
| ------------- | ------------- | ------------- |
| Sessions/mois | 44            | 44            |
| Coût mensuel  | ~62€          | ~97€          |
| + Numéro FR   | 1€            | 1€            |
| **Total**     | **~63€/mois** | **~98€/mois** |

> Très compétitif vs solutions françaises (Aircall ~100€/mois/user, Ringover ~120€/mois/user) qui n'offrent pas le power dialing natif.

---

## 10. Architecture recommandée pour XOS

### 10.1 Fichiers

```
api/
  dialer.js              # Routeur (?resource=sessions|calls|recordings|transcripts)
  _dialer/
    telnyx.js            # Client REST Telnyx (dial, bridge, hangup, record)
    orchestrator.js      # Logique power session (batch, AMD, bridge, next)
    webhooks.js          # Handler webhooks Telnyx (idempotent, state machine)
    summarize.js         # Résumé IA post-call (LLM)
    recording.js         # Download + stockage Supabase
```

### 10.2 State Machine par appel

```
DIALING → RINGING → ANSWERED → AMD_HUMAN → BRIDGING → CONNECTED → HANGUP → RECORDED → TRANSCRIBED → SUMMARIZED
                  → AMD_MACHINE → HANGUP (voicemail)
                  → NO_ANSWER → HANGUP
                  → BUSY → HANGUP
                  → REJECTED → HANGUP
```

### 10.3 Tables Supabase

```sql
-- Sessions power
CREATE TABLE power_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  hub_id TEXT,
  status TEXT DEFAULT 'active', -- active, paused, completed
  config JSONB, -- { parallelDials: 3, callerId: '+33...', amd: 'premium' }
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Appels individuels
CREATE TABLE power_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES power_sessions,
  contact_id TEXT,
  call_control_id TEXT,
  call_leg_id TEXT UNIQUE,
  status TEXT DEFAULT 'dialing',
  amd_result TEXT,
  hangup_cause TEXT,
  duration_secs INTEGER,
  recording_path TEXT,
  transcription_text TEXT,
  summary JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 10.4 Webhook endpoint

```
POST /api/dialer?resource=webhooks
```

> ⚠️ Ce endpoint ne doit **PAS** être protégé par JWT — Telnyx ne peut pas envoyer de JWT. Utiliser la vérification de signature webhook Telnyx (header `telnyx-signature-ed25519` + `telnyx-timestamp`) avec la clé publique du compte.

```js
import { Webhook } from 'standardwebhooks';

function verifyTelnyxWebhook(body, headers, publicKey) {
  const wh = new Webhook(publicKey);
  wh.verify(body, {
    'telnyx-signature-ed25519': headers['telnyx-signature-ed25519'],
    'telnyx-timestamp': headers['telnyx-timestamp'],
  });
  return JSON.parse(body);
}
```

---

## 11. Décisions finales

| Sujet              | Décision                                               | Justification                                         |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| SDK vs REST        | **REST direct** (`fetch`)                              | 5 endpoints, pas besoin de 200KB de SDK               |
| AMD                | **Premium** (`answering_machine_detection: 'premium'`) | Meilleure détection FR, `human_business` vs `machine` |
| Bridge commercial  | **PSTN callback** (V1)                                 | Zéro config, marche sur mobile                        |
| Enregistrement     | **`record: 'record-from-answer'` au dial**             | Pas d'action supplémentaire, démarre dès la réponse   |
| Transcription      | **Engine B (Telnyx), `fr`**                            | Intégré, pas de service externe                       |
| Résumé IA          | **Endpoint Vercel + GPT-4o-mini**                      | Latence < 3s, coût négligeable                        |
| Stockage recording | **Supabase Storage**                                   | Déjà dans le stack                                    |
| Webhook auth       | **Signature Ed25519** (`standardwebhooks`)             | Pas de JWT possible pour Telnyx                       |
| Parallélisme       | **3 par défaut, configurable 3-5**                     | Équilibre connect rate / coût                         |
| Région SIP         | **`Europe`**                                           | Latence minimale pour la FR                           |

---

## 12. Prochaines étapes (Lot 11.1)

1. Créer `api/dialer.js` + `api/_dialer/telnyx.js`
2. Implémenter le webhook handler idempotent
3. State machine orchestrator
4. Bridge PSTN callback
5. Tests avec numéros Telnyx sandbox
