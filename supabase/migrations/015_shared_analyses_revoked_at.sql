-- 015_shared_analyses_revoked_at.sql — Add soft-delete column for shared analyses.
-- Fixes Bilan P0: shared.js references revoked_at but 014 didn't create it.

alter table public.shared_analyses
  add column if not exists revoked_at timestamptz;

create index if not exists idx_shared_analyses_active
  on public.shared_analyses (recipient_id, created_at desc)
  where revoked_at is null;
