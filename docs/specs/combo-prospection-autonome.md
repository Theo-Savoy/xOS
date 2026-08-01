# Combo — Power Prospection (Phase 11)

> Spec v2 — 2026-07-23. Remplace la v1 (prospection autonome 3 niveaux).
> Sources : `docs/audits/lot-11.0-telnyx.md`, `docs/prospecting-ux-pattern-catalog.md`, `docs/power-dialer-research.md`.

## 1. Vision

Combo devient un **power dialer avec intelligence post-appel**, intégré au portail XOS. Le commercial lance une session power, le système appelle 3-5 contacts en parallèle, connecte le premier décroché, enregistre, transcrit, résume. À la fin de l'appel, l'ACW (After-Call Work) est pré-rempli par l'IA — le commercial valide en 1 clic, c'est dans Salesforce.

**Ce que c'est** : Minari/Flunter, mais avec la touche Combo (gamification sur la prospection réelle) et l'intégration portal (Hub, Cleaner, Business Review, même design system).

**Ce que ce n'est pas** : un robot autonome. Pas de séquences multi-canal, pas de scoring, pas d'auto-log aveugle. Le commercial reste aux commandes.

### Ce qu'on prend chez les concurrents

| Pattern                                 | Source               | Adaptation Combo                                               |
| --------------------------------------- | -------------------- | -------------------------------------------------------------- |
| Session en 3 clics (10s)                | Flunter              | Session Builder dans le Call Manager existant                  |
| Appels parallèles + auto-skip répondeur | Minari, Kixie        | 3-5 lignes, AMD premium, skip zero-click                       |
| ACW pré-rempli par IA                   | Minari, JustCall     | Résumé + disposition + next step, validation 1 clic            |
| Disposition → automation                | Kixie                | Disposition → rappel auto dans le runner séquentiel            |
| Dashboard manager                       | Flunter (39€/mo)     | Intégré gratuit dans Business Review / Hub                     |
| **Gamification prospection**            | **Aucun concurrent** | **XP, badges, streaks sur les appels power — différenciateur** |

## 2. Périmètre

### In

- Power dialer : 3-5 appels parallèles, connexion du premier décroché, skip répondeurs
- Enregistrement audio (dual channel, MP3)
- Transcription FR (Telnyx STT, fallback Deepgram)
- Résumé IA post-appel (GPT-4o-mini) : résumé, disposition suggérée, next step, sentiment
- ACW Overlay : pré-rempli IA, validation/modification 1 clic → écriture CRM
- Consignation Salesforce : Task (appel) + Event (si RDV) + Note (résumé) via adapter existant
- Gamification étendue : XP power, badges, streaks
- Stats session power : tentés, connectés, conversations, RDV, taux décroché, durée moyenne
- UI premium dans le portail (design system existant, GlassCard, Tag, SegmentedControl)

### Out (pas à date)

