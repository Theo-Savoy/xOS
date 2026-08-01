# Prospecting UX Pattern Catalog

## Research: Minari, Flunter, Kixie, Ringover, JustCall, Aircall

### Compiled for XOS Portal — July 2026

---

## 1. The Prospecting Session Concept

### How reps start, configure, and run a session

| Tool         | Session Model                                                            | Setup Time | Key Config                                                                               |
| ------------ | ------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------- |
| **Minari**   | "Calling session" — rep imports list, hits start                         | ~2 min     | List selection, number rotation pool, CRM sync toggle                                    |
| **Flunter**  | "Session d'appel" — 3-click config                                       | ~10 sec    | CSV/CRM import → choose caller ID → set simultaneous calls (3 or 5) → "Lancer"           |
| **Kixie**    | "PowerCall session" — CRM-driven list, auto-dial up to 10 parallel lines | ~2 min     | CRM filter → list → dial ratio → local presence toggle → DNC check                       |
| **Ringover** | "Call campaign" — CSV import or CRM sync, assign to agents               | ~5 min     | CSV upload (≤1000 numbers), assign agents/groups, attach script, set after-call duration |
| **JustCall** | "Campaign list" — CRM-synced, agent sees context before each call        | ~3 min     | CRM list → disposition codes → reattempt rules → post-call SMS toggle                    |

### Pattern: The 3-Step Session Launch

All tools converge on: **Import → Configure → Launch**. Flunter is the most aggressive (10 seconds, 3 clicks). Ringover is the most structured (campaign assignment, scripts).

### Recommendations for XOS:

- **Session = first-class entity** with a lifecycle: `draft → active → paused → completed`
- **Launcher integration**: Cmd+K → "Nouvelle session" → pick list → go. Target <15 seconds to first dial.
- **Session config panel** (GlassCard): list selector, simultaneous call count (SegmentedControl: 1/3/5), caller ID pool, after-call duration slider, script attachment
- **Session state bar**: persistent top bar showing `Queued | Dialed | Connected | Avg Duration` (Kixie pattern — their live session widget shows exactly these 4 metrics)
- **Pause/resume**: reps need to pause mid-session for meetings. Session state persists.

---

## 2. Campaign / List Management

### How contact lists are built, filtered, prioritized

| Tool         | List Sources                                                                                                                                    | Filtering                                  | Prioritization                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| **Minari**   | CSV import + CRM sync + built-in waterfall enrichment (auto-finds verified mobile numbers)                                                      | CRM fields, list membership                | Enrichment-first: only verified numbers enter the dial queue                     |
| **Flunter**  | CSV drag-drop + CRM connector (HubSpot, Pipedrive, Salesforce, Close, BoondManager) + **hand-collected lead files** (paid add-on, 48h delivery) | CRM fields, manual segmentation            | Lead freshness: "données fraîches, collectées à la main" — no recycled databases |
| **Kixie**    | CRM-native (HubSpot, Salesforce, Zoho, Pipedrive, HighLevel) + CSV upload                                                                       | CRM field filters, saved views, lead score | AI lead prioritization, automated lead caller (speed-to-lead from web forms)     |
| **Ringover** | CSV import (≤1000/campaign, 5 simultaneous campaigns) + CRM sync + Chrome extension (scrape numbers from any webpage)                           | CRM fields, campaign assignment            | Campaign-level scripts, agent/group assignment                                   |
| **JustCall** | CRM sync (100+ integrations) + CSV + Apollo.io integration                                                                                      | CRM fields, tags, disposition history      | Predictive dialer algorithms, reattempt rules for no-answers                     |

### Pattern: List = Campaign + Context

The best tools don't just store phone numbers — they carry the full prospect context (CRM fields, interaction history, enrichment data) into the dialing session.

### Key Differentiator: Built-in Enrichment

Minari and Flunter both offer **native number enrichment** — import a company list, get verified mobile numbers automatically. This eliminates the "struggling to find enough valid numbers to dial" pain point.

### Recommendations for XOS:

