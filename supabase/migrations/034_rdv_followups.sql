-- 034_rdv_followups.sql
-- Suivi des RDV : statut + compte-rendu, lié à l'Event Salesforce.

create table if not exists public.rdv_followups (
  id bigint generated always as identity primary key,
  sf_event_id text not null unique,
  status text not null default 'a_venir'
    check (status in ('a_venir', 'effectue', 'annule', 'no_show')),
  notes text,
  reported_by uuid references public.profiles(id),
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rdv_followups is
  'Suivi post-RDV : statut (effectué/annulé/no-show) et compte-rendu, lié à l''Event SF.';

-- RLS : service role uniquement (accès via API serverless).
alter table public.rdv_followups enable row level security;

create policy "service role full access"
  on public.rdv_followups
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
