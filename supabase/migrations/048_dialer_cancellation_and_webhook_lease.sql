-- 048_dialer_cancellation_and_webhook_lease.sql
-- Cancellation is a durable state transition, not a best-effort side effect.

alter table public.dialer_pool_sessions
  drop constraint if exists dialer_pool_sessions_status_check;
alter table public.dialer_pool_sessions
  add constraint dialer_pool_sessions_status_check
  check (status in (
    'dialing', 'connecting', 'active', 'cancelling',
    'completed', 'cancelled', 'failed'
  ));

-- La borne 1..5 doit être globale par utilisateur, pas seulement locale à
-- chaque requête. L'index rend atomiques deux pool_start concurrents ; l'API
-- traduit la violation 23505 en 409.
create unique index if not exists uq_dialer_pool_one_active_per_owner
  on public.dialer_pool_sessions (owner_user_id)
  where status in ('dialing', 'connecting', 'active', 'cancelling');

create or replace function public.dialer_begin_pool_cancellation(
  p_session_id uuid,
  p_owner_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  update public.dialer_pool_sessions
     set status = 'cancelling', updated_at = now()
   where id = p_session_id
     and owner_user_id = p_owner_user_id
     and status in ('dialing', 'connecting', 'active', 'cancelling');
  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.dialer_begin_pool_cancellation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.dialer_begin_pool_cancellation(uuid, uuid)
  to service_role;

create or replace function public.dialer_claim_pool_winner_state(
  p_session_id uuid,
  p_call_id bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session public.dialer_pool_sessions%rowtype;
begin
  select * into current_session
    from public.dialer_pool_sessions
   where id = p_session_id
   for update;
  if not found then return 'inactive'; end if;
  if not exists (
    select 1 from public.dialer_calls
     where id = p_call_id
       and pool_session_id = p_session_id
       and ended_at is null
       and status in ('dialing', 'ringing', 'answered')
  ) then return 'inactive'; end if;
  if current_session.winner_call_id = p_call_id then return 'same'; end if;
  if current_session.winner_call_id is not null then return 'loser'; end if;
  if current_session.status not in ('dialing', 'connecting') then return 'inactive'; end if;
  update public.dialer_pool_sessions
     set winner_call_id = p_call_id, status = 'connecting', updated_at = now()
   where id = p_session_id;
  return 'claimed';
end;
$$;

revoke all on function public.dialer_claim_pool_winner_state(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.dialer_claim_pool_winner_state(uuid, bigint)
  to service_role;

create or replace function public.dialer_mark_call_answered(
  p_call_id bigint,
  p_owner_user_id uuid,
  p_telnyx_call_id text,
  p_telnyx_leg_id text,
  p_telnyx_session_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation uuid;
begin
  update public.dialer_calls
     set telnyx_call_id = coalesce(p_telnyx_call_id, telnyx_call_id),
         telnyx_leg_id = coalesce(p_telnyx_leg_id, telnyx_leg_id),
         telnyx_session_id = coalesce(p_telnyx_session_id, telnyx_session_id),
         answered_at = coalesce(answered_at, now()),
         status = case when ended_at is null then 'answered' else status end
   where id = p_call_id and owner_user_id = p_owner_user_id
   returning reservation_id into reservation;
  if not found then return false; end if;
  if reservation is not null then
    -- Un answered tardif prouve qu'un coût a été encouru, même si un hangup
    -- arrivé avant avait déjà libéré/expiré la réservation. Correction
    -- monotone vers consumed sans rouvrir la ligne terminale.
    update public.dialer_budget_reservations
       set status = 'consumed', released_at = now()
     where id = reservation
       and status in ('reserved', 'released', 'expired');
  end if;
  return true;
end;
$$;

revoke all on function public.dialer_mark_call_answered(bigint, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.dialer_mark_call_answered(bigint, uuid, text, text, text)
  to service_role;

create or replace function public.dialer_claim_pool_winner(
  p_session_id uuid,
  p_call_id bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  perform 1
    from public.dialer_pool_sessions s
    join public.dialer_calls c
      on c.id = p_call_id and c.pool_session_id = s.id
   where s.id = p_session_id
     and s.status in ('dialing', 'connecting')
   for update of s;

  update public.dialer_pool_sessions s
     set winner_call_id = p_call_id,
         status = 'connecting',
         updated_at = now()
   where s.id = p_session_id
     and s.status in ('dialing', 'connecting')
     and (s.winner_call_id is null or s.winner_call_id = p_call_id)
     and exists (
       select 1 from public.dialer_calls c
        where c.id = p_call_id
          and c.pool_session_id = s.id
          and c.ended_at is null
          and c.status in ('dialing', 'ringing', 'answered')
     );
  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.dialer_claim_pool_winner(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.dialer_claim_pool_winner(uuid, bigint)
  to service_role;

alter table public.dialer_calls
  drop constraint if exists dialer_calls_pool_slot_check;
alter table public.dialer_calls
  add constraint dialer_calls_pool_slot_check
  check (pool_slot is null or pool_slot between 0 and 4);

create unique index if not exists uq_dialer_calls_pool_slot
  on public.dialer_calls(pool_session_id, pool_slot)
  where pool_session_id is not null and pool_slot is not null;
