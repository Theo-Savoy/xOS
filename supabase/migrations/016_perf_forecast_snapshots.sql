-- 016_perf_forecast_snapshots.sql
-- Snapshots lundi du forecast / signé par commercial (Effort Weekly Perf).

create table if not exists public.perf_forecast_snapshots (
  week_start date not null,
  sf_user_id text not null,
  quarter text not null,
  forecast numeric not null default 0,
  signed_to_date numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (week_start, sf_user_id)
);

create index if not exists perf_forecast_snapshots_quarter_idx
  on public.perf_forecast_snapshots (quarter, week_start);

alter table public.perf_forecast_snapshots enable row level security;

-- Lecture authentifiée (mêmes règles que settings) ; écriture via service-role uniquement.
create policy "perf_forecast_snapshots_select" on public.perf_forecast_snapshots
  for select to authenticated using (true);
