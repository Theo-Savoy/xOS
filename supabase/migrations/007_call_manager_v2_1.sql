-- Call Manager v2.1: enriched contact fields + optional session date
alter table public.call_session_contacts
  add column if not exists title text,
  add column if not exists linkedin_url text;

alter table public.call_sessions
  add column if not exists scheduled_for date;
