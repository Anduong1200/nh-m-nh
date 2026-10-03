-- Shared, user-confirmed memories and milestones. Ledger history is never a
-- mutable progress score; editing/trashing/restoring a page adds no events.
create table public.island_entries (
  id uuid primary key,
  house_id uuid not null references public.houses(id),
  created_by uuid not null references auth.users(id),
  entry_type text not null check(entry_type in ('memory','milestone')),
  title text not null check(length(btrim(title)) > 0 and length(title) <= 120),
  body text not null default '' check(length(body) <= 4000),
  occurred_on date not null,
  source_session_id uuid,
  version integer not null default 1 check(version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() check(updated_at >= created_at),
  trashed_at timestamptz,
  unique(house_id,id),
  foreign key(house_id,source_session_id) references public.game_artifacts(house_id,session_id),
  check(source_session_id is null or entry_type = 'memory')
);
create unique index island_memory_source_once on public.island_entries(house_id,source_session_id) where source_session_id is not null;
create index island_entries_history on public.island_entries(house_id,created_at desc,id desc);
alter table public.island_entries enable row level security;
revoke all on public.island_entries from public,anon,authenticated;
grant select on public.island_entries to authenticated;
create policy island_entries_read on public.island_entries for select to authenticated using(public.is_house_member(house_id));

create table public.island_entry_operations (
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  house_id uuid not null references public.houses(id),
  command jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
alter table public.island_entry_operations enable row level security;
revoke all on public.island_entry_operations from public,anon,authenticated;
grant select on public.island_entry_operations to authenticated;
create policy island_entry_operations_read on public.island_entry_operations for select to authenticated using(actor_id = auth.uid() and public.is_house_member(house_id));

alter table public.island_events add column journal_entry_id uuid;
alter table public.island_events add constraint island_event_journal_source_fk foreign key(house_id,journal_entry_id) references public.island_entries(house_id,id);
alter table public.island_events add constraint island_event_journal_source_check check(
  (event_type in ('MEMORY_CREATED','MILESTONE_CREATED') and journal_entry_id is not null and source_id = journal_entry_id::text)
  or (event_type not in ('MEMORY_CREATED','MILESTONE_CREATED') and journal_entry_id is null)
);

create function public.island_entry_json(p_entry public.island_entries)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p_entry.id,'houseId',p_entry.house_id,'createdBy',p_entry.created_by,
    'entryType',p_entry.entry_type,'title',p_entry.title,'body',p_entry.body,
    'occurredOn',to_char(p_entry.occurred_on,'YYYY-MM-DD'),'sourceSessionId',p_entry.source_session_id,
    'version',p_entry.version,'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at,'trashedAt',p_entry.trashed_at);
$$;
revoke all on function public.island_entry_json(public.island_entries) from public,anon,authenticated;

create function public.get_island_entries(p_house_id uuid, p_before_created_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare items jsonb; cursor_at timestamptz; cursor_id uuid; has_more boolean;
begin
  if auth.uid() is null or not public.is_house_member(p_house_id) then raise exception 'House access required' using errcode = '42501'; end if;
  if (p_before_created_at is null) <> (p_before_id is null) then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(public.island_entry_json(e) order by e.created_at desc,e.id desc),'[]'::jsonb)
  into items from (select * from public.island_entries where house_id = p_house_id
    and (p_before_created_at is null or (created_at,id) < (p_before_created_at,p_before_id)) order by created_at desc,id desc limit 20) e;
  if jsonb_array_length(items) > 0 then
    cursor_at := (items -> (jsonb_array_length(items)-1) ->> 'createdAt')::timestamptz;
    cursor_id := (items -> (jsonb_array_length(items)-1) ->> 'id')::uuid;
    select exists(select 1 from public.island_entries where house_id = p_house_id and (created_at,id) < (cursor_at,cursor_id)) into has_more;
  end if;
  return jsonb_build_object('entries',items,'next',case when has_more then jsonb_build_object('createdAt',cursor_at,'id',cursor_id) else null end);
end;
$$;
revoke all on function public.get_island_entries(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.get_island_entries(uuid,timestamptz,uuid) to authenticated;

create function public.get_island_entry(p_house_id uuid,p_entry_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.island_entries;
begin
  if auth.uid() is null or not public.is_house_member(p_house_id) then raise exception 'House access required' using errcode = '42501'; end if;
  select * into e from public.island_entries where house_id = p_house_id and id = p_entry_id;
  if not found then return null; end if;
  return public.island_entry_json(e);
end;
$$;
revoke all on function public.get_island_entry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_island_entry(uuid,uuid) to authenticated;

create function public.apply_island_entry_command(p_house_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); entry_id uuid; v_operation_id uuid; expected integer; kind text;
  payload jsonb; e public.island_entries; operation public.island_entry_operations; result jsonb;
  event_name text; source_name text; source_id uuid; occurred date; outcome text := 'applied';
begin
  if actor is null then raise exception 'House access required' using errcode = '42501'; end if;
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'House access required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and status = 'active' order by user_id for share;
  if not public.is_house_member(p_house_id) or (select count(*) from public.house_members where house_id = p_house_id and status = 'active') <> 2 then raise exception 'Paired House access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_command) <> 'object' or length(p_command::text) > 20000
    or not p_command ?& array['operationId','entryId','expectedVersion','kind','payload']
    or exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operationId','entryId','expectedVersion','kind','payload'))
    or jsonb_typeof(p_command->'operationId') <> 'string' or jsonb_typeof(p_command->'entryId') <> 'string'
    or jsonb_typeof(p_command->'expectedVersion') <> 'number' or (p_command->>'expectedVersion') !~ '^[0-9]+$'
    or jsonb_typeof(p_command->'kind') <> 'string' or jsonb_typeof(p_command->'payload') <> 'object' then raise exception 'Invalid journal command' using errcode = '22023'; end if;
  v_operation_id := (p_command->>'operationId')::uuid; entry_id := (p_command->>'entryId')::uuid;
  expected := (p_command->>'expectedVersion')::integer; kind := p_command->>'kind'; payload := p_command->'payload';
  select * into operation from public.island_entry_operations where actor_id = actor and island_entry_operations.operation_id = v_operation_id;
  if found then
    if operation.house_id <> p_house_id or operation.command <> p_command then raise exception 'Operation identity changed' using errcode = '22023'; end if;
    return operation.receipt;
  end if;
  if kind not in ('create','update','trash','restore') then raise exception 'Invalid journal command' using errcode = '22023'; end if;
  if kind in ('create','update') then
    if not payload ?& array['title','body','occurredOn'] or jsonb_typeof(payload->'title') <> 'string' or length(btrim(payload->>'title')) = 0 or length(payload->>'title') > 120
      or jsonb_typeof(payload->'body') <> 'string' or length(payload->>'body') > 4000
      or jsonb_typeof(payload->'occurredOn') <> 'string' or (payload->>'occurredOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid journal content' using errcode = '22023'; end if;
    occurred := (payload->>'occurredOn')::date;
    if to_char(occurred,'YYYY-MM-DD') <> payload->>'occurredOn' then raise exception 'Invalid calendar date' using errcode = '22023'; end if;
  end if;
  if kind = 'create' then
    if expected <> 0 or not payload ?& array['entryType','sourceSessionId','confirmed']
      or exists(select 1 from jsonb_object_keys(payload) k where k not in ('title','body','occurredOn','entryType','sourceSessionId','confirmed'))
      or jsonb_typeof(payload->'entryType') <> 'string' or payload->>'entryType' not in ('memory','milestone')
      or jsonb_typeof(payload->'confirmed') <> 'boolean' or (payload->>'entryType' = 'memory' and payload->'confirmed' <> 'true'::jsonb)
      or jsonb_typeof(payload->'sourceSessionId') not in ('string','null')
      or (payload->>'entryType' = 'milestone' and payload->'sourceSessionId' <> 'null'::jsonb) then raise exception 'Memory confirmation and valid source required' using errcode = '22023'; end if;
    source_id := (payload->>'sourceSessionId')::uuid;
    if source_id is not null then
      perform 1 from public.game_sessions gs join public.game_artifacts a on a.house_id = gs.house_id and a.session_id = gs.id
        where gs.id = source_id and gs.house_id = p_house_id and gs.status = 'completed' and gs.completed_at is not null for share of gs,a;
      if not found then raise exception 'Completed shared artifact required' using errcode = '42501'; end if;
    end if;
    select * into e from public.island_entries where id = entry_id or (source_id is not null and house_id = p_house_id and source_session_id = source_id);
    if found then
      if e.house_id <> p_house_id then raise exception 'Journal access required' using errcode = '42501'; end if;
      -- A concurrent promotion of the same source is an explicit conflict,
      -- never a duplicate memory or silently substituted page identity.
      raise exception 'Journal entry or memory source already exists' using errcode = '23505';
    end if;
    insert into public.island_entries(id,house_id,created_by,entry_type,title,body,occurred_on,source_session_id)
      values(entry_id,p_house_id,actor,payload->>'entryType',payload->>'title',payload->>'body',occurred,source_id) returning * into e;
    event_name := case e.entry_type when 'memory' then 'MEMORY_CREATED' else 'MILESTONE_CREATED' end;
    source_name := case e.entry_type when 'memory' then 'confirmed-memory' else 'milestone' end;
    insert into public.island_events(house_id,event_type,source_type,source_id,journal_entry_id,created_at)
      values(p_house_id,event_name,source_name,e.id::text,e.id,e.created_at);
    insert into public.island_events(house_id,event_type,source_type,source_id,created_at)
      values(p_house_id,'WEEKLY_ACTIVITY','activity-week',to_char(date_trunc('week',e.created_at at time zone 'UTC'),'YYYY-MM-DD'),e.created_at) on conflict do nothing;
  else
    if expected < 1 then raise exception 'Expected version required' using errcode = '22023'; end if;
    select * into e from public.island_entries where id = entry_id and house_id = p_house_id for update;
    if not found then raise exception 'Journal access required' using errcode = '42501'; end if;
    if kind in ('trash','restore') and (e.created_by <> actor or payload <> '{}'::jsonb) then raise exception 'Creator access required' using errcode = '42501'; end if;
    if kind = 'update' and exists(select 1 from jsonb_object_keys(payload) k where k not in ('title','body','occurredOn')) then raise exception 'Source and creator are immutable' using errcode = '22023'; end if;
    if e.version <> expected then outcome := 'conflict';
    elsif (kind in ('update','trash') and e.trashed_at is not null) or (kind = 'restore' and e.trashed_at is null) then outcome := 'conflict';
    else
      update public.island_entries set
        title = case when kind = 'update' then payload->>'title' else title end,
        body = case when kind = 'update' then payload->>'body' else body end,
        occurred_on = case when kind = 'update' then occurred else occurred_on end,
        trashed_at = case when kind = 'trash' then now() when kind = 'restore' then null else trashed_at end,
        version = version + 1, updated_at = greatest(now(),created_at)
        where id = e.id returning * into e;
    end if;
  end if;
  result := jsonb_build_object('operationId',v_operation_id,'entryId',entry_id,'outcome',outcome,'entry',public.island_entry_json(e));
  insert into public.island_entry_operations(actor_id,operation_id,house_id,command,receipt) values(actor,v_operation_id,p_house_id,p_command,result);
  return result;
end;
$$;
revoke all on function public.apply_island_entry_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_island_entry_command(uuid,jsonb) to authenticated;
