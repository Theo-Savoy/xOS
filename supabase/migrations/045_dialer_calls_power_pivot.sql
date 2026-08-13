-- 045_dialer_calls_power_pivot.sql — Lot 11.7 : pivot de dialer_calls pour le
-- power dialing WebRTC (roadmap combo-power-dialing 2026-08-04).
--
-- Contexte : 038 a créé dialer_campaigns/dialer_calls pour le power dialing à
-- callback PSTN (spec v1). Le virage WebRTC (le navigateur EST le téléphone)
-- acte : 3 lignes en parallèle, click-to-call par cycle, skip non-réponse,
-- connect sur réponse humaine + hangup des autres, STOP après l'appel.
--
-- 1. campaign_id NULLABLE : un appel en flux depuis le Runner n'a pas de
--    campagne (lot-11.3 §2.3 point 2 — décision : nullable plutôt que
--    campagne implicite par session ; la campagne explicite arrivera avec le
--    SessionBuilderPower).
-- 2. SUPERSEDE 044 : l'index « 1 appel actif par user » et la contrainte
--    parallelism=1 ont été écrits (2026-08-03) pour la lecture « aucune
--    parallélisation possible » de l'ARCEP 2022-1583 §7.1.3. La décision
--    produit actée (2026-08-04, postérieure) est le power dialing parallèle
--    mono-utilisateur : chaque cycle est déclenché par un clic humain et le
--    commercial garde le rythme (standard B2B FR — Minari/Flunter), ce qui
--    sort du définition du « système automatisé ». 044 se déclarait elle-même
--    « à appliquer à la main quand la Phase B démarre » — elle ne l'a jamais
--    été. Les deux objets sont donc retirés ici s'ils existent.
-- 3. rep_phone (numéro PSTN de rappel du commercial) n'a plus de sens depuis
--    le virage WebRTC : default '' pour compatibilité (colonne NOT NULL).
--
-- À appliquer à la main sur le remote (migrations Supabase manuelles sur ce
-- projet) AVANT le premier appel réel du lot 11.7.

alter table public.dialer_calls
  alter column campaign_id drop not null;

alter table public.dialer_calls
  add column if not exists owner_user_id uuid;

-- Lien dialer_calls → réservation de budget : à la clôture on sait quelle
-- réservation consommer/libérer sans table de liaison. Le budget est réservé
-- AVANT l'insert de la ligne, la colonne est connue à l'insert.
alter table public.dialer_calls
  add column if not exists reservation_id uuid
    references public.dialer_budget_reservations(id) on delete set null;

-- Index de la garantie « 1 appel actif par user » (044) : retiré — le power
-- dialing compose jusqu'à 3 lignes actives par user. La borne reste dans le
-- réducteur client (size ≤ 5) + la validation serveur de parallelism (038 :
-- check between 1 and 5).
drop index if exists public.dialer_calls_one_active_per_user;

alter table public.dialer_campaigns
  drop constraint if exists dialer_campaigns_parallelism_single;

-- Certains remotes historiques ont été créés sans rep_phone. Le pivot ne doit
-- pas échouer sur cette colonne déjà absente ; on ne modifie son défaut que si
-- elle existe encore.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dialer_campaigns'
      and column_name = 'rep_phone'
  ) then
    alter table public.dialer_campaigns
      alter column rep_phone set default '';
  end if;
end
$$;

-- Historique par utilisateur (GET ?resource=calls, lot 11.7).
create index if not exists idx_dialer_calls_owner_created
  on public.dialer_calls (owner_user_id, created_at desc);
