-- 041_dialer_budget_reservations.sql — atomic budget reservation ledger.
--
-- APPLIED DIRECTLY TO THE REMOTE (xos-portal) WITHOUT A COMMITTED FILE
-- (observed 2026-08-03: migration list shows 041 applied, file missing from
-- repo). Reconstituted from the live schema so the repo matches the remote.
-- Idempotent: safe to re-run; the remote already has this object.
--
-- This table backs the dialer_reserve_budget() RPC: every dial reserves the
-- estimated cost atomically (advisory lock + insert), so concurrent dials
-- cannot double-spend the same budget cap.

create table if not exists public.dialer_budget_reservations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  campaign_id           bigint references public.dialer_campaigns(id) on delete cascade,
  estimated_cost_cents  integer not null check (estimated_cost_cents > 0),
  status                text not null default 'reserved'
                        check (status in ('reserved', 'consumed', 'released', 'expired')),
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '5 minutes',
  released_at           timestamptz
);

create index if not exists idx_dialer_budget_reservations_user_created
  on public.dialer_budget_reservations (user_id, created_at desc);
create index if not exists idx_dialer_budget_reservations_campaign
  on public.dialer_budget_reservations (campaign_id) where campaign_id is not null;
create index if not exists idx_dialer_budget_reservations_status_expires
  on public.dialer_budget_reservations (status, expires_at);

-- RLS: deny all direct — service-role / RPC only.
alter table public.dialer_budget_reservations enable row level security;
create policy "deny_all" on public.dialer_budget_reservations
  for all using (false) with check (false);
