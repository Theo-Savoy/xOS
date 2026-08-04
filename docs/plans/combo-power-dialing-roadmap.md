# Combo — Roadmap Power Dialing WebRTC (plan d'implémentation)

> **Date : 2026-08-04. Statut : plan directeur.**
> Aligne la vision produit (spec `combo-prospection-autonome.md` v2) avec
> l'état réel du code. **Acte le virage WebRTC** : la spec v2 prévoyait
> « PSTN callback, pas de WebRTC (V2 éventuellement) » — or le transport
> WebRTC est construit, testé en réel et réglé (G.722, qualité lot-11.4).
> Le navigateur EST le téléphone. Ce document remplace cette décision.

---

## 1. Vision produit (inchangée, rappel)

Combo = **power dialer avec intelligence post-appel**, intégré au portail XOS.
Le commercial lance une session power, le système appelle 3-5 contacts en
parallèle, connecte le premier décroché humain, enregistre, transcrit,
résume. L'ACW est pré-rempli par l'IA — validation 1 clic → Salesforce.

Différenciateur Combo : **gamification sur la prospection réelle** (aucun
concurrent ne le fait) + intégration portal (Hub, Cleaner, Business Review,
même design system).

---

## 2. Décisions actées (2026-08-04)

| Sujet | Décision | Justification |
|---|---|---|
| **Transport** | **WebRTC (navigateur = téléphone)** — PAS de PSTN callback | Construit + prouvé en réel + réglé (G.722, lot-11.4). Supprime la latence callback et le numéro PSTN du commercial |
| **Parallélisme** | **3 lignes max** (configurable 3-5, défaut 3) | Recherche power-dialer : 3 suffit, configurable à 5. `channel_limit=None` sur la connection → possible |
| **Déclenchement** | **Click-to-call par cycle** : clic Play → 3 en parallèle → skip non-réponse → réponse humaine = connect + hangup autres → STOP → re-clic Play | Le commercial reste **maître du rythme** — pas d'enchaînement auto (distinction claire avec le prédictif ARCEP) |
| **Skip répondeur** | **Phase B obligatoire** (webhooks `call.machine.detection.ended` + AMD premium) | Le SDK WebRTC client n'expose PAS d'AMD natif (vérifié dans les types). En attendant : skip manuel + skip sur non-décroché (timeout) |
| **Badge codec** | **Debug uniquement** (reste dans DialerView, pas dans le produit) | Décision Théo 2026-08-04 |
| **CRM** | Écriture **semi-auto** : IA pré-remplit, commercial valide | Jamais d'écriture aveugle (spec v2) |
| **Cadre légal** | Power dialing parallèle mono-utilisateur = standard B2B FR (Minari/Flunter), Bloctel N/A, opt-out CNIL | Correction Théo + marché vérifié |

---

## 3. Design de l'app (session power)

### 3.1 Flow complet

```
1. Session Builder (NewSessionView étendu)
   ├── Mode : [Séquentiel] [Power ←]
   ├── Parallélisme : 3 (défaut) | 4 | 5
   ├── Caller ID : sélecteur dialer_phone_numbers (par user)
   ├── Contacts : filtres existants (FilterTree) + exclusion sans téléphone (Cleaner)
   └── Objectif RDV : 1-8

2. Pre-Session Flow (existant, inchangé)

3. Power Dialing (PowerDialerView — nouveau)
   ├── Barre Play/Pause globale (le "play" de Minari/Flunter)
   ├── Panneau 3 lignes en parallèle, statut temps réel par ligne :
   │     dialing · ringing · CONNECTÉ (highlight) · skipped · répondeur
   ├── File d'attente visible (les prochains numéros)
   ├── Focus mode sur le contact connecté (fiche CRM + notes + caller ID)
   ├── Contrôles par ligne : hangup, skip
   ├── Compteur live : tentés / connectés / conversations / RDV
   └── Fin d'appel → STOP automatique → re-clic Play (le rythme reste humain)

4. ACW Overlay (post-appel, 5s-2min)
   ├── Résumé IA (éditable)
   ├── Disposition (SegmentedControl, pré-sélectionnée)
   ├── Next step (DatePicker pré-rempli)
   └── [Valider & suivant] → écriture CRM → retour au panneau power

5. Récap Power (RecapView étendu)
   ├── Stats session : tentés / connectés / conversations / RDV / taux décroché
   ├── XP gagnée + badges (gamification power)
   └── Coût session
```

### 3.2 Composants UI (design system existant)

