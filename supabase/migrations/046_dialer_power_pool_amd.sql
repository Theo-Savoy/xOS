-- 046_dialer_power_pool_amd.sql — Lot 11.8 : orchestration Voice API + AMD.

create table if not exists public.dialer_pool_sessions (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references public.profiles(id) on delete cascade,
  parallelism        int not null check (parallelism between 1 and 5),
  status             text not null default 'dialing'
                     check (status in ('dialing', 'connecting', 'active', 'completed', 'cancelled', 'failed')),
  winner_call_id     bigint references public.dialer_calls(id) on delete set null,
  agent_call_control_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  ended_at           timestamptz
);

alter table public.dialer_calls
  add column if not exists pool_session_id uuid
    references public.dialer_pool_sessions(id) on delete set null,
  add column if not exists pool_slot smallint,
  add column if not exists telnyx_session_id text,
  add column if not exists command_id text;

alter table public.dialer_calls
  drop constraint if exists dialer_calls_amd_result_check;
alter table public.dialer_calls
  add constraint dialer_calls_amd_result_check
  check (amd_result is null or amd_result in (
    'human', 'human_business', 'human_residence', 'not_sure',
    'machine', 'silence', 'fax', 'fax_detected', 'screening'
  ));

create index if not exists idx_dialer_calls_pool_session
  on public.dialer_calls(pool_session_id, pool_slot);
create unique index if not exists uq_dialer_calls_command_id
  on public.dialer_calls(command_id) where command_id is not null;
create index if not exists idx_dialer_calls_telnyx_leg_id
  on public.dialer_calls(telnyx_leg_id) where telnyx_leg_id is not null;

alter table public.dialer_pool_sessions enable row level security;
drop policy if exists "deny_all" on public.dialer_pool_sessions;
create policy "deny_all" on public.dialer_pool_sessions
  for all using (false) with check (false);

-- Atomically elect the first human result. Concurrent webhook deliveries cannot
-- create two winners because the session row is locked before the decision.
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
  perform 1 from public.dialer_pool_sessions
   where id = p_session_id and status in ('dialing', 'connecting')
   for update;

  update public.dialer_pool_sessions
     set winner_call_id = p_call_id,
         status = 'connecting',
         updated_at = now()
   where id = p_session_id
     and winner_call_id is null
     and status in ('dialing', 'connecting');
  claimed := found;
  return claimed;
end;
$$;
revoke all on function public.dialer_claim_pool_winner(uuid, bigint) from public;
grant execute on function public.dialer_claim_pool_winner(uuid, bigint) to service_role;
