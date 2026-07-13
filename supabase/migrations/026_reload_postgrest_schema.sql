-- 026_reload_postgrest_schema.sql
-- Run this AFTER 021_cleaner_v2.sql has been applied. This fixes PostgREST
-- schema-cache misses like "Could not find a relationship between action_journal
-- and cleaner_action_targets".

NOTIFY pgrst, 'reload schema';