- **List builder** with Salesforce SOQL filter integration (leverage existing CRM adapter): "SELECT Contact WHERE LastActivityDate > 30 AND LeadScore > 60"
- **Enrichment pipeline**: CSV upload → detect missing mobiles → waterfall enrichment (Dropcontact/Kaspr API) → verified-only dial queue
- **List health indicator**: show % of verified mobiles, % with email, % previously called — before session launch
- **Smart re-queue**: contacts dispositioned as "no answer" auto-requeue for next session with configurable cooldown (24h/48h/7d)
- **Chrome extension** (Ringover pattern): scrape numbers from LinkedIn/company pages → append to active list
- **Lead file marketplace** (Flunter pattern): order hand-collected lead lists by criteria (sector, role, company size, region) — delivered in 48h

---

## 3. The Live Dialing Interface

### What the rep sees during parallel calls

| Tool         | Parallel Lines                                     | Live UI Elements                                                                                                                                                      | Answer Detection                                                                              |
| ------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Minari**   | Up to 5 simultaneous                               | Contact cards with status (ringing, connected, voicemail, no answer), auto-skip, one-click voicemail drop                                                             | Auto-skip no-answers, wrong numbers, voicemails. Connects only on human pickup                |
| **Flunter**  | 3 (Starter) or 5 (Hunter/Pro) simultaneous         | 5 contact cards showing real-time status: "Appel en cours", "Décroché", "Message vocal laissé", "Pas de réponse", "Appel abandonné". Counter: "Appels simultanés 5/5" | Voicemail detection → auto-skip. First human pickup = live connection. Others get missed call |
| **Kixie**    | Up to 10 parallel lines                            | Session dashboard: Queued/Dialed/Connected/Avg Duration counters. AI Human Voice Detection distinguishes real person from recording                                   | AI voice detection: differentiates human vs voicemail/IVR. Auto-connects only live persons    |
| **Ringover** | Sequential (1:1 power dialer)                      | Dialer with CRM screen pop, call script panel, after-call qualification overlay                                                                                       | N/A (sequential)                                                                              |
| **JustCall** | Sequential power dialer + predictive dialer option | Contact details + CRM context shown before each call. Call/skip buttons. Voicemail drop, disposition logging                                                          | Predictive mode: algorithm predicts agent availability                                        |

### Pattern: The Parallel Call Card Grid

Minari and Flunter both show **N contact cards in a grid**, each with real-time status. The rep's attention is drawn to the card that connects. Everything else is automated.

### Flunter's Live UI (most detailed for French market):

```
┌─────────────────────────────────────────────────┐
│  Louis Dupont      │  Olivia Francis            │
│  🟢 Décroché       │  🟡 Message vocal laissé   │
│  Appel en cours    │                            │
├────────────────────┼────────────────────────────┤
│  Fred Manuel       │  Sophia Dalmas             │
│  🔴 Appel abandonné│  ⚪ Pas de réponse         │
├────────────────────┼────────────────────────────┤
│  Alex Thomas       │                            │
│  ⚪ Pas de réponse │  Appels simultanés: 5/5    │
└─────────────────────────────────────────────────┘
```

### Key UX Insight: "Friction minimale"

Flunter emphasizes: "Aucune sensation d'automatisation" — the experience should feel natural for both the rep AND the prospect who picks up. No robotic pauses, no "please wait while we connect you."

### Recommendations for XOS:

- **Call card grid** (GlassCard components): 3-5 cards showing contact name, company, phone, real-time status badge (Tag component: `ringing` / `connected` / `voicemail` / `no-answer` / `skipped`)
- **Focus mode**: when a call connects, that card expands to full-width with CRM context (account history, last activity, talking points). Other cards collapse to status pills.
- **One-click voicemail drop**: pre-recorded voicemail library, select → drop → next. No manual recording during session.
- **Session HUD** (top bar, always visible): `Queued: 148 | Dialed: 12 | Connected: 3 | Avg: 2:34` (Kixie pattern)
- **Caller ID rotation indicator**: show which number is being displayed to the prospect (Minari pattern: "+33 6 98 01 57 60")
- **Auto-skip logic**: voicemail detected → auto-drop pre-recorded message → next. No answer after X rings → next. Human voice detected → connect rep.
- **Sound design**: subtle ring tone while waiting, distinct "connect" chime when human picks up. No jarring transitions.

---

## 4. Post-Call Workflow

### Auto-logging, AI notes, disposition codes, next-step scheduling

