-- 029_notification_dedupe.sql
-- Prevent duplicate goal/session notifications when a client retries a request.

alter table public.user_notifications
  add column if not exists dedupe_key text;

create unique index if not exists idx_user_notifications_recipient_dedupe
  on public.user_notifications (recipient_id, dedupe_key);
