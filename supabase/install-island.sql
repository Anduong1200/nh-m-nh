-- GENERATED: node scripts/generate-island-install.mjs
-- Additive Island install on an existing Games domain project. Apply once.
begin;
do $guard$
begin
  if to_regprocedure('public.apply_game_command(uuid,jsonb)') is null or to_regclass('public.game_artifacts') is null or to_regprocedure('public.is_house_member(uuid)') is null then
    raise exception 'Hardened House and Games domain required. Apply prerequisites first.';
  end if;
  if to_regclass('public.island_events') is not null or to_regclass('public.island_state') is not null then
    raise exception 'Island already exists or requires schema review. No data changed.';
  end if;
end;
$guard$;
-- Source: 20261002040000_island_event_projection.sql
-- Additive event-sourced Island. Clients can read, never grant themselves growth.
create unique index game_artifacts_house_island on public.game_artifacts(house_id,session_id);
create table public.island_events (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id),
  event_type text not null check (event_type in ('GAME_COMPLETED','MEMORY_CREATED','MISSION_COMPLETED','MILESTONE_CREATED','WEEKLY_ACTIVITY')),
  source_type text not null,
  source_id text not null,
  game_session_id uuid,
  created_at timestamptz not null,
  unique(house_id,event_type,source_type,source_id),
  foreign key(house_id,game_session_id) references public.game_artifacts(house_id,session_id),
  check (
    (event_type in ('GAME_COMPLETED','MISSION_COMPLETED') and source_type = 'game-artifact' and game_session_id is not null and source_id = game_session_id::text)
    or (event_type = 'MEMORY_CREATED' and source_type = 'confirmed-memory' and game_session_id is null and source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or (event_type = 'MILESTONE_CREATED' and source_type = 'milestone' and game_session_id is null and source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or (event_type = 'WEEKLY_ACTIVITY' and source_type = 'activity-week' and game_session_id is null and source_id = to_char(date_trunc('week',created_at at time zone 'UTC'),'YYYY-MM-DD'))
  )
);
create index island_events_house_history on public.island_events(house_id,created_at,id);
alter table public.island_events enable row level security;
revoke all on public.island_events from public,anon,authenticated;
grant select on public.island_events to authenticated;
create policy island_events_read on public.island_events for select to authenticated using(public.is_house_member(house_id));

-- Aggregate view has no mutable level, cache or lost-update race. Invoker RLS
-- also filters the Houses used to produce a version-0 empty state.
create view public.island_state with (security_invoker = true) as
select h.id as house_id, 1 as rules_version, count(e.id)::integer as version,
  max(e.created_at) as updated_at,
  count(distinct (e.source_type,e.source_id)) filter(where e.event_type <> 'WEEKLY_ACTIVITY')::integer as history_items,
  jsonb_build_object(
    'GAME_COMPLETED',count(*) filter(where e.event_type = 'GAME_COMPLETED'),
    'MEMORY_CREATED',count(*) filter(where e.event_type = 'MEMORY_CREATED'),
    'MISSION_COMPLETED',count(*) filter(where e.event_type = 'MISSION_COMPLETED'),
    'MILESTONE_CREATED',count(*) filter(where e.event_type = 'MILESTONE_CREATED'),
    'WEEKLY_ACTIVITY',count(*) filter(where e.event_type = 'WEEKLY_ACTIVITY')) as contributions,
  jsonb_build_object(
    'sharedHistory',count(e.id) filter(where e.event_type <> 'WEEKLY_ACTIVITY') > 0,
    'memories',count(e.id) filter(where e.event_type = 'MEMORY_CREATED') > 0,
    'missions',count(e.id) filter(where e.event_type = 'MISSION_COMPLETED') > 0,
    'milestones',count(e.id) filter(where e.event_type = 'MILESTONE_CREATED') > 0,
    'weeklyHistory',count(e.id) filter(where e.event_type = 'WEEKLY_ACTIVITY') > 0) as world
from public.houses h left join public.island_events e on e.house_id = h.id
where h.state = 'active'
group by h.id;
revoke all on public.island_state from public,anon,authenticated;
grant select on public.island_state to authenticated;

create function public.get_island_state(p_house_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_house_member(p_house_id) then
    raise exception 'House access required' using errcode = '42501';
  end if;
  select jsonb_build_object('houseId',s.house_id,'rulesVersion',s.rules_version,'version',s.version,
    'updatedAt',s.updated_at,'historyItems',s.history_items,'contributions',s.contributions,'world',s.world)
  into result from public.island_state s where s.house_id = p_house_id;
  return result;
end;
$$;
revoke all on function public.get_island_state(uuid) from public,anon,authenticated;
grant execute on function public.get_island_state(uuid) to authenticated;

-- Internal emitter reads completion truth; no event type, House or time from a client.
create function public.island_record_game(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions;
begin
  select gs.* into strict s from public.game_sessions gs
    join public.game_artifacts a on a.house_id = gs.house_id and a.session_id = gs.id
    where gs.id = p_session_id and gs.status = 'completed' and gs.completed_at is not null;
  insert into public.island_events(house_id,event_type,source_type,source_id,game_session_id,created_at)
    values(s.house_id,'GAME_COMPLETED','game-artifact',s.id::text,s.id,s.completed_at) on conflict do nothing;
  if s.game_type = 'photo-mission' then
    insert into public.island_events(house_id,event_type,source_type,source_id,game_session_id,created_at)
      values(s.house_id,'MISSION_COMPLETED','game-artifact',s.id::text,s.id,s.completed_at) on conflict do nothing;
  end if;
  insert into public.island_events(house_id,event_type,source_type,source_id,created_at)
    values(s.house_id,'WEEKLY_ACTIVITY','activity-week',to_char(date_trunc('week',s.completed_at at time zone 'UTC'),'YYYY-MM-DD'),s.completed_at) on conflict do nothing;
end;
$$;
revoke all on function public.island_record_game(uuid) from public,anon,authenticated;
create function public.island_game_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.island_record_game(new.session_id);
  return new;
end;
$$;
revoke all on function public.island_game_completed() from public,anon,authenticated;
create trigger island_game_artifact_insert after insert on public.game_artifacts
  for each row execute function public.island_game_completed();

-- Preserve existing completed history, in the same migration transaction.
do $$
declare s record;
begin
  for s in select gs.id from public.game_sessions gs join public.game_artifacts a on a.session_id = gs.id and a.house_id = gs.house_id
    where gs.status = 'completed' order by gs.completed_at,gs.id
  loop perform public.island_record_game(s.id); end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