| Tool         | Auto-Logging                                                                                                     | AI Notes                                                                            | Disposition                                                           | Next Steps                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Minari**   | Full recording + transcription → AI summary → CRM sync. Custom AI prompts extract objections, intent, next steps | ✅ AI summaries from transcripts, custom prompts for business-specific insights     | CRM-synced outcomes                                                   | Auto-created tasks in CRM                                                  |
| **Flunter**  | Recording + transcription (all plans). CRM sync                                                                  | 🔄 "IA à venir prochainement"                                                       | CRM tags                                                              | CRM tasks                                                                  |
| **Kixie**    | Calls, texts, outcomes, recordings auto-logged to CRM. New lead auto-creation for unknown numbers                | ✅ AI Insights (new): reporting & analytics                                         | One-click disposition logging (default + custom) → auto-synced to CRM | Auto-SMS from call outcomes, scheduled auto-calls from CRM calendar events |
| **Ringover** | After-Call Work (ACW) period: configurable 5s–15min. Tags, notes, CRM notes, email sending during ACW            | ✅ Call Summaries AI, Call Analysis AI, Transcription AI, Automatic Topic Detection | Tags + notes during ACW period                                        | Task creation, follow-up email                                             |
| **JustCall** | Auto-capture every call, transcript, detail → CRM sync. TCPA + GDPR compliance features                          | ✅ AI transcripts, summaries, sentiment analysis, moment analysis                   | Call disposition codes → grouped by outcome                           | SMS workflows, reattempt rules                                             |

### Pattern: The After-Call Work (ACW) Window

Ringover's ACW is the most explicit: a **configurable time window** (5s to 15min) after each call where no incoming calls disturb the rep. During this window: tag, note, CRM update, email, plan next steps.

### Pattern: AI Summary → CRM Push

Minari and JustCall lead here: every call is recorded, transcribed, summarized by AI, and pushed to CRM with **custom extraction prompts** (objections, intent, next steps, budget signals).

### Pattern: Disposition → Automation Trigger

Kixie's key insight: **dispositioning a call triggers automations**. Select "Interested - Call Back" → auto-sends SMS + schedules follow-up call. Select "Not Interested" → auto-tags DNC. The disposition IS the workflow trigger.

### Recommendations for XOS:

- **ACW overlay** (Modal component): appears after each connected call. Configurable duration (default 30s). Contains:
  - Disposition selector (SegmentedControl or Select): `Connecté - Intéressé` / `Connecté - Pas intéressé` / `Messagerie` / `Pas de réponse` / `Mauvais numéro` / `Rappeler`
  - AI-generated summary (auto-populated from transcript, editable)
  - Quick note field (auto-focused)
  - Next-step scheduler: date picker + task type (call/email/meeting)
  - "Save & Next" button → logs to Salesforce → advances queue
- **Disposition → automation mapping** (Hub settings): each disposition code maps to: CRM status update + optional SMS template + optional follow-up task creation
- **AI call summary card**: shown in ACW overlay. Extracts: key objections, buying signals, agreed next steps, sentiment. Editable before CRM push.
- **Auto-logging guarantee**: every call (connected or not) creates a Salesforce activity record with: duration, outcome, recording link, transcript link, AI summary, disposition
- **Combo V1 integration**: disposition completion = XP event. "Session complete with 100% dispositions logged" = badge. Streak for consecutive days with full disposition compliance.

---

## 5. Manager Views

### Team activity, call quality, conversion metrics

| Tool         | Manager Dashboard                                                                       | Real-Time Monitoring                                                             | Quality Tools                                                                               | Key Metrics                                                         |
| ------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Minari**   | Per-rep, per-session tracking: calls, connect rates, meetings booked, revenue generated | Session-level visibility                                                         | "Spot what the best performers do differently and replicate it"                             | Calls, conversion rates, meetings booked, sessions, revenue         |
| **Flunter**  | Dashboard Manager (add-on, 39€/mo): team KPIs                                           | Day/Week/Month comparison view                                                   | Before/after Flunter comparison widget                                                      | Appels passés, Conversations, RDV obtenus (+254%, +225%, +267%)     |
| **Kixie**    | AI Insights dashboards, live leaderboards, business snapshot                            | Live call boards, real-time leaderboards (configurable metrics for "big screen") | Live call coaching: listen-in, whisper, barge. Conversation Intelligence (AI call analysis) | Connection rate, dispositions, call volume, talk time, missed calls |
| **Ringover** | Agent performance KPIs per agent, campaign analytics                                    | Real-time campaign progress tracking                                             | Double listening (live monitoring), call whispering, call recording playback                | Calls per campaign/rep, duration, tags, notes, conversion           |
| **JustCall** | Agent analytics (360° view), automatic call scoring                                     | Real-time performance monitoring                                                 | AI coaching plans, agent assist (real-time guidance), sentiment analysis                    | Call scores, sentiment trends, moment analysis, conversion          |

