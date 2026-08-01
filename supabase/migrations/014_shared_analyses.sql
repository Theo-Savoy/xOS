-- 014_shared_analyses.sql — Shared analyses for Vigie (Business Review).
-- Manager shares a period/config snapshot; commercials see shared analyses only.

create table if not exists public.shared_analyses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete set null,  -- null = broadcast to all
  config jsonb not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by recipient or broadcast
create index if not exists idx_shared_analyses_recipient
  on public.shared_analyses (recipient_id);
create index if not exists idx_shared_analyses_created_by
  on public.shared_analyses (created_by);

-- RLS: service-role bypasses; app uses service-role key server-side only.
alter table public.shared_analyses enable row level security;

-- No direct client access — all reads/writes go through /api/review (service-role).
-- Explicitly deny anon + authenticated to prevent bypass.
create policy "deny_all" on public.shared_analyses
  for all using (false) with check (false);
