-- 039_dialer_webhook_events.sql — Idempotency table for incoming Telnyx webhooks.
-- Prevents double-processing if Telnyx retries or if our endpoint is hit twice.
-- Cron reconciliation (jobs Vercel) re-tries events stuck in 'pending' after 5min.

create table if not exists public.dialer_webhook_events (
  event_id        text primary key,             -- Telnyx event ID (or deterministic hash if absent)
  event_type      text not null,                -- call.initiated, call.answered, call.bridged, etc.
  campaign_id     bigint references public.dialer_campaigns(id) on delete cascade,
  call_id         bigint references public.dialer_calls(id) on delete cascade,
  payload         jsonb not null,              -- raw event body
  signature_ok    boolean not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  status          text not null default 'pending'
                  check (status in ('pending', 'processed', 'failed', 'ignored', 'replay')),
  error_message   text,
  attempts        int not null default 0
);

create index if not exists idx_dialer_webhook_events_status_received
  on public.dialer_webhook_events (status, received_at);
create index if not exists idx_dialer_webhook_events_campaign
  on public.dialer_webhook_events (campaign_id);

-- RLS: deny all — service-role only.
alter table public.dialer_webhook_events enable row level security;
create policy "deny_all" on public.dialer_webhook_events
  for all using (false) with check (false);