### Pattern: The Manager's Three Views

1. **Live view**: what's happening NOW (who's calling, who's connected, queue depth)
2. **Session/campaign view**: how did today's session perform (calls → connects → meetings funnel)
3. **Trend view**: week-over-week, rep-vs-rep, team benchmarks

### Pattern: Coaching = Listen + Whisper + Barge

Kixie and Ringover both offer three levels of live intervention:

- **Listen**: silent monitoring
- **Whisper**: talk to agent, prospect can't hear
- **Barge**: join the call (all parties hear)

### Pattern: AI Call Scoring

JustCall and Kixie use AI to **automatically score calls** against a rubric (greeting, discovery questions, objection handling, close attempt, next steps). Eliminates manual call review for managers.

### Recommendations for XOS:

- **Manager dashboard** (existing Weekly Perf → extend):
  - **Live session board**: GlassCard grid showing each rep's active session status (idle / dialing / connected / in ACW). Click to listen-in.
  - **Session funnel**: Calls Queued → Dialed → Connected → Conversations > 2min → Meetings Booked. Per-rep, per-session, per-day.
  - **Rep leaderboard**: sortable by connects, conversations, meetings, disposition compliance, avg call duration. Real-time during active sessions.
  - **AI quality scores**: auto-scored calls (0-100) based on: talk ratio, questions asked, objections handled, next steps set. Flag bottom 10% for review.
  - **Disposition breakdown**: pie chart of outcomes per rep/team. Spot "too many no-answers" (list quality issue) vs "too many not-interested" (pitch issue).
- **Call review queue**: manager gets a filtered list of calls to review (low scores, long calls, first-time reps). Inline playback + transcript + AI summary.
- **Coaching mode**: listen-in / whisper / barge from the live session board. Requires WebRTC infrastructure.
- **Combo V1 manager view**: team XP leaderboard, badge completion rates, streak compliance. Gamification as engagement proxy.

---

## 6. Autonomous vs Assisted Prospecting

### Where the tool decides vs the human

| Decision Point           | Autonomous (Tool Decides)                                                             | Assisted (Human Decides)                                     |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Who to call next**     | Kixie: CRM-driven queue, auto-advance. Minari/Flunter: list order, auto-skip failures | JustCall: rep sees contact details, chooses "call" or "skip" |
| **When to dial**         | All: auto-dial next after hangup/ACW timer                                            | Ringover: rep controls pace via ACW duration                 |
| **Voicemail handling**   | Minari/Flunter/Kixie: auto-detect → auto-drop pre-recorded message                    | Ringover: rep decides whether to leave message               |
| **Number selection**     | Kixie: AI local presence auto-selects best caller ID. Minari: rotation pool           | Flunter: rep chooses caller ID in config                     |
| **Call routing**         | Kixie: AI voice detection routes only human pickups to rep                            | All: rep handles the conversation                            |
| **Post-call logging**    | Minari/Kixie/JustCall: auto-log + AI summary → CRM                                    | Ringover: rep fills tags/notes during ACW                    |
| **Follow-up scheduling** | Kixie: disposition triggers auto-SMS + auto-schedule                                  | All: rep sets next step manually (or confirms AI suggestion) |
| **List prioritization**  | Kixie: AI lead scoring, speed-to-lead triggers                                        | Minari/Flunter: rep/manager builds list manually             |
| **Coaching**             | JustCall: AI call scoring, auto-generated coaching plans                              | Kixie/Ringover: manager listens and coaches manually         |

### The Autonomy Spectrum

```
Fully Manual ←────────────────────────────────→ Fully Autonomous
  Ringover          JustCall        Flunter/Minari        Kixie
  (rep dials,       (rep chooses    (auto-dial,          (AI voice detection,
   rep logs,         call/skip,      auto-skip,           auto-local-presence,
   rep schedules)    auto-log)       auto-log)            auto-SMS, auto-score)
```

