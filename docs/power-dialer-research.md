# Power Dialer Research: Minari vs Flunter

_Research date: July 2026 | Context: French sales team (4 reps + 1 manager), Salesforce CRM_

---

## Comparison Table

| Dimension                 | **Minari** (minari.ai)                                                                             | **Flunter** (flunter.com)                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Parallel dialing**      | Up to 5 simultaneous calls                                                                         | Up to 5 (Starter: 3, Hunter/Pro: 5)                                      |
| **AI answer detection**   | ✅ Yes — auto-skips voicemails, no-answers, wrong numbers                                          | ✅ Yes — voicemail detection, auto-skip to next call                     |
| **Auto-voicemail drop**   | ✅ Yes                                                                                             | ❌ Not mentioned (voicemail personalization "coming soon")               |
| **Call recording**        | ✅ Yes                                                                                             | ✅ Yes                                                                   |
| **Transcription**         | ✅ Yes                                                                                             | ✅ Yes                                                                   |
| **AI call summaries**     | ✅ Yes — recordings + transcripts + AI summaries pushed to CRM                                     | ❌ "À venir prochainement" (coming soon)                                 |
| **Sentiment analysis**    | Not explicitly listed; integrates with Praiz/Modjo for call coaching                               | ❌ Not available                                                         |
| **Next-step suggestions** | Not explicitly listed                                                                              | ❌ Not available                                                         |
| **CRM sync**              | Bi-directional, auto-logged calls/recordings/transcripts/AI summaries                              | CRM sync available (HubSpot, Pipedrive, Salesforce, Close, BoondManager) |
| **Salesforce depth**      | ✅ Deep: choose which fields to display, edit CRM fields mid-call, auto-log activities, 2-way sync | ✅ Listed as integration; depth unclear (newer integration)              |
| **Contact enrichment**    | ✅ Built-in waterfall enrichment (multiple providers, intl mobile + email)                         | ✅ Hand-collected lead files (premium add-on, 48h delivery)              |
| **CSV import**            | ✅ Auto field mapping                                                                              | ✅ Drag & drop                                                           |
| **SMS**                   | ✅ Yes                                                                                             | ❌ Not mentioned                                                         |
| **Phone numbers**         | 3 per user                                                                                         | 2–3 per user (plan-dependent)                                            |
| **Virtual Salesfloor**    | ✅ Yes                                                                                             | ❌ Not mentioned                                                         |
| **Manager dashboard**     | ✅ Built-in (calls, connect rates, meetings, revenue per rep/session)                              | ✅ Add-on (+39€/month)                                                   |
| **Webhooks / API**        | ✅ Real-time webhooks (connected calls, transcriptions, recordings) → n8n, Make, Zapier            | ❌ Not mentioned                                                         |
| **Coaching integrations** | ✅ Praiz, Modjo (call analysis, coaching)                                                          | ❌ "Coaching en temps réel" coming soon                                  |
| **Pricing model**         | Single all-inclusive plan (~100 calls/h/rep)                                                       | Tiered: Starter 89€, Hunter 159€, Pro 249€ /license/mo                   |
| **Call volume**           | Unlimited                                                                                          | Starter: 400 connected, Hunter: 1,000, Pro: unlimited (25k cap)          |
| **Origin**                | 🇫🇷 French (200+ orgs)                                                                              | 🇫🇷 French (200+ B2B teams)                                               |

---

## UX Flow: What the Rep Sees

### Minari

1. **Import** → CSV upload or CRM list pull; auto field mapping
2. **Enrich** → Waterfall enrichment fills missing mobile numbers in-platform
3. **Session config** → Select list, choose caller ID, set parallelism (up to 5)
4. **Dialing session** → Rep sees a contact card with CRM fields displayed alongside the call. System dials 5 at once; the moment someone picks up, rep is connected. Voicemails/no-answers auto-skipped. Rep can edit CRM fields mid-call.
5. **Post-call** → Recording + transcript + AI summary auto-pushed to CRM. No manual logging.
6. **Analytics** → Manager sees per-rep, per-session dashboards: calls, connect rate, meetings booked, revenue.

### Flunter

1. **Import** → CSV drag & drop or CRM connection
2. **Session config** → 3 clicks: choose number, set simultaneous calls, hit "Lancer"
3. **Dialing session** → Rep sees a live panel showing all 5 parallel calls with status badges: "Appel en cours", "Message vocal laissé", "Pas de réponse", "Appel abandonné". First answer connects; others auto-dropped. Voicemail detected → instant skip, zero clicks.
4. **Post-call** → Recording + transcription saved. AI summaries coming soon.
5. **Analytics** → KPI tracking; Manager dashboard available as add-on.

---

## AI Features Deep Dive

| Feature                                  | Minari                        | Flunter          |
| ---------------------------------------- | ----------------------------- | ---------------- |
| AI answer detection (voicemail vs human) | ✅ Production                 | ✅ Production    |
| Auto-transcription                       | ✅ Production                 | ✅ Production    |
| AI call summaries                        | ✅ Production — synced to CRM | ❌ Coming soon   |
| Sentiment analysis                       | Via Praiz/Modjo integration   | ❌               |
| Next-step suggestions                    | Not explicit                  | ❌               |
| Real-time coaching                       | Via Modjo/Praiz               | ❌ "Coming soon" |
| Personalized voicemail                   | ✅ Auto-voicemail drop        | ❌ Coming soon   |

