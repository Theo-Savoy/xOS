-- 021_cleaner_v2.sql
-- Labo Cleaner v2: Supabase journal, command reservations and normalized targets.

-- Existing producers keep working because their historical columns remain and
-- all new metadata has safe defaults. Only legacy_blob imports may omit actor.
alter table public.action_journal
  alter column actor drop not null;

alter table public.action_journal
  add column if not exists actor_label text,
  add column if not exists source text not null default 'legacy_api',
  add column if not exists source_id text,
  add column if not exists module_id text,
  add column if not exists command_id bigint,
  add column if not exists idempotency_key text;

alter table public.action_journal
  drop constraint if exists action_journal_actor_check;

alter table public.action_journal
  add constraint action_journal_actor_check
  check (actor is not null or source = 'legacy_blob');

create unique index if not exists idx_action_journal_source_source_id
  on public.action_journal (source, source_id)
  where source_id is not null;

create index if not exists idx_action_journal_module_at
  on public.action_journal (module_id, at desc, id desc);

create index if not exists idx_action_journal_actor_at
  on public.action_journal (actor, at desc, id desc);

create table if not exists public.cleaner_commands (
  id              bigint generated always as identity primary key,
  actor           uuid not null references public.profiles(id),
  module_id       text not null default 'opportunities',
  idempotency_key text not null,
  fingerprint     text not null,
  status          text not null default 'reserved'
    check (status in ('reserved', 'running', 'succeeded', 'partial', 'failed', 'expired')),
  preview         jsonb not null default '{}'::jsonb,
  expires_at      timestamptz,
  result          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (actor, idempotency_key)
);

create index if not exists idx_cleaner_commands_actor_created
  on public.cleaner_commands (actor, created_at desc);

create index if not exists idx_cleaner_commands_status_expiry
  on public.cleaner_commands (status, expires_at);

alter table public.action_journal
  drop constraint if exists action_journal_command_id_fkey;

alter table public.action_journal
  add constraint action_journal_command_id_fkey
  foreign key (command_id) references public.cleaner_commands(id);

create table if not exists public.cleaner_action_targets (
  id                 bigint generated always as identity primary key,
  action_journal_id  bigint not null references public.action_journal(id) on delete cascade,
  object_type        text not null,
  sf_record_id       text not null,
  sf_owner_id        text,
  before_state       jsonb not null default '{}'::jsonb,
  after_state        jsonb not null default '{}'::jsonb,
  success            boolean not null default false,
  error              text,
  created_at         timestamptz not null default now(),
  unique (action_journal_id, object_type, sf_record_id)
);

-- After applying this migration, reload PostgREST's relationship cache with
-- `NOTIFY pgrst, 'reload schema';` or by applying 026_reload_postgrest_schema.sql.

create index if not exists idx_cleaner_action_targets_owner
  on public.cleaner_action_targets (sf_owner_id, created_at desc);

create index if not exists idx_cleaner_action_targets_journal
  on public.cleaner_action_targets (action_journal_id, id);

create index if not exists idx_cleaner_action_targets_object
  on public.cleaner_action_targets (object_type, sf_record_id);

alter table public.cleaner_commands enable row level security;
alter table public.cleaner_action_targets enable row level security;

-- SECURITY DEFINER avoids a policy cycle between action_journal and its
-- normalized target relation while preserving the actor-less import mask.
create or replace function public.cleaner_target_has_actor(p_journal_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.action_journal j
    where j.id = p_journal_id and j.actor is not null
  );
$$;

revoke all on function public.cleaner_target_has_actor(bigint) from public;
grant execute on function public.cleaner_target_has_actor(bigint) to authenticated, service_role;

-- Replace the initial broad action_journal read policy with role/owner scope.
drop policy if exists action_journal_select on public.action_journal;
create policy action_journal_select on public.action_journal
  for select to authenticated using (
    actor = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('manager', 'admin')
    )
    or exists (
      select 1
      from public.cleaner_action_targets t
      join public.profiles p on p.sf_user_id = t.sf_owner_id
      where t.action_journal_id = public.action_journal.id
        and public.action_journal.actor is not null
        and p.id = auth.uid()
        and p.role = 'commercial'
    )
  );

drop policy if exists cleaner_commands_select on public.cleaner_commands;
create policy cleaner_commands_select on public.cleaner_commands
  for select to authenticated using (
    actor = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('manager', 'admin')
    )
  );

drop policy if exists cleaner_action_targets_select on public.cleaner_action_targets;
create policy cleaner_action_targets_select on public.cleaner_action_targets
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('manager', 'admin')
    )
    or (
      sf_owner_id = (select p.sf_user_id from public.profiles p where p.id = auth.uid())
      and public.cleaner_target_has_actor(action_journal_id)
    )
  );

-- All command/journal/target writes use the server-side service client. The
-- application validates actor/idempotency; service_role policies only define
-- the database boundary and never grant direct authenticated writes.
create policy cleaner_commands_service_write on public.cleaner_commands
  for all to service_role using (true) with check (true);

create policy cleaner_action_targets_service_write on public.cleaner_action_targets
  for all to service_role using (true) with check (true);

-- Existing journal write policies remain service-role-only. Re-state the
-- insert check so actor-less rows cannot be created outside legacy imports.
drop policy if exists action_journal_insert on public.action_journal;
create policy action_journal_insert on public.action_journal
  for insert to service_role with check (actor is not null or source = 'legacy_blob');