### Key Insight: "Autonomous" = Removing Dead Time

The autonomy that matters most isn't AI decision-making — it's **eliminating the 80% of time reps spend on non-conversation activities** (dialing, ringing, voicemails, logging, scheduling). Minari's pitch: "Wasting up to 80% of their time listening to voicemails and unanswered calls."

### Recommendations for XOS:

- **Default to assisted, opt into autonomous**:
  - Level 1 (Assisted): sequential dialer, rep controls pace, manual disposition. Current Call Manager behavior.
  - Level 2 (Semi-auto): parallel dialing (3-5 lines), auto-skip no-answers/voicemails, auto-log to CRM, AI summary draft. Rep confirms disposition and next steps.
  - Level 3 (Autonomous): all of Level 2 + auto-SMS on disposition + auto-schedule follow-ups + AI lead scoring for queue priority + auto-call-scoring for quality.
- **Per-session autonomy toggle**: rep chooses Level 1/2/3 when configuring a session. Manager can set team default.
- **Human-in-the-loop for high-stakes**: AI drafts the summary, rep edits before CRM push. AI suggests next step, rep confirms. Never auto-send email/SMS without rep approval (at first).
- **Trust-building UX**: show the rep what the AI did ("Auto-skipped 3 voicemails", "Auto-logged to Salesforce", "AI summary drafted — review?"). Transparency builds adoption.

---

## 7. French / European Specifics

### GDPR recording consent, local number requirements, regulatory

| Requirement                   | Detail                                                                                      | How Tools Handle It                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GDPR call recording**       | Two-party consent required in most EU countries. France: must inform prospect of recording. | Kixie: auto-disables recording for two-party consent regions. JustCall: "compliance features that support TCPA and GDPR requirements." Ringover: French company, GDPR-native.                                     |
| **RGPD (France)**             | CNIL guidelines: explicit consent for recording, data retention limits, right to erasure    | Flunter: "RGPD & Conformité" page in footer. Ringover: dedicated GDPR page, DPA available. Minari: "Politique de confidentialité" + "Mentions légales" (French legal requirements)                                |
| **Local number requirements** | France: 01/02/03/04/05 geographic or 06/07 mobile. ARCEP regulations on number usage.       | Ringover: French numbers (+33 1 84 800 900), 65+ countries. Minari: French mobile numbers (+33 6 xx xx xx xx), rotation pool. Flunter: "Puis-je choisir le numéro affiché à l'appel?" — yes, caller ID selection. |
| **Bloctel (French DNC)**      | French Do-Not-Call registry. B2C calls must check Bloctel. B2B exempt but best practice.    | Kixie: DNC compliance (FTC-focused, US). Ringover: French company, likely Bloctel-aware. **Gap: no tool explicitly mentions Bloctel integration.**                                                                |
| **Calling hours**             | France: B2C calls restricted 10h-13h, 14h-20h weekdays. B2B: business hours.                | No tool explicitly enforces French calling hours. **Opportunity for XOS.**                                                                                                                                        |
| **Data residency**            | EU data must stay in EU (GDPR Art. 44-49).                                                  | Ringover: EU-hosted (French company). Flunter: French company, EU hosting implied. Minari: French company. Kixie/JustCall: US companies, may need EU data processing agreements.                                  |
| **Axeptio cookie consent**    | French CMP (Consent Management Platform) — Flunter uses it                                  | Flunter: Axeptio cookie banner with granular consent. Shows French compliance maturity.                                                                                                                           |

### French Market UX Patterns

- **Flunter is 100% French-first**: UI in French, pricing in EUR, "RGPD & Conformité" in footer, Axeptio consent, French phone numbers, French testimonials (Doctolib, AXA, HubSpot France)
- **Ringover is French-founded**: multilingual (FR, EN, ES, DE, NL, SV, IT, PT), French legal pages, French support number (+33 1 84 800 900)
- **Minari is French-market**: French testimonials, French mobile numbers (+33 6), French legal pages (CGVU, Mentions légales, Politique de confidentialité)

### Recommendations for XOS:

