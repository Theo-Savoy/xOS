-- 033_drop_legacy_notification_leftovers.sql
-- Remove two prod-only leftovers from the pre-history timestamp migrations
-- (audit 2026-07-16 §3.3): an unused realtime-style authorization helper and
-- a duplicate of the user_notifications_select policy.
drop policy if exists "user sees own notifications" on public.user_notifications;
drop function if exists public.authorize_user_notifications(text);
