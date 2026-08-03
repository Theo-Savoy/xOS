-- 044_dialer_calls_one_active_per_user.sql
-- Phase B audio (audit 11.2 B.6-1) : un seul appel actif par utilisateur,
-- garanti par la base — la garantie légale la plus forte du produit tient en
-- une ligne de DDL, aucun bug applicatif futur ne peut la contourner.
--
-- Contexte conformité ARCEP 2022-1583 §7.1.3 : l'exclusion de la définition de
-- « système automatisé » exige des appels émis individuellement SANS
-- parallélisation possible. Aujourd'hui rien n'empêche 50 dials concurrents
-- (calls_day_limit borne le volume quotidien, pas la simultanéité). Cet index
-- ferme la faille par omission.
--
-- À appliquer à la main (migrations Supabase manuelles sur ce projet) quand la
-- Phase B démarre. Sans effet avant : dialer_calls est une table orpheline
-- (aucun code ne l'écrit encore).

alter table public.dialer_calls
  add column if not exists owner_user_id uuid;

create unique index if not exists dialer_calls_one_active_per_user
  on public.dialer_calls (owner_user_id)
  where ended_at is null;

-- Parallélisme : le schéma expose une colonne qui invite à l'illégalité.
-- Une valeur > 1 fait basculer Combo dans la définition ARCEP de « système
-- automatisé » → NPV obligatoire, indisponible chez Telnyx FR. (D7)
alter table public.dialer_campaigns
  add constraint dialer_campaigns_parallelism_single
  check (parallelism is null or parallelism = 1);
