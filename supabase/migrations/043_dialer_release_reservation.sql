-- 043_dialer_release_reservation.sql — reservation lifecycle RPC.
--
-- Complements the remote-applied dialer_reserve_budget() (which only reserves).
-- Release transitions a reservation out of 'reserved' so its estimated cost
-- stops counting against caps:
--   - result='consumed' → keep the row (cost actually spent, reconciled later)
--   - result='released' → reservation cancelled, cost never incurred
--
-- Idempotent (create or replace).

create or replace function public.dialer_release_reservation(
  p_reservation_id uuid,
  p_result text default 'released'
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.dialer_budget_reservations
     set status = case when p_result = 'consumed' then 'consumed' else 'released' end,
         released_at = now()
   where id = p_reservation_id
     and status = 'reserved';
end;
$function$;

revoke all on function public.dialer_release_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.dialer_release_reservation(uuid, text) to service_role;

-- Expire stale reservations (safety net if release is missed).
create or replace function public.dialer_expire_reservations()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_count integer;
begin
  update public.dialer_budget_reservations
     set status = 'expired', released_at = now()
   where status = 'reserved' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.dialer_expire_reservations() from public, anon, authenticated;
grant execute on function public.dialer_expire_reservations() to service_role;
