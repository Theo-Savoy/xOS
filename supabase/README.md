# Supabase migrations

## Production deployment

Apply migrations in filename order. `021_cleaner_v2.sql` and
`026_reload_postgrest_schema.sql` are a coupled pair: apply 021 first to create
the `cleaner_action_targets.action_journal_id` relationship, then run 026 once
with the Supabase SQL editor or CLI so PostgREST reloads its schema cache.

Do not apply 026 before 021; it is an additive `NOTIFY` and does not create or
modify any tables.