- ❌ Niveau 3 autonome (auto-log sans validation, séquences multi-canal)
- ❌ Bloctel (B2B, non pertinent)
- ❌ Scoring / file priorisée par IA
- ❌ WebRTC (V1 = PSTN callback, V2 éventuellement)
- ❌ SMS / email automatisés
- ❌ Écoute/whisper/barge (coaching manager)
- ❌ Enrichissement données (Minari waterfall)

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Combo UI (React)                        │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  Session   │  │   Power    │  │   ACW Overlay    │  │
│  │  Builder   │  │   Dialing  │  │   (post-appel)   │  │
│  │  (config)  │  │   (live)   │  │   résumé + CRM   │  │
│  └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘  │
│        └────────────────┴──────────────────┘            │
│                         │ SSE (temps réel)              │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│            api/dialer.js (Vercel, 1 fonction)           │
│                         │                               │
│   api/_dialer/                                          │
│   ├── telnyx.js ─── REST direct (dial, hangup, bridge)  │
│   ├── orchestrator.js ── dial N, bridge 1er, skip AMD  │
│   ├── webhooks.js ── Ed25519 verify, event router      │
│   ├── recording.js ── download <10min → Supabase       │
│   └── summarize.js ── GPT-4o-mini → résumé/disposition │
│                         │                               │
│        ┌────────────────┼────────────────┐              │
│        ▼                ▼                ▼              │
│   Telnyx API      Supabase DB      Salesforce API       │
│   (Voice)         (campaigns,      (adapter _crm/       │
│                    calls,           existant)            │
│                    recordings,                          │
│                    transcripts)                         │
└─────────────────────────────────────────────────────────┘
```

### Décisions techniques

| Sujet             | Décision                                                      | Raison                                                       |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| SDK Telnyx        | REST direct via `fetch`                                       | 5 endpoints, pas de dep 200KB, cold start Vercel             |
| AMD               | Premium (`answering_machine_detection: 'premium'`)            | FR : `human_business` / `machine` / `silence`                |
| Bridge            | **PSTN callback** (Telnyx appelle le téléphone du commercial) | Zéro config, marche sur mobile, pas de WebRTC                |
| Transcription     | Telnyx STT (`engine: 'B'`, `language: 'fr'`)                  | Intégré. Fallback Deepgram si qualité insuffisante           |
| Résumé IA         | GPT-4o-mini via endpoint Vercel                               | Meilleur rapport qualité/prix, pas de summarize natif Telnyx |
| Webhook auth      | Ed25519 (`standardwebhooks`)                                  | Telnyx signe les webhooks                                    |
| Recording storage | Supabase Storage                                              | Déjà dans la stack, URLs Telnyx expirent en 10min            |
| Temps réel UI     | SSE                                                           | Plus simple que WebSocket sur Vercel, unidirectionnel suffit |
| Écriture CRM      | **Semi-auto** : IA pré-remplit, commercial valide             | Jamais d'écriture aveugle                                    |

## 4. Modèle de données (Supabase)

```sql
-- Campagne = une session power
CREATE TABLE dialer_campaigns (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT REFERENCES call_sessions(id),
  parallelism   INT NOT NULL DEFAULT 3,        -- 3-5
  status        TEXT NOT NULL DEFAULT 'idle',  -- idle | dialing | active | paused | done
  rep_phone     TEXT NOT NULL,                 -- numéro PSTN du commercial
  caller_id     TEXT,                          -- numéro Telnyx outbound
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  stats         JSONB DEFAULT '{}',
  created_by    UUID REFERENCES profiles(id)
);