| Composant | Fichier | Notes |
|---|---|---|
| DialerProvider étendu → **DialerPool** (3 slots) | `modules/dialer/DialerPool.tsx` | Remplacer l'instance 1-ligne par un pool 3 lignes + file + orchestration Play/Skip/Connect |
| **PowerDialerView** | `modules/dialer/PowerDialerView.tsx` | La vue live 3 lignes + file + compteurs (remplace l'usage de DialerView en mode prod) |
| **ACWOverlay** | `modules/dialer/ACWOverlay.tsx` | Modal post-appel (pattern Ringover) |
| **SessionBuilderPower** | extension `NewSessionView` | Mode + parallélisme + caller ID |
| CallBar existante | `modules/dialer/CallBar.tsx` | Évolue pour montrer l'état pool (3 lignes) |
| Récap power | extension `RecapView` | Stats + gamification |

### 3.3 Architecture technique (DialerPool)

```
DialerPool (3 slots)
├── slot[0..2] : client TelnyxRTC (une instance par ligne, channel_limit=None OK)
│     └── useRtcCall-line (state machine par ligne : idle/dialing/ringing/connected/failed)
├── file d'attente : contacts à composer (depuis la session)
├── Play()   → compose les min(3, restants) prochains numéros
├── Skip(l)  → hangup ligne l, compose le suivant
├── onAnswered(l) → garde la ligne l (connect), hangup les autres slots
├── onEnded  → STOP (les 3 slots idle), attend re-clic Play
└── <audio data-rtc-remote> par ligne (3 éléments, un par slot)
```

- Chaque ligne a son **propre élément audio** (fix B2 appliqué 3×)
- Le caller ID par ligne : depuis `dialer_phone_numbers` (validé serveur B7)
- Dry-run : token null → simulation par ligne (G2 conservé)

---

## 4. Lots d'implémentation (ordre)

### Lot 11.5 — DialerPool (le cœur)
Refactor `useRtcCall` → multi-slots :
- 3 instances ligne (machine à états par slot)
- File d'attente + Play/Skip/onAnswered-hangup-others
- 3 éléments audio, caller ID par ligne
- Tests : pool unitaires (Play compose 3, Skip avance, onAnswered coupe les autres)
- **Vérifié par** : simulation 3 lignes (dry-run), logique de file testée

### Lot 11.6 — UI Power Dialing
- `PowerDialerView` : panneau 3 lignes + file + compteurs + bouton Play/Pause
- `SessionBuilderPower` : mode + parallélisme + caller ID
- CallBar pool (3 lignes) + intégration Runner
- **Vérifié par** : session power en dry-run de bout en bout (3 lignes simulées, connect → cut others)

### Lot 11.7 — Backend orchestration & persistance
- `dialer_campaigns` + `dialer_calls` actives (migration 044 + schéma spec v2)
- `POST ?resource=webrtc_token` → réserve budget + crée ligne `dialer_calls` (lot-11.3 §2.3)
- Rate limit + validation caller_number (B7 déjà en place)
- **Vérifié par** : session → lignes en base → budget réservé

### Lot 11.8 — AMD & webhooks (Phase B, prérequis : compte paid)
- Clé Ed25519 + webhook URL stable (Vercel) + Event Webhook Telnyx
- `api/_dialer/webhooks.js` : event router `call.*`, idempotence
- `call.machine.detection.ended` → skip auto répondeur dans le pool
- **Vérifié par** : appel vers répondeur → skip auto → batch suivant

### Lot 11.9 — Recording + transcription + résumé IA
- Enregistrement (record-from-answer, dual, mp3) → Supabase Storage
- Transcription FR (Telnyx STT, fallback Deepgram)
- Résumé GPT : résumé 3-5 phrases + disposition + next step + sentiment
- **Vérifié par** : appel → MP3 → transcript → résumé cohérent

### Lot 11.10 — ACW & consignation CRM
- `ACWOverlay` : pré-rempli IA, disposition, next step, validation 1 clic
- Écriture Salesforce : Task (appel, durée réelle) + Note (résumé) + Event (RDV)
- **Vérifié par** : appel connecté → ACW pré-rempli → 1 clic → Task+Note SF

### Lot 11.11 — Gamification power
- Events : `power_session_complete`, `power_connect`, `power_conversation`, `power_meeting`
- Badges : `power_starter`, `cent_appels`, `machine_a_rdv`, `precision`
- Streak : `power_regulier`
- **Vérifié par** : session power → XP → badge → toast

### Lot 11.12 — Récap & stats + intégration portal
- RecapView power : stats session + coût
- Vue manager (Hub / Business Review) : activité power par commercial
- Dock badge "Power", Cmd+K action rapide, Hub settings power
- **Vérifié par** : récap réel, vue manager visible

---

## 5. Dépendances / blocages

| Prérequis | Type | Bloque |
|---|---|---|
| **Compte Telnyx PAYANT** (clé Ed25519, webhooks) | Humain (Théo) | 11.8 AMD, 11.9 recording webhooks |
| Décision : 3 credentials WebRTC ou 1 + channel pool | Technique (à tester) | 11.5 si le pool exige plusieurs credentials |
| Clé API LLM (GPT-4o-mini) | Humain (Théo) | 11.9 |
| OAuth SF ✅ / adapter CRM ✅ | Fait | 11.10 |
| `dialer_campaigns` schéma | Technique (migration prête) | 11.7 |

---

## 6. Priorité recommandée

**Immédiat (sans bloquant)** : Lot 11.5 DialerPool → Lot 11.6 UI power
→ Lot 11.7 backend/persistance. Ces 3 lots livrent le **power dialing
fonctionnel en dry-run** puis en réel mono-ligne→3 lignes.

**Après passage paid Telnyx** : 11.8 AMD (le skip auto répondeur) → 11.9
recording/IA → 11.10 ACW CRM → 11.11 gamification → 11.12 récap/portal.

**Règle de prudence** : chaque lot garde les gates (dry-run 3 niveaux,
budget atomique, validation caller_number, entitlement) — le power dialing
n'ajoute JAMAIS de déclenchement sans clic humain.
