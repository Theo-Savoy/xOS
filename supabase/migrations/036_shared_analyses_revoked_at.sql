-- 036_shared_analyses_revoked_at.sql — Add soft-delete column for shared analyses.
-- Fixes Bilan P0: shared.js references revoked_at but 035 didn't create it.
-- Originally filed as 015 — renumbered to 036 after audit (avoid collision with
-- 015_salesforce_user_oauth.sql). The original migration (035_shared_analyses.sql)
-- created the table without revoked_at; this file backfills the column.
--
-- IMPORTANT: this migration must be applied manually. The Supabase deployment script
-- does not auto-apply — verify with \d public.shared_analyses after running.

alter table public.shared_analyses
  add column if not exists revoked_at timestamptz;

create index if not exists idx_shared_analyses_active
  on public.shared_analyses (recipient_id, created_at desc)
  where revoked_at is null;