-- Appels individuels
CREATE TABLE dialer_calls (
  id              BIGSERIAL PRIMARY KEY,
  campaign_id     BIGINT REFERENCES dialer_campaigns(id),
  contact_id      BIGINT REFERENCES call_session_contacts(id),
  telnyx_call_id  TEXT,
  telnyx_leg_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
                  -- queued | dialing | ringing | answered | bridged |
                  -- voicemail | no_answer | busy | failed | ended
  amd_result      TEXT,              -- human_business | machine | silence | fax
  to_number       TEXT,
  started_at      TIMESTAMPTZ,
  answered_at     TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_sec    INT,
  hangup_cause    TEXT,
  recording_url   TEXT,              -- Supabase Storage path
  transcript      TEXT,
  transcript_json JSONB,             -- segments [{start, end, speaker, text}]
  ai_summary      TEXT,
  ai_disposition  TEXT,              -- Resultat_call__c suggéré
  ai_next_step    TEXT,
  ai_sentiment    TEXT,              -- positive | neutral | negative
  sf_task_id      TEXT,
  sf_event_id     TEXT,
  logged_by       UUID REFERENCES profiles(id),
  logged_at       TIMESTAMPTZ
);
```

Tables existantes réutilisées : `call_sessions` (mode `'power'`), `call_session_contacts`, `notifications`.

## 5. Lots

### 11.0 — Audit & cadrage ✅

Fait 2026-07-23.

### 11.1 — Infrastructure Telnyx

**Prérequis** : compte Telnyx, KYC FR, numéro outbound, crédits.

- Connection Telnyx (Call Control App) + webhook URL (`/api/dialer?resource=webhooks`)
- Numéro(s) FR outbound configuré(s)
- `api/_dialer/telnyx.js` : client REST (dial, hangup, bridge, startRecording)
- `api/_dialer/webhooks.js` : vérification Ed25519, routage événements, idempotence (`call_leg_id:event_type`)
- Migration Supabase : `dialer_campaigns`, `dialer_calls`
- `api/dialer.js` : routeur (`?resource=campaigns|calls|webhooks|recordings|events`)

**Vérifié par** : appel sortant réel → webhook reçu → état en base.

### 11.2 — Moteur parallèle + UI live

- `api/_dialer/orchestrator.js` :
  - `startBatch(campaignId, contactIds[])` : dial N en parallèle
  - `onAnswered` : premier décroché → bridge PSTN, hangup les autres
  - AMD = machine → hangup, next batch automatique
  - Tous répondeurs → notification + batch suivant
- SSE endpoint (`?resource=events&campaign_id=X`)
- `src/apps/calls/PowerDialerView.tsx` :
  - Grille de contacts avec statut temps réel (Tag : queued / dialing / ringing / connected / voicemail)
  - Focus mode sur le contact connecté (fiche CRM + notes)
  - Contrôles : hangup, skip, pause session
  - Compteur live (tentés / connectés / conversations)

**Vérifié par** : session 3 lignes, premier décroché connecté, répondeurs skippés, UI temps réel.

### 11.3 — Enregistrement + transcription + résumé IA

- `api/_dialer/recording.js` :
  - `record: 'record-from-answer'`, `channels: 'dual'`, `format: 'mp3'`
  - Webhook `call.recording_saved` → download immédiat → Supabase Storage
  - Webhook transcription → parse segments → `dialer_calls.transcript` + `transcript_json`
- `api/_dialer/summarize.js` :
  - Post-appel : transcription → GPT-4o-mini
  - Prompt structuré : résumé 3-5 phrases, disposition (`Resultat_call__c`), next step, sentiment
  - Stocker dans `dialer_calls.ai_*`
- Front : lecteur audio + transcription scrollable dans l'ACW

**Vérifié par** : appel → MP3 dans Storage → transcription FR → résumé cohérent.

### 11.4 — ACW & consignation CRM

- `src/apps/calls/ACWOverlay.tsx` (Modal post-appel, pattern Ringover) :
  - Résumé IA pré-rempli (éditable, textarea)
  - Disposition : SegmentedControl 5 valeurs (`Resultat_call__c`), pré-sélectionné par l'IA
  - Next step : date de rappel pré-remplie par l'IA (DatePicker)
  - Si disposition = "RDV planifié" → EventPanel existant (créneau, invités)
  - Bouton "Valider & suivant" → écriture CRM → next contact
  - Timer configurable (5s-2min, Hub setting) — auto-skip si timeout
- Écriture CRM via `api/_calls/logging.js` existant (adapté pour payload pré-rempli + durée réelle + recording link)
- Task SF : Subject, Resultat_call__c, CallDurationInSeconds (réel), WhoId, WhatId, OwnerId, Status Completed
- Note SF : résumé IA + lien transcription (si recording activé)

**Vérifié par** : appel connecté → ACW pré-rempli → validation 1 clic → Task + Note dans SF.

### 11.5 — Gamification power

- Nouveaux events `comboEvents.ts` :
  - `power_session_complete` : session power terminée
  - `power_connect` : appel connecté (+2 XP Vitesse)
  - `power_conversation` : conversation > 1min (+5 XP Impact)
  - `power_meeting` : RDV en power (+10 XP Impact)
- Nouveaux badges :
  - `power_starter` : première session power
  - `cent_appels` : 100 appels power cumulés
  - `machine_a_rdv` : 5 RDV en une session power
  - `precision` : 10 dispositions IA validées sans correction
- Streaks : `power_regulier` (sessions power consécutives)
- Toasts DesktopToasts + XP dans RecapView

**Vérifié par** : session power → XP → badge → toast.

### 11.6 — Récap & stats

- RecapView power : tentés, connectés, conversations, RDV, taux décroché, durée moyenne, coût session
- Comparaison power vs séquentiel (si les deux modes utilisés)
- Vue manager (dans Hub ou Business Review) : activité power par commercial, funnel, coûts
- Branchement Business Review : section "Appels" du V6 alimentée par les données power

**Vérifié par** : récap avec données réelles, vue manager visible.

## 6. UX — Session Power

### Flow complet

```
1. Session Builder (NewSessionView étendu)
   ├── Mode : [Séquentiel] [Power ←]
   ├── Parallélisme : 3 | 4 | 5
   ├── Numéro de callback : pré-rempli (profil), modifiable
   ├── Caller ID : numéro Telnyx (config Hub)
   ├── Contacts : filtres existants (FilterTree)
   └── Objectif RDV : 1-8