- **Recording consent flow**: at call connect, auto-play a brief consent message OR show a visual indicator to the rep: "⚠️ Enregistrement actif — informer le prospect". Configurable per campaign.
- **Bloctel check**: integrate Bloctel API for B2C lists. Block calls to registered numbers. Log compliance check.
- **French calling hours enforcement**: auto-pause sessions outside legal windows (B2C: 10h-13h, 14h-20h; B2B: configurable). Show countdown to next allowed window.
- **Local number pool**: French geographic (01-05) and mobile (06/07) numbers. Rotate per campaign to avoid spam flagging. Show caller ID in session config.
- **Data residency**: all call recordings, transcripts, and CRM data stored in EU (OVH/Scaleway/AWS eu-west-3 Paris).
- **RGPD compliance panel** (Hub settings):
  - Recording consent mode: `announce` / `visual-rep-reminder` / `none`
  - Data retention: auto-delete recordings after X days (default 90)
  - Right to erasure: one-click delete all data for a contact
  - DPA generator: auto-generate Data Processing Agreement for clients
- **French UI**: all disposition codes, session labels, and manager metrics in French by default. English toggle.

---

## 8. Cross-Cutting UX Patterns & Concrete Build Recommendations

### Pattern A: The Session as the Atomic Unit

Every tool organizes work around a **session** (Minari, Flunter) or **campaign** (Ringover, Kixie). This is the container for: list + config + execution + results.

**XOS Build**: `Session` entity with:

```typescript
interface ProspectingSession {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  listId: string; // contact list reference
  config: {
    parallelLines: 1 | 3 | 5;
    callerIdPool: string[]; // French numbers to rotate
    afterCallDuration: number; // seconds (5-300)
    autoVoicemailDrop: boolean;
    recordingConsent: 'announce' | 'visual' | 'none';
    autonomyLevel: 1 | 2 | 3;
    scriptId?: string;
  };
  metrics: {
    queued: number;
    dialed: number;
    connected: number;
    conversations: number; // >2min
    meetingsBooked: number;
    avgDuration: string;
  };
  createdAt: Date;
  completedAt?: Date;
}
```

### Pattern B: The Contact Card as the Live Interface Element

During a session, the rep interacts with **contact cards** — not a list, not a table. Cards show real-time status and expand on connect.

**XOS Build**: `ContactCard` component (GlassCard variant):

- Collapsed: name, company, phone, status Tag
- Expanded (on connect): full CRM context, talking points, AI-suggested questions, disposition selector, note field
- Status colors: `ringing` (amber pulse), `connected` (green solid), `voicemail` (yellow), `no-answer` (gray), `skipped` (red strikethrough)

### Pattern C: Disposition as Workflow Trigger

Disposition isn't just a label — it's the **trigger for the next action**.

**XOS Build**: Disposition → Action mapping (configurable in Hub):

```
"Intéressé - RDV"     → Create Salesforce task (meeting) + send confirmation SMS
"Intéressé - Rappeler" → Schedule follow-up call in X days + add to re-queue
"Pas intéressé"        → Update Salesforce status + remove from active lists
"Messagerie"           → Auto-voicemail drop + add to re-queue (48h cooldown)
"Mauvais numéro"       → Flag in Salesforce + remove from all lists
```

### Pattern D: The Manager's Funnel View

Every tool shows a conversion funnel: Calls → Connects → Conversations → Meetings.

**XOS Build**: Funnel visualization (ProgressBar variants):

```
Queued [████████████████████] 148
Dialed [████████████░░░░░░░░]  89
Connected [██████░░░░░░░░░░░░]  23
Conversation >2min [███░░░░░░░░░░░░░░░]  11
Meeting Booked [█░░░░░░░░░░░░░░░░░]   3
```

### Pattern E: Gamification as Engagement Layer (Combo V1 Integration)

No competitor has gamification. This is XOS's differentiator.

**XOS Build**: Map prospecting events to Combo V1:

- Session started: +5 XP
- Each connected call: +10 XP
- Conversation > 5min: +25 XP
- Meeting booked: +100 XP
- 100% disposition compliance: +50 XP bonus
- 5-day session streak: "Machine" badge
- 20 connects in one session: "Standardiste" badge
- Manager: team XP leaderboard, weekly "Top Prospecteur" highlight

### Pattern F: French Compliance as a Feature, Not a Burden

French tools (Flunter, Ringover, Minari) treat compliance as a trust signal, not a checkbox.

**XOS Build**: Compliance dashboard in Hub:

- Recording consent status per campaign
- Bloctel check results (last run, blocked count)
- Calling hours compliance (auto-pause log)
- Data retention policy status
- "RGPD Ready" badge for client-facing materials

