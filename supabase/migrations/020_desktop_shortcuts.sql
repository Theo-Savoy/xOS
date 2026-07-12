-- 020_desktop_shortcuts.sql
-- Raccourcis épinglés sur le bureau XOS (ex: séance Call Manager)

create table public.desktop_shortcuts (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  app_id     text not null check (char_length(app_id) between 1 and 60),
  params     jsonb not null default '{}'::jsonb,
  label      text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now()
);

-- Un même raccourci (app + params) ne peut être épinglé qu'une fois par utilisateur.
create unique index idx_desktop_shortcuts_unique
  on public.desktop_shortcuts (owner, app_id, params);

alter table public.desktop_shortcuts enable row level security;

-- Donnée purement UI possédée par l'utilisateur : écriture directe depuis le
-- client, scopée par auth.uid() — pas besoin de passer par l'API service_role.
create policy "desktop_shortcuts_select" on public.desktop_shortcuts
  for select to authenticated using (owner = auth.uid());

create policy "desktop_shortcuts_insert" on public.desktop_shortcuts
  for insert to authenticated with check (owner = auth.uid());

create policy "desktop_shortcuts_delete" on public.desktop_shortcuts
  for delete to authenticated using (owner = auth.uid());
