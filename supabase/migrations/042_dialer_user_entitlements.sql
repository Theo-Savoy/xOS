-- 042_dialer_user_entitlements.sql — per-user dialer entitlements (budget & call caps).
--
-- APPLIED DIRECTLY TO THE REMOTE (xos-portal) WITHOUT A COMMITTED FILE
-- (observed 2026-08-03: migration list shows 042 applied, file missing from
-- repo). Reconstituted from the live schema so the repo matches the remote.
-- Idempotent: safe to re-run.
--
-- One row per user. The reserve_budget RPC reads these caps to gate dials.

create table if not exists public.dialer_user_entitlements (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  enabled              boolean not null default false,
  dry_run              boolean not null default true,
  telnyx_credential_id text,
  budget_day_cents     integer not null default 1000 check (budget_day_cents > 0),
  calls_day_limit      integer not null default 50 check (calls_day_limit > 0),
  calls_month_limit    integer not null default 500 check (calls_month_limit > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles(id) on delete set null
);

-- RLS: deny all direct — service-role / RPC only.
alter table public.dialer_user_entitlements enable row level security;
create policy "deny_all" on public.dialer_user_entitlements
  for all using (false) with check (false);

-- 042b — dialer_phone_numbers (lives in the same applied batch on the remote).
-- Number pool for outbound caller IDs.

create table if not exists public.dialer_phone_numbers (
  id            bigserial primary key,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  e164          text not null unique check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  label         text,
  status        text not null default 'active'
                check (status in ('active', 'cooldown', 'disabled')),
  priority      smallint not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dialer_phone_numbers_owner_status
  on public.dialer_phone_numbers (owner_user_id, status);

alter table public.dialer_phone_numbers enable row level security;
create policy "deny_all" on public.dialer_phone_numbers
  for all using (false) with check (false);
