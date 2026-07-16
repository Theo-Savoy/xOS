-- 029_lock_rls_service_role_tables.sql
-- Sécurité : fermer l'accès PostgREST anon/authenticated aux tables qui ne sont
-- accédées QUE via l'API service-role (aucun `supabase.from(...)` côté front).
--
-- Contexte : l'API (api/*) utilise SUPABASE_SERVICE_ROLE_KEY, qui CONTOURNE RLS,
-- et scope l'accès à la main (owner / membership / rôle). Les policies
-- `for select ... using (true)` laissaient toutefois n'importe quel utilisateur
-- authentifié lire toutes les lignes directement via la clé anon + son JWT,
-- exfiltrant l'intégralité des contacts prospects (nom, téléphone, email), des
-- séances, presets et données de perf — sans passer par l'API ni laisser de
-- trace dans action_journal.
--
-- Même pattern que 015_salesforce_user_oauth.sql (revoke select) : on retire ces
-- tables de la surface PostgREST authentifiée. Le service-role garde tous ses
-- droits, donc l'application continue de fonctionner sans changement.

-- call_session_contacts : PII prospects (contact_name, phone, email).
drop policy if exists "call_session_contacts_select" on public.call_session_contacts;
revoke select on public.call_session_contacts from anon, authenticated;

-- call_sessions : séances de prospection de toute l'équipe.
drop policy if exists "call_sessions_select" on public.call_sessions;
revoke select on public.call_sessions from anon, authenticated;

-- call_session_members : qui partage quelle séance avec qui.
drop policy if exists "call_session_members_select" on public.call_session_members;
revoke select on public.call_session_members from anon, authenticated;

-- call_target_presets : stratégie de ciblage commercial.
drop policy if exists "call_target_presets_select" on public.call_target_presets;
revoke select on public.call_target_presets from anon, authenticated;

-- perf_* : perfs individuelles / prévisions de chaque commercial.
drop policy if exists "perf_forecast_snapshots_select" on public.perf_forecast_snapshots;
revoke select on public.perf_forecast_snapshots from anon, authenticated;

drop policy if exists "perf_week_snapshots_select" on public.perf_week_snapshots;
revoke select on public.perf_week_snapshots from anon, authenticated;

drop policy if exists "perf_seasonality_cache_select" on public.perf_seasonality_cache;
revoke select on public.perf_seasonality_cache from anon, authenticated;

-- recette_journal : journal des recettes Cleaner (lu via API uniquement).
drop policy if exists "Authenticated users can read recette journal" on public.recette_journal;
revoke select on public.recette_journal from anon, authenticated;
