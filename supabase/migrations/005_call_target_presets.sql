-- 005_call_target_presets.sql
create table public.call_target_presets (
  id         bigint generated always as identity primary key,
  owner      uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  filters    jsonb not null,
  shared     boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.call_target_presets enable row level security;

create policy "call_target_presets_select" on public.call_target_presets
  for select to authenticated using (true);

create policy "call_target_presets_insert" on public.call_target_presets
  for insert to service_role with check (true);

create policy "call_target_presets_update" on public.call_target_presets
  for update to service_role using (true);

create policy "call_target_presets_delete" on public.call_target_presets
  for delete to service_role using (true);