**Key takeaway**: Minari is 12–18 months ahead on AI. Flunter's AI is all "à venir prochainement."

---

## Salesforce Integration Depth

### Minari

- **Bi-directional sync**: CRM fields readable AND editable from within Minari during a call
- **Auto-logging**: Calls, recordings, transcripts, AI summaries all pushed to Salesforce automatically
- **Field mapping**: Choose which Salesforce fields to surface in the dialer UI
- **Activities**: Call activities auto-created in Salesforce
- **Webhooks**: Real-time events for custom Salesforce automation (via n8n/Make/Zapier or direct)
- **SEP sync**: Also syncs with Sales Engagement Platforms

### Flunter

- **Salesforce listed** as a supported CRM integration
- **Depth unclear**: Newer integration; no public documentation on field-level mapping, bi-directional sync, or auto-logging of recordings/transcripts
- **No webhooks/API** documented — likely manual or basic sync

**Verdict**: Minari's Salesforce integration is significantly deeper and better documented.

---

## What Makes Them Different from a Basic Sequential Dialer

| Capability         | Sequential Dialer (current app)                     | Parallel Dialer (Minari/Flunter)                                |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| Calls per hour     | ~15–20 (manual dial, wait, log, next)               | ~100 (Minari) / ~23 connected (Flunter)                         |
| Dead time          | 80% on rings, voicemails, no-answers                | Near-zero — auto-skip non-answers                               |
| Rep cognitive load | High: dial → wait → listen → hang up → log → repeat | Low: system handles dialing/skipping; rep only talks on connect |
| CRM logging        | Manual after each call                              | Automatic (recordings, transcripts, summaries)                  |
| Voicemail handling | Rep listens, decides, hangs up                      | Auto-detected, auto-dropped or auto-left                        |
| Session analytics  | Basic call count                                    | Per-rep connect rate, meetings, revenue, session-level          |
| Enrichment         | Separate tool                                       | Built-in (Minari) or add-on (Flunter)                           |

**The core value prop**: Parallel dialing eliminates the 80% dead time in cold calling. A rep goes from 4 conversations/hour to 15–20. The AI layer (Minari) then eliminates post-call admin work.

---

## Key UX Patterns Worth Adopting

### 1. **Live Parallel Call Status Panel** (from Flunter)

Show all N parallel calls simultaneously with real-time status badges:

- 🟢 "Appel en cours" (ringing)
- 🔴 "Pas de réponse" (no answer)
- 📼 "Message vocal laissé" (voicemail left)
- ❌ "Appel abandonné" (dropped)
- 🟢 "Décroché" (connected — highlighted)

This gives the rep spatial awareness of what's happening across all lines.

### 2. **Zero-Click Voicemail Skip** (both)

When voicemail is detected, the system auto-advances to the next call. No rep action needed. The rep never hears a voicemail beep. This is the single biggest time-saver.

### 3. **CRM Fields Inline During Call** (from Minari)

Surface key Salesforce fields (company, title, last activity, deal stage) directly in the call view. Allow editing fields mid-call without switching tabs. This eliminates the "alt-tab to Salesforce" workflow.

### 4. **Auto-Log Everything Post-Call** (from Minari)

After a call ends, automatically push to Salesforce:

- Call recording
- Transcript
- AI-generated summary
- Call outcome/disposition
- Duration, timestamp

The rep should never manually create a call log.

### 5. **Session-Based Workflow** (both)

Frame the work as a "calling session" with a clear start/end:

- Pre-session: select list, configure parallelism, choose caller ID
- During: live dashboard with calls made, connected, voicemails skipped
- Post-session: summary stats, recordings, follow-up tasks auto-created

### 6. **Manager Dashboard with Per-Rep Metrics** (from Minari)

Track per rep, per session:

- Calls attempted / connected / voicemail / no-answer
- Connect rate
- Meetings booked
- Revenue attributed
- Session duration and efficiency

### 7. **Waterfall Enrichment In-Platform** (from Minari)

Before dialing, automatically enrich contacts with verified mobile numbers from multiple providers. No separate tool, no manual lookup. Import → enrich → call in one flow.

### 8. **Caller ID Selection** (both)

Let reps choose which phone number is displayed. Critical for French teams (local numbers get higher pickup rates than unknown mobile numbers).

---

## Recommendations for Our Power Dialer

Given our context (4 reps + 1 manager, Salesforce, French market):

1. **Start with parallel dialing (3 lines)** — matches Flunter Starter. 3 is enough to eliminate dead time without overwhelming a small team. Make it configurable up to 5.

2. **Voicemail detection is table stakes** — without it, parallel dialing just means 5 voicemails at once instead of 1. Use an AMD (Answering Machine Detection) API.

3. **AI post-call notes are the differentiator** — Minari has this, Flunter doesn't. Auto-transcribe → AI summary → push to Salesforce as a note. This is the feature that saves 10+ min/rep/day.

4. **Salesforce integration must be deep** — bi-directional field sync, auto-logged activities, inline CRM fields during call. Don't build a shallow "connected" badge.

5. **Session analytics for the manager** — the manager needs to see connect rates, meetings booked, and rep comparisons without building reports.

6. **Skip the virtual salesfloor** — 4 reps don't need it. Focus on the core dialing + AI + CRM loop.

7. **French compliance** — both tools are French and handle RGPD. Ensure our dialer respects French cold-calling regulations (no calls before 10h or after 20h, honor opt-out lists).
