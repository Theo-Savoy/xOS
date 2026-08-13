-- 049 — verrouille le schéma réel de dialer_calls (drift remote vs migrations).
--
-- Contexte : la base distante (source de vérité) a divergé des migrations
-- commitées. Deux écarts cassaient l'ouverture d'appel (call_record_failed) :
--
--   1. outbound_number text NOT NULL (sans défaut) — absent de toutes les
--      migrations commitées, jamais écrit par openCallRow → violation NOT NULL
--      à chaque INSERT. Fix code : openCallRow écrit outbound_number depuis le
--      numéro sortant résolu (callerNumber).
--   2. campaign_id — la 038 le déclarait NOT NULL ; le remote l'a nullable et
--      le code ouvre des appels hors campagne (campaignId: null).
--
-- La migration est idempotente : sur le remote (colonne déjà NOT NULL, aucune
-- ligne NULL), add column if not exists + update + set not null ne changent
-- rien. Sur un environnement neuf, elle crée la colonne, backfill depuis
-- to_number, puis pose NOT NULL.

alter table public.dialer_calls
  add column if not exists outbound_number text;

update public.dialer_calls
  set outbound_number = to_number
  where outbound_number is null;

alter table public.dialer_calls
  alter column outbound_number set not null;

-- Le remote a campaign_id nullable (appels hors campagne) : aligne la 038.
alter table public.dialer_calls
  alter column campaign_id drop not null;
