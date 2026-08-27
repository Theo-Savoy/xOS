-- 001_campaign_contacts.sql
-- Leadjimé #74 — modèle de contacts local Combo-only.
-- Source locale canonique (import CSV), le CRM devient optionnel :
-- call_session_contacts.sf_contact_id passe nullable et reçoit
-- campaign_contact_id / external_source_id comme identité alternative.

-- ============================================================
-- 1. csv_imports
-- ============================================================
create table public.csv_imports (
  id             bigint generated always as identity primary key,
  uploaded_by    uuid not null references public.profiles(id) on delete cascade,
  file_name      text not null,
  row_count      int not null default 0,
  dedupe_count   int not null default 0,
  invalid_count  int not null default 0,
  status         text not null default 'ready' check (status in ('ready','failed')),
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 2. campaign_contacts
-- ============================================================
create table public.campaign_contacts (
  id                 bigint generated always as identity primary key,
  csv_import_id      bigint references public.csv_imports(id) on delete set null,
  source_row_number  int,
  company_name       text,
  contact_name       text not null,
  title              text,
  phone_raw          text,
  phone_e164         text,
  email              text,
  linkedin_url       text,
  tags               jsonb not null default '[]'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  external_source_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint campaign_contacts_source_unique
    unique (csv_import_id, source_row_number)
);
create index idx_campaign_contacts_external on public.campaign_contacts (external_source_id);

-- ============================================================
-- 3. Pont vers le chemin de séances existant
-- ============================================================
alter table public.call_session_contacts alter column sf_contact_id drop not null;
alter table public.call_session_contacts
  add column if not exists campaign_contact_id bigint references public.campaign_contacts(id) on delete set null,
  add column if not exists external_source_id text;
create index if not exists idx_call_session_contacts_ext on public.call_session_contacts (coalesce(external_source_id, campaign_contact_id::text));

-- Identité du contact : au moins une des deux clés (locale ou CRM).
alter table public.call_session_contacts
  add constraint call_session_contacts_identity
  check (
    sf_contact_id is not null
    or campaign_contact_id is not null
    or external_source_id is not null
  );

-- ============================================================
-- RLS : même modèle que call_session_contacts (004) —
-- select = authenticated, écritures = service-role via API.
-- ============================================================
alter table public.csv_imports enable row level security;
alter table public.campaign_contacts enable row level security;

create policy "csv_imports_select" on public.csv_imports
  for select to authenticated using (true);

create policy "campaign_contacts_select" on public.campaign_contacts
  for select to authenticated using (true);
