-- 047_dialer_webhook_retry_and_winner_idempotence.sql
-- Reprises webhook atomiques et réélection idempotente du winner.

create or replace function public.dialer_claim_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  insert into public.dialer_webhook_events (
    event_id, event_type, payload, signature_ok, status, attempts
  ) values (
    p_event_id, coalesce(nullif(p_event_type, ''), 'unknown'), p_payload,
    true, 'pending', 1
  )
  on conflict (event_id) do update
     set status = 'pending',
         payload = excluded.payload,
         event_type = excluded.event_type,
         error_message = null,
         attempts = public.dialer_webhook_events.attempts + 1,
         received_at = now()
   where public.dialer_webhook_events.signature_ok = true
     and (
       public.dialer_webhook_events.status = 'failed'
       or (
         public.dialer_webhook_events.status = 'pending'
         and public.dialer_webhook_events.received_at < now() - interval '5 minutes'
       )
     );
  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.dialer_claim_webhook_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.dialer_claim_webhook_event(text, text, jsonb) to service_role;

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
    from public.dialer_pool_sessions
   where id = p_session_id
     and status in ('dialing', 'connecting')
   for update;

  update public.dialer_pool_sessions
     set winner_call_id = p_call_id,
         status = 'connecting',
         updated_at = now()
   where id = p_session_id
     and status in ('dialing', 'connecting')
     and (winner_call_id is null or winner_call_id = p_call_id);
  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.dialer_claim_pool_winner(uuid, bigint) from public, anon, authenticated;
grant execute on function public.dialer_claim_pool_winner(uuid, bigint) to service_role;
