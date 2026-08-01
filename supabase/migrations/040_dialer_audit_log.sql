-- 040_dialer_audit_log.sql — Exhaustive audit log for every Telnyx action.
-- Required for: cost reconciliation, abuse detection, post-mortem on incidents.
-- Conservation 90 days min (RGPD-friendly). Exportable to cold storage after.

create table if not exists public.dialer_audit_log (
  id              bigserial primary key,
  ts             timestamptz not null default now(),
  actor_user_id   uuid references public.profiles(id) on delete set null,
  actor_kind      text not null
                  check (actor_kind in ('user', 'system', 'webhook', 'cron')),
  action          text not null,                -- dial, hangup, recording_start, recording_download, summarize, crm_write, settings_update
  payload         jsonb not null default '{}'::jsonb,
  cost_cents      int not null default 0,
  result          text not null
                  check (result in ('success', 'failed', 'rate_limited', 'budget_exceeded', 'dry_run', 'invalid_request', 'auth_failed')),
  error_code      text,
  campaign_id     bigint references public.dialer_campaigns(id) on delete set null,
  call_id         bigint references public.dialer_calls(id) on delete set null,
  duration_ms     int,
  metadata        jsonb not null default '{}'::jsonb  -- env, dry_run, ip, ua, etc.
);

create index if not exists idx_dialer_audit_log_actor_ts
  on public.dialer_audit_log (actor_user_id, ts desc);
create index if not exists idx_dialer_audit_log_action_ts
  on public.dialer_audit_log (action, ts desc);
create index if not exists idx_dialer_audit_log_result_ts
  on public.dialer_audit_log (result, ts desc);
create index if not exists idx_dialer_audit_log_campaign
  on public.dialer_audit_log (campaign_id) where campaign_id is not null;

-- RLS: deny all direct — service-role only. Read access via api/dialer?resource=audit.
alter table public.dialer_audit_log enable row level security;
create policy "deny_all" on public.dialer_audit_log
  for all using (false) with check (false);