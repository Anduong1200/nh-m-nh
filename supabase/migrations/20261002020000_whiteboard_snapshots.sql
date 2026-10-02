-- Additive Whiteboard snapshots; no media, public rooms, deletion or realtime.
create function public.whiteboard_number(v jsonb, lo numeric, hi numeric, whole boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then (v::text)::numeric between lo and hi
    and (not whole or trunc((v::text)::numeric) = (v::text)::numeric) else false end
$$;
create function public.whiteboard_id(v jsonb) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Za-z0-9_-]{1,128}$',false)
$$;
create function public.whiteboard_point(v jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(v) is distinct from 'array' then return false; end if;
  if jsonb_array_length(v) <> 2 then return false; end if;
  return public.whiteboard_number(v->0,-100000,100000) and public.whiteboard_number(v->1,-100000,100000);
end;
$$;
create function public.whiteboard_binding(v jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if v = 'null'::jsonb then return true; end if;
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  return not exists(select 1 from jsonb_object_keys(v) as f(key_name) where f.key_name not in ('elementId','focus','gap'))
    and public.whiteboard_id(v->'elementId') and public.whiteboard_number(v->'focus',-1,1) and public.whiteboard_number(v->'gap',0,100000);
end;
$$;
create function public.whiteboard_scene_valid(s jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  e jsonb; v jsonb; p jsonb; k text; ids text[] := '{}'; references_to text[] := '{}'; n integer := 0;
  common text[] := array['id','type','x','y','width','height','angle','strokeColor','backgroundColor','fillStyle','strokeWidth','strokeStyle','roughness','opacity','seed','version','versionNonce','isDeleted','groupIds','frameId','boundElements','updated','link','locked','roundness','index'];
  extra text[];
begin
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text) > 1048576 then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) as f(key_name) where f.key_name not in ('schemaVersion','library','libraryVersion','elements'))
    or s->'schemaVersion' is distinct from '1'::jsonb or s->>'library' is distinct from 'excalidraw'
    or s->>'libraryVersion' is distinct from '0.18.1' or jsonb_typeof(s->'elements') is distinct from 'array' then return false; end if;
  if jsonb_array_length(s->'elements') > 1000 then return false; end if;
  for e in select value from jsonb_array_elements(s->'elements') loop
    if jsonb_typeof(e) is distinct from 'object' then return false; end if;
    if e->>'type' is null or e->>'type' not in ('rectangle','ellipse','diamond','text','freedraw','line','arrow')
      or public.whiteboard_id(e->'id') is not true or (e->>'id') = any(ids) or not e ?& common then return false; end if;
    ids := array_append(ids,e->>'id');
    extra := case e->>'type'
      when 'text' then array['fontSize','fontFamily','text','originalText','textAlign','verticalAlign','containerId','autoResize','lineHeight']
      when 'freedraw' then array['points','pressures','simulatePressure','lastCommittedPoint']
      when 'line' then array['points','lastCommittedPoint','startBinding','endBinding','startArrowhead','endArrowhead','elbowed']
      when 'arrow' then array['points','lastCommittedPoint','startBinding','endBinding','startArrowhead','endArrowhead','elbowed'] else '{}'::text[] end;
    if exists(select 1 from jsonb_object_keys(e) as f(key_name) where not f.key_name = any(common || extra)) then return false; end if;
    for k,v in select key,value from jsonb_each(e) loop
      if (case
        when k in ('id') then public.whiteboard_id(v)
        when k in ('x','y') then public.whiteboard_number(v,-100000,100000)
        when k in ('width','height') then public.whiteboard_number(v,0,100000)
        when k = 'angle' then public.whiteboard_number(v,-100,100)
        when k in ('strokeColor','backgroundColor') then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^(transparent|#[0-9a-fA-F]{3,8})$'
        when k = 'fillStyle' then v #>> '{}' in ('hachure','cross-hatch','solid','zigzag')
        when k = 'strokeStyle' then v #>> '{}' in ('solid','dashed','dotted')
        when k = 'strokeWidth' then public.whiteboard_number(v,0,32)
        when k = 'roughness' then public.whiteboard_number(v,0,5)
        when k = 'opacity' then public.whiteboard_number(v,0,100)
        when k in ('seed','versionNonce') then public.whiteboard_number(v,0,2147483647,true)
        when k = 'version' then public.whiteboard_number(v,1,2147483647,true)
        when k = 'updated' then public.whiteboard_number(v,0,9007199254740991,true)
        when k in ('isDeleted','locked','simulatePressure','autoResize') then jsonb_typeof(v) = 'boolean'
        when k in ('link','frameId') then v = 'null'::jsonb
        when k = 'index' then v = 'null'::jsonb or jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Za-z0-9]{1,128}$'
        when k in ('lastCommittedPoint') then v = 'null'::jsonb or public.whiteboard_point(v)
        when k in ('startBinding','endBinding') then public.whiteboard_binding(v)
        when k in ('startArrowhead','endArrowhead') then v = 'null'::jsonb or v #>> '{}' in ('arrow','bar','dot','circle','circle_outline','triangle','triangle_outline','diamond','diamond_outline','crowfoot_one','crowfoot_many','crowfoot_one_or_many')
        when k = 'elbowed' then v = 'false'::jsonb
        when k = 'fontSize' then public.whiteboard_number(v,4,512)
        when k = 'fontFamily' then public.whiteboard_number(v,1,10,true) and v #>> '{}' in ('2','5')
        when k = 'lineHeight' then public.whiteboard_number(v,.5,5)
        when k in ('text','originalText') then jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 10000 and (v #>> '{}') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
        when k = 'textAlign' then v #>> '{}' in ('left','center','right')
        when k = 'verticalAlign' then v #>> '{}' in ('top','middle','bottom')
        when k = 'containerId' then v = 'null'::jsonb or public.whiteboard_id(v)
        else true end) is not true then return false; end if;
    end loop;
    v := e->'groupIds';
    if jsonb_typeof(v) is distinct from 'array' then return false; end if;
    if jsonb_array_length(v) > 32 or exists(select 1 from jsonb_array_elements(v) x where public.whiteboard_id(x) is not true) then return false; end if;
    v := e->'roundness';
    if v <> 'null'::jsonb then
      if jsonb_typeof(v) is distinct from 'object' then return false; end if;
      if exists(select 1 from jsonb_object_keys(v) as f(key_name) where f.key_name not in ('type','value')) or public.whiteboard_number(v->'type',1,3,true) is not true
        or (v ? 'value' and public.whiteboard_number(v->'value',0,100000) is not true) then return false; end if;
    end if;
    v := e->'boundElements';
    if v <> 'null'::jsonb then
      if jsonb_typeof(v) is distinct from 'array' then return false; end if;
      if jsonb_array_length(v) > 1000 then return false; end if;
      for p in select value from jsonb_array_elements(v) loop
        if jsonb_typeof(p) is distinct from 'object' then return false; end if;
        if exists(select 1 from jsonb_object_keys(p) as f(key_name) where f.key_name not in ('id','type')) or public.whiteboard_id(p->'id') is not true or p->>'type' is null or p->>'type' not in ('text','arrow') then return false; end if;
        references_to := array_append(references_to,p->>'id');
      end loop;
    end if;
    if e->>'type' = 'text' then
      if not e ?& extra then return false; end if;
      if e->'containerId' <> 'null'::jsonb then references_to := array_append(references_to,e->>'containerId'); end if;
    end if;
    if e->>'type' in ('freedraw','line','arrow') then
      if jsonb_typeof(e->'points') is distinct from 'array' or not e ? 'lastCommittedPoint' then return false; end if;
      n := n + jsonb_array_length(e->'points');
      if n > 20000 or exists(select 1 from jsonb_array_elements(e->'points') x where public.whiteboard_point(x) is not true) then return false; end if;
      if e->>'type' = 'freedraw' then
        if jsonb_typeof(e->'pressures') is distinct from 'array' or jsonb_typeof(e->'simulatePressure') is distinct from 'boolean' then return false; end if;
        if jsonb_array_length(e->'pressures') > jsonb_array_length(e->'points') or exists(select 1 from jsonb_array_elements(e->'pressures') x where public.whiteboard_number(x,0,1) is not true) then return false; end if;
      else
        if not e ?& array['startBinding','endBinding','startArrowhead','endArrowhead'] or (e->>'type' = 'arrow' and e->'elbowed' is distinct from 'false'::jsonb) then return false; end if;
        foreach k in array array['startBinding','endBinding'] loop
          if e->k <> 'null'::jsonb then references_to := array_append(references_to,e->k->>'elementId'); end if;
        end loop;
      end if;
    end if;
  end loop;
  return references_to <@ ids;
end;
$$;

create table public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null unique references public.houses(id),
  version integer not null check(version >= 1),
  scene jsonb not null check(public.whiteboard_scene_valid(scene)),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(house_id,updated_by) references public.house_members(house_id,user_id)
);
create table public.whiteboard_operations (
  operation_id uuid primary key,
  house_id uuid not null references public.whiteboards(house_id),
  actor_id uuid not null references auth.users(id),
  request jsonb not null,
  outcome text not null check(outcome in ('applied','conflict')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(house_id,actor_id) references public.house_members(house_id,user_id)
);
alter table public.whiteboards enable row level security;
alter table public.whiteboard_operations enable row level security;
revoke all on public.whiteboards,public.whiteboard_operations from public,anon,authenticated;
grant select on public.whiteboards,public.whiteboard_operations to authenticated;
create policy whiteboards_select on public.whiteboards for select to authenticated using (
  public.is_house_member(house_id) and exists(select 1 from public.houses h where h.id = house_id and h.state = 'active')
);
create policy whiteboard_operations_select on public.whiteboard_operations for select to authenticated using (
  actor_id = auth.uid() and public.is_house_member(house_id) and exists(select 1 from public.houses h where h.id = house_id and h.state = 'active')
);
create function public.save_whiteboard_snapshot(p_operation_id uuid,p_house_id uuid,p_expected_version integer,p_scene jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); previous public.whiteboard_operations; current_board public.whiteboards;
  request jsonb; result jsonb; outcome text := 'applied';
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_operation_id is null or p_house_id is null or p_expected_version is null or p_expected_version not between 0 and 2147483646
    or public.whiteboard_scene_valid(p_scene) is not true then raise exception 'Invalid Whiteboard operation' using errcode = '22023'; end if;
  if public.current_house_id() is distinct from p_house_id then raise exception 'House required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('whiteboard_operation:' || p_operation_id::text,0));
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and user_id = actor and status = 'active' for share;
  if not found then raise exception 'Active member required' using errcode = '42501'; end if;
  request := jsonb_build_object('expectedVersion',p_expected_version,'scene',p_scene);
  select * into previous from public.whiteboard_operations where operation_id = p_operation_id;
  if found then
    if previous.house_id <> p_house_id or previous.actor_id <> actor or previous.request <> request then raise exception 'Operation identity mismatch' using errcode = '23505'; end if;
    return jsonb_build_object('operationId',p_operation_id,'actorId',actor,'houseId',p_house_id,'outcome',previous.outcome,'snapshot',previous.snapshot);
  end if;
  select * into current_board from public.whiteboards where house_id = p_house_id for update;
  if coalesce(current_board.version,0) <> p_expected_version then
    if current_board.version is null then raise exception 'Whiteboard unavailable' using errcode = 'P0002'; end if;
    outcome := 'conflict';
  else
    insert into public.whiteboards(house_id,version,scene,updated_by) values(p_house_id,1,p_scene,actor)
      on conflict(house_id) do update set version = public.whiteboards.version + 1, scene = p_scene, updated_by = actor, updated_at = now()
      returning * into current_board;
  end if;
  result := jsonb_build_object('houseId',p_house_id,'version',current_board.version,'scene',current_board.scene,'updatedBy',current_board.updated_by,'updatedAt',current_board.updated_at);
  insert into public.whiteboard_operations(operation_id,house_id,actor_id,request,outcome,snapshot) values(p_operation_id,p_house_id,actor,request,outcome,result);
  return jsonb_build_object('operationId',p_operation_id,'actorId',actor,'houseId',p_house_id,'outcome',outcome,'snapshot',result);
end;
$$;
revoke all on function public.save_whiteboard_snapshot(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_whiteboard_snapshot(uuid,uuid,integer,jsonb) to authenticated;