2. Pre-Session Flow (existant, inchangé)
   └── Review → Objectif → Warmup → Launch

3. Power Dialing (PowerDialerView)
   ├── Grille contacts (statut temps réel)
   ├── Focus contact connecté (fiche + notes)
   ├── Contrôles (hangup, skip, pause)
   └── Compteur live

4. ACW Overlay (post-appel, 5s-2min)
   ├── Résumé IA (éditable)
   ├── Disposition (SegmentedControl)
   ├── Next step (DatePicker)
   └── [Valider & suivant]

5. Récap Power (RecapView étendu)
   ├── Stats session
   ├── XP gagnée + badges
   └── Coût session
```

### Intégration portal

- Dock : icône Combo existante, badge "Power" quand une session power est active
- Cmd+K : "Lancer session power" comme action rapide
- Hub : settings power (parallélisme défaut, caller ID, timer ACW, recording on/off)
- Business Review : section Appels alimentée par `dialer_calls`
- Cleaner : détection des contacts sans téléphone → exclusion auto des sessions power

## 7. Dépendances

| Prérequis                                | Type          | Bloque |
| ---------------------------------------- | ------------- | ------ |
| Compte Telnyx + KYC FR + numéro outbound | Humain (Théo) | 11.1   |
| Crédits Telnyx (~62€/mois/commercial)    | Humain (Théo) | 11.1   |
| Décision PSTN callback confirmée         | Humain (Théo) | 11.2   |
| Clé API LLM (GPT-4o-mini)                | Humain (Théo) | 11.3   |
| Phase 8 OAuth SF ✅                      | Technique     | 11.4   |
| Adapter CRM `api/_crm/` ✅               | Technique     | 11.4   |
| Combo V1 `comboEvents.ts` ✅             | Technique     | 11.5   |
| Fonction Vercel (9/12)                   | Technique     | 11.1   |

## 8. Roadmap

```
Semaine 1-2 :  11.1 Infrastructure Telnyx
Semaine 2-4 :  11.2 Moteur parallèle + UI (∥ 11.3 Recording/IA)
Semaine 4-6 :  11.4 ACW & CRM (∥ 11.5 Gamification)
Semaine 6-7 :  11.6 Récap & stats
Semaine 7-8 :  Intégration, QA, pilote 1 commercial
Semaine 9 :    Rollout équipe
```

**Total : 8-9 semaines.**

## 9. Coûts

| Poste                                          | Par session (50 dials, 10 connects) |
| ---------------------------------------------- | ----------------------------------- |
| Outbound FR (sonneries + conversations)        | ~0,90€                              |
| AMD premium (50 dials)                         | ~0,30€                              |
| Recording + STT (50min)                        | ~0,15€                              |
| PSTN callback (50min)                          | ~0,06€                              |
| **Total session**                              | **~1,41€**                          |
| **Par commercial (2 sessions/jour, 22j/mois)** | **~62€/mois**                       |
| **Équipe 5**                                   | **~310€/mois**                      |
| LLM (10 résumés/session)                       | ~0,05€ (négligeable)                |

## 10. Risques

| Risque                              | Mitigation                                                    |
| ----------------------------------- | ------------------------------------------------------------- |
| STT FR insuffisant (Telnyx)         | Fallback Deepgram Nova 3 ($0,0074/min)                        |
| URLs recording expirent (10min)     | Download synchrone dans webhook, retry 3×                     |
| Webhooks perdus (cold start Vercel) | Idempotence + reconciliation cron 5min                        |
| Latence PSTN callback (3-5s)        | TTS "Patientez" au décroché, WebRTC en V2                     |
| Coût si dials massifs               | Cap configurable (défaut 100/session), alerte Hub 80% budget  |
| Commercial ne valide pas l'ACW      | Timer auto-skip + disposition par défaut "Appel non décroché" |