---

## 9. Competitive Positioning Summary

| Feature                 | Minari              | Flunter                 | Kixie                   | Ringover             | JustCall                     | **XOS Target**                   |
| ----------------------- | ------------------- | ----------------------- | ----------------------- | -------------------- | ---------------------------- | -------------------------------- |
| Parallel dialing        | 5 lines             | 3-5 lines               | 10 lines                | Sequential           | Sequential + predictive      | **3-5 lines**                    |
| AI voice detection      | ✅                  | ✅ (voicemail)          | ✅ (human vs recording) | ❌                   | ❌                           | **✅ (voicemail + human)**       |
| Built-in enrichment     | ✅ Waterfall        | ✅ Hand-collected leads | ❌                      | ❌                   | ❌ (Apollo integration)      | **✅ (Dropcontact/Kaspr)**       |
| AI call summaries       | ✅ Custom prompts   | 🔄 Coming soon          | ✅ AI Insights          | ✅ Call Summaries AI | ✅ Transcription + sentiment | **✅ Custom prompts**            |
| Auto CRM logging        | ✅                  | ✅                      | ✅                      | ✅ (ACW)             | ✅                           | **✅ Salesforce-native**         |
| Disposition automations | Basic               | Basic                   | ✅ Auto-SMS + auto-call | Tags + notes         | ✅ SMS workflows             | **✅ Full automation**           |
| Manager live monitoring | Session metrics     | Dashboard (add-on)      | ✅ Listen/whisper/barge | ✅ Listen/whisper    | ✅ AI scoring                | **✅ Listen + AI scoring**       |
| French compliance       | ✅ FR numbers, RGPD | ✅ RGPD, Axeptio        | US-focused (DNC)        | ✅ FR company, GDPR  | US-focused (TCPA)            | **✅ RGPD + Bloctel + hours**    |
| Gamification            | ❌                  | ❌                      | ❌                      | ❌                   | ❌                           | **✅ Combo V1 (unique)**         |
| Salesforce-native       | Via integration     | Via integration         | ✅ Native               | ✅ Native            | ✅ Native                    | **✅ Native (existing adapter)** |

### XOS Differentiation Strategy:

1. **Salesforce-native prospecting**: not an integration — the CRM IS the list builder, the disposition target, the reporting source. Zero sync lag.
2. **Gamification layer**: no competitor has XP/badges/streaks for prospecting. This drives adoption and consistency.
3. **French compliance built-in**: Bloctel, calling hours, RGPD recording consent — not afterthoughts, not US-centric DNC.
4. **Autonomy levels**: rep chooses how much the tool does. Start assisted, graduate to autonomous. No competitor offers this spectrum.
5. **Launcher-first UX**: Cmd+K → "Nouvelle session" → dialing in <15 seconds. No competitor has a command-palette-first workflow.

---

## 10. Implementation Priority (Suggested Phases)

### Phase 1: Session Foundation (2-3 weeks)

- Session entity + lifecycle (draft → active → paused → completed)
- List builder from Salesforce SOQL filters
- Session config panel (parallel lines, caller ID, ACW duration)
- Sequential dialer upgrade → parallel (3 lines)
- Session HUD (queued/dialed/connected/avg duration)
- Basic disposition codes → Salesforce logging

### Phase 2: Parallel + AI (3-4 weeks)

- 5-line parallel dialing with contact card grid
- Voicemail detection + auto-skip
- One-click voicemail drop
- AI call transcription + summary (custom prompts)
- ACW overlay with disposition + AI summary review
- Disposition → automation mapping (SMS, follow-up task)

### Phase 3: Manager + Compliance (2-3 weeks)

- Manager live session board
- Session funnel visualization
- Rep leaderboard (real-time)
- AI call scoring
- RGPD compliance panel (recording consent, data retention)
- Bloctel integration
- French calling hours enforcement

### Phase 4: Gamification + Polish (2-3 weeks)

- Combo V1 integration: XP events, badges, streaks for prospecting
- Team XP leaderboard in manager view
- Enrichment pipeline (Dropcontact/Kaspr)
- Chrome extension for number scraping
- Session templates (save config as reusable template)
- Keyboard shortcuts for in-session actions (1-5 for disposition, N for next, V for voicemail drop)
