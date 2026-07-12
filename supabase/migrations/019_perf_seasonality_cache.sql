-- 019_perf_seasonality_cache.sql
-- Cache org des poids mensuels (agrégat SF 3 ans) — donnée quasi figée.

create table if not exists public.perf_seasonality_cache (
  id text primary key default 'default',
  as_of date not null,
  sample_from date not null,
  sample_to date not null,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

alter table public.perf_seasonality_cache enable row level security;

create policy "perf_seasonality_cache_select" on public.perf_seasonality_cache
  for select to authenticated using (true);
