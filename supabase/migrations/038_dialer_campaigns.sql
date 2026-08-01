-- 038_dialer_campaigns.sql — Power dialer campaign + individual call state.
-- Spec: docs/specs/combo-prospection-autonome.md §4.

create table if not exists public.dialer_campaigns (
  id            bigserial primary key,
  session_id    bigint references public.call_sessions(id) on delete set null,
  parallelism   int not null default 3 check (parallelism between 1 and 5),
  status        text not null default 'idle'
                check (status in ('idle', 'dialing', 'active', 'paused', 'done', 'cancelled')),
  rep_phone     text not null,                  -- commercial's PSTN callback number
  caller_id     text,                            -- Telnyx outbound number (config Hub)
  started_at    timestamptz,
  ended_at      timestamptz,
  stats         jsonb not null default '{}'::jsonb,  -- tentative, connected, conversations, rdv, cost_cents
  cost_cents    int not null default 0,          -- denormalized running cost
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dialer_campaigns_session
  on public.dialer_campaigns (session_id);
create index if not exists idx_dialer_campaigns_status_created
  on public.dialer_campaigns (status, created_at desc);
create index if not exists idx_dialer_campaigns_created_by
  on public.dialer_campaigns (created_by);

create table if not exists public.dialer_calls (
  id              bigserial primary key,
  campaign_id     bigint not null references public.dialer_campaigns(id) on delete cascade,
  contact_id      bigint references public.call_session_contacts(id) on delete set null,
  telnyx_call_id  text,                          -- Telnyx Call Control ID
  telnyx_leg_id   text,                          -- Telnyx Leg ID (sub-resource)
  status          text not null default 'queued'
                  check (status in (
                    'queued', 'dialing', 'ringing', 'answered', 'bridged',
                    'voicemail', 'no_answer', 'busy', 'failed', 'ended'
                  )),
  amd_result      text
                  check (amd_result in ('human_business', 'machine', 'silence', 'fax')),
  to_number       text not null,
  started_at      timestamptz,
  answered_at     timestamptz,
  bridged_at      timestamptz,
  ended_at        timestamptz,
  duration_sec    int,
  hangup_cause    text,
  recording_path  text,                          -- Supabase Storage path
  transcript      text,
  transcript_json jsonb,
  ai_summary      text,
  ai_disposition  text,                          -- Resultat_call__c suggested
  ai_next_step    text,
  ai_sentiment    text check (ai_sentiment in ('positive', 'neutral', 'negative')),
  sf_task_id      text,
  sf_event_id     text,
  cost_cents      int not null default 0,
  logged_by       uuid references public.profiles(id) on delete set null,
  logged_at       timestamptz,
  created_at      timestamptz not null default now()
);

-- Idempotency: Telnyx call_leg_id + status transitions must be unique per campaign.
-- Multiple events for same leg are stored as a history, but the active row is one.
create unique index if not exists uq_dialer_calls_campaign_leg
  on public.dialer_calls (campaign_id, telnyx_leg_id)
  where telnyx_leg_id is not null;

create index if not exists idx_dialer_calls_campaign_status
  on public.dialer_calls (campaign_id, status);
create index if not exists idx_dialer_calls_contact
  on public.dialer_calls (contact_id);
create index if not exists idx_dialer_calls_telnyx_call_id
  on public.dialer_calls (telnyx_call_id)
  where telnyx_call_id is not null;

-- RLS: deny all direct access — only service-role (api/dialer.js) writes.
alter table public.dialer_campaigns enable row level security;
alter table public.dialer_calls      enable row level security;

create policy "deny_all" on public.dialer_campaigns
  for all using (false) with check (false);
create policy "deny_all" on public.dialer_calls
  for all using (false) with check (false);