-- 037_dialer_feature_flags.sql — Telnyx dialer feature flags (kill switch).
-- All defaults are SAFE: dialer disabled, dry-run on. Opt-in per env / per user.

insert into public.settings (key, value, updated_at)
values
  ('dialer_enabled',         '"false"'::jsonb, now()),
  ('dialer_dry_run',         '"true"'::jsonb, now()),
  ('dialer_budget_session_cents', '300'::jsonb,  now()),
  ('dialer_budget_user_day_cents', '1000'::jsonb, now()),
  ('dialer_budget_org_month_cents', '15000'::jsonb, now()),
  ('dialer_rate_rps',         '5'::jsonb,  now()),
  ('dialer_rate_burst',       '20'::jsonb, now()),
  ('dialer_webhook_tolerance_sec', '300'::jsonb, now()),
  ('dialer_alert_threshold_pct',   '80'::jsonb, now())
on conflict (key) do nothing;

-- No RLS needed: settings are managed by service-role only (api/_config/access.js).
-- This migration is safe to re-run (idempotent insert with on conflict do nothing).