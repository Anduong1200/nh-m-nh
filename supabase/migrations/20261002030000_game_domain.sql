-- Additive V1 async games. No Storage policy changes, deletes or realtime dependency.
create function public.game_text_valid(v jsonb, max_length integer, required boolean default true)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'string' and length(v #>> '{}') <= max_length
    and (not required or length(btrim(v #>> '{}',chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8239)||chr(8287)||chr(12288)||chr(65279))) > 0)
    and (v #>> '{}') !~ '[\x01-\x1F\x7F]' and strpos(v #>> '{}',chr(8232)) = 0 and strpos(v #>> '{}',chr(8233)) = 0
$$;
create function public.game_move_valid(kind text, payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
  if kind in ('line','guess') then
    return (select count(*) = 1 from jsonb_object_keys(payload)) and public.game_text_valid(payload->'text',case when kind = 'line' then 500 else 100 end) is true;
  elsif kind = 'photo' then
    return (select count(*) = 2 from jsonb_object_keys(payload))
      and payload ?& array['mediaId','caption'] and jsonb_typeof(payload->'mediaId') = 'string'
      and payload->>'mediaId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      and public.game_text_valid(payload->'caption',500,false) is true;
  elsif kind = 'doodle' then
    if public.board_payload_valid('doodle',payload,null) is not true or octet_length(payload::text) > 65536 then return false; end if;
    return jsonb_array_length(payload->'strokes') > 0 and not exists(select 1 from jsonb_array_elements(payload->'strokes') s where jsonb_array_length(s->'points') = 0);
  end if;
  return false;
end;
$$;
create table public.game_sessions (
  id uuid primary key,
  house_id uuid not null references public.houses(id),
  game_type text not null check(game_type in ('doodle-relay','draw-guess','one-line-story','photo-mission')),
  created_by uuid not null,
  prompt text not null check(length(prompt) <= 500),
  turn_limit integer not null check(turn_limit between 2 and 12),
  status text not null default 'active' check(status in ('active','completed')),
  version integer not null default 1 check(version between 1 and 13),
  current_turn_user_id uuid,
  phase text check(phase in ('doodle','drawing','guess','line','photo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(house_id,id),
  foreign key(house_id,created_by) references public.house_members(house_id,user_id),
  foreign key(house_id,current_turn_user_id) references public.house_members(house_id,user_id),
  check((status = 'active' and current_turn_user_id is not null and phase is not null and completed_at is null)
    or (status = 'completed' and current_turn_user_id is null and phase is null and completed_at is not null)),
  check(game_type <> 'draw-guess' or prompt = '' and turn_limit = 4),
  check(game_type <> 'photo-mission' or turn_limit = 2)
);
create table public.game_players (
  session_id uuid not null,
  house_id uuid not null,
  user_id uuid not null,
  seat integer not null check(seat in (0,1)),
  primary key(session_id,user_id),
  unique(session_id,seat),
  foreign key(house_id,session_id) references public.game_sessions(house_id,id),
  foreign key(house_id,user_id) references public.house_members(house_id,user_id)
);
create table public.game_events (
  session_id uuid not null,
  house_id uuid not null,
  sequence integer not null check(sequence between 1 and 12),
  operation_id uuid not null unique,
  actor_id uuid not null,
  kind text not null,
  payload jsonb not null check(public.game_move_valid(kind,payload)),
  media_id uuid,
  created_at timestamptz not null default now(),
  primary key(session_id,sequence),
  foreign key(house_id,session_id) references public.game_sessions(house_id,id),
  foreign key(session_id,actor_id) references public.game_players(session_id,user_id),
  foreign key(house_id,media_id) references public.media_objects(house_id,id),
  check((kind = 'photo' and media_id is not null and payload->>'mediaId' = media_id::text) or (kind <> 'photo' and media_id is null))
);
create table public.game_answers (
  session_id uuid primary key,
  house_id uuid not null,
  owner_id uuid not null,
  answer text not null check(public.game_text_valid(to_jsonb(answer),100)),
  foreign key(house_id,session_id) references public.game_sessions(house_id,id),
  foreign key(session_id,owner_id) references public.game_players(session_id,user_id)
);
create table public.game_artifacts (
  session_id uuid primary key,
  house_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(house_id,session_id) references public.game_sessions(house_id,id)
);
create table public.game_operations (
  operation_id uuid primary key,
  house_id uuid not null,
  session_id uuid not null,
  actor_id uuid not null,
  request jsonb not null,
  outcome text not null check(outcome in ('applied','conflict')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(house_id,session_id) references public.game_sessions(house_id,id),
  foreign key(session_id,actor_id) references public.game_players(session_id,user_id)
);
create index game_sessions_house_recent on public.game_sessions(house_id,updated_at desc);
create index game_operations_actor on public.game_operations(house_id,actor_id);
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;
alter table public.game_events enable row level security;
alter table public.game_answers enable row level security;
alter table public.game_artifacts enable row level security;
alter table public.game_operations enable row level security;
revoke all on public.game_sessions,public.game_players,public.game_events,public.game_answers,public.game_artifacts,public.game_operations from public,anon,authenticated;
grant select on public.game_sessions,public.game_players,public.game_events,public.game_answers,public.game_artifacts,public.game_operations to authenticated;
create policy game_sessions_read on public.game_sessions for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.houses h where h.id = house_id and h.state = 'active'));
create policy game_players_read on public.game_players for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.game_sessions s where s.id = session_id));
create policy game_events_read on public.game_events for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.game_sessions s where s.id = session_id));
create policy game_artifacts_read on public.game_artifacts for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.game_sessions s where s.id = session_id and s.status = 'completed'));
create policy game_answers_read on public.game_answers for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.game_sessions s where s.id = session_id and (owner_id = auth.uid() or s.status = 'completed')));
create policy game_operations_read on public.game_operations for select to authenticated using(actor_id = auth.uid() and public.is_house_member(house_id) and exists(select 1 from public.game_sessions s where s.id = session_id));

-- Internal projection. Never grant this SECURITY DEFINER function to clients.
create function public.game_snapshot(p_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.game_sessions; answer text; events jsonb; players jsonb; artifact jsonb;
begin
  select * into strict s from public.game_sessions where id = p_id;
  select a.answer into answer from public.game_answers a where a.session_id = p_id and (a.owner_id = p_actor or s.status = 'completed');
  select coalesce(jsonb_agg(jsonb_build_object('sequence',e.sequence,'actorId',e.actor_id,'operationId',e.operation_id,'createdAt',e.created_at,'kind',e.kind,'payload',e.payload) order by e.sequence),'[]'::jsonb) into events from public.game_events e where e.session_id = p_id;
  select jsonb_agg(jsonb_build_object('userId',p.user_id,'seat',p.seat) order by p.seat) into players from public.game_players p where p.session_id = p_id;
  select a.data into artifact from public.game_artifacts a where a.session_id = p_id;
  return jsonb_build_object('id',s.id,'houseId',s.house_id,'gameType',s.game_type,'createdBy',s.created_by,'prompt',s.prompt,'turnLimit',s.turn_limit,'players',players,'status',s.status,'version',s.version,
    'turn',case when s.status = 'active' then jsonb_build_object('number',s.version,'userId',s.current_turn_user_id,'phase',s.phase) else null end,
    'events',events,'answer',answer,'artifact',artifact);
end;
$$;
revoke all on function public.game_snapshot(uuid,uuid) from public,anon,authenticated;

create function public.get_game_session(p_house_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if public.current_house_id() is distinct from p_house_id then raise exception 'House required' using errcode = '42501'; end if;
  perform 1 from public.houses where id = p_house_id and state = 'active' for share;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and user_id = actor and status = 'active' for share;
  if not found then raise exception 'Active member required' using errcode = '42501'; end if;
  perform 1 from public.game_sessions where id = p_session_id and house_id = p_house_id for share;
  if public.current_house_id() is distinct from p_house_id or not exists(select 1 from public.houses h where h.id = p_house_id and h.state = 'active')
    or not exists(select 1 from public.game_players p join public.house_members m on m.house_id = p.house_id and m.user_id = p.user_id and m.status = 'active' where p.house_id = p_house_id and p.session_id = p_session_id and p.user_id = actor)
    then raise exception 'Game access denied' using errcode = '42501'; end if;
  return public.game_snapshot(p_session_id,actor);
end;
$$;

create function public.apply_game_command(p_house_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); op uuid; sid uuid; expected integer; kind text; payload jsonb;
  game_type text; prompt text; turn_limit integer; partner uuid; s public.game_sessions; previous public.game_operations;
  outcome text := 'applied'; result jsonb; answer text; complete boolean := false; next_phase text; photo uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'Invalid command' using errcode = '22023'; end if;
  if not p_command ?& array['operationId','sessionId','expectedVersion','kind','payload'] or (select count(*) from jsonb_object_keys(p_command)) <> 5
    or jsonb_typeof(p_command->'operationId') is distinct from 'string' or jsonb_typeof(p_command->'sessionId') is distinct from 'string'
    or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_command->>'sessionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_command->'expectedVersion') is distinct from 'number' or (p_command->>'expectedVersion') !~ '^[0-9]+$'
    or (p_command->>'expectedVersion')::numeric > 2147483646 then raise exception 'Invalid command' using errcode = '22023'; end if;
  begin op := (p_command->>'operationId')::uuid; sid := (p_command->>'sessionId')::uuid; expected := (p_command->>'expectedVersion')::integer;
  exception when invalid_text_representation then raise exception 'Invalid command identity' using errcode = '22023'; end;
  if op is null or sid is null then raise exception 'Command identity required' using errcode = '22023'; end if;
  kind := p_command->>'kind'; payload := p_command->'payload';
  if kind = 'create' then
    if expected <> 0 or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid creation' using errcode = '22023'; end if;
    game_type := payload->>'gameType'; prompt := payload->>'prompt';
    if (select count(*) from jsonb_object_keys(payload)) <> 3 or not payload ?& array['gameType','prompt','turnLimit']
      or game_type is null or game_type not in ('doodle-relay','draw-guess','one-line-story','photo-mission')
      or public.game_text_valid(payload->'prompt',case when game_type = 'draw-guess' then 100 else 500 end) is not true
      or jsonb_typeof(payload->'turnLimit') is distinct from 'number' or payload->>'turnLimit' !~ '^[0-9]+$'
      or (payload->>'turnLimit')::numeric not between 2 and 12 then raise exception 'Invalid creation' using errcode = '22023'; end if;
    turn_limit := (payload->>'turnLimit')::integer;
    if game_type = 'draw-guess' and turn_limit <> 4 or game_type = 'photo-mission' and turn_limit <> 2 then raise exception 'Invalid turn limit' using errcode = '22023'; end if;
  elsif expected < 1 or public.game_move_valid(kind,payload) is not true then raise exception 'Invalid move' using errcode = '22023'; end if;
  if public.current_house_id() is distinct from p_house_id then raise exception 'House required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('game_operation:' || op::text,0));
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and status = 'active' order by user_id for share;
  if (select count(*) from public.house_members where house_id = p_house_id and status = 'active') <> 2
    or not exists(select 1 from public.house_members where house_id = p_house_id and user_id = actor and status = 'active') then raise exception 'Two active members required' using errcode = '42501'; end if;
  select * into previous from public.game_operations where operation_id = op;
  if found then
    if previous.house_id <> p_house_id or previous.actor_id <> actor or previous.request <> p_command then raise exception 'Operation identity mismatch' using errcode = '23505'; end if;
    return jsonb_build_object('operationId',op,'actorId',actor,'houseId',p_house_id,'request',p_command,'outcome',previous.outcome,'snapshot',previous.snapshot);
  end if;
  select * into s from public.game_sessions where id = sid for update;
  if found then
    if s.house_id <> p_house_id or not exists(select 1 from public.game_players where session_id = sid and user_id = actor)
      or exists(select 1 from public.game_players p where p.session_id = sid and not exists(select 1 from public.house_members m where m.house_id = p_house_id and m.user_id = p.user_id and m.status = 'active')) then raise exception 'Session access denied' using errcode = '42501'; end if;
    if kind = 'create' or s.version <> expected or s.status = 'completed' or s.current_turn_user_id <> actor then outcome := 'conflict'; end if;
  elsif kind <> 'create' then raise exception 'Session unavailable' using errcode = 'P0002'; end if;
  if outcome = 'applied' and kind = 'create' then
    select user_id into partner from public.house_members where house_id = p_house_id and user_id <> actor and status = 'active';
    next_phase := case game_type when 'doodle-relay' then 'doodle' when 'draw-guess' then 'drawing' when 'one-line-story' then 'line' else 'photo' end;
    insert into public.game_sessions(id,house_id,game_type,created_by,prompt,turn_limit,current_turn_user_id,phase)
      values(sid,p_house_id,game_type,actor,case when game_type = 'draw-guess' then '' else prompt end,turn_limit,actor,next_phase);
    insert into public.game_players(session_id,house_id,user_id,seat) values(sid,p_house_id,actor,0),(sid,p_house_id,partner,1);
    if game_type = 'draw-guess' then insert into public.game_answers(session_id,house_id,owner_id,answer) values(sid,p_house_id,actor,prompt); end if;
  elsif outcome = 'applied' then
    if not (s.phase = kind or s.phase = 'drawing' and kind = 'doodle') then raise exception 'Wrong move for phase' using errcode = '22023'; end if;
    if kind = 'photo' then
      photo := (payload->>'mediaId')::uuid;
      perform 1 from public.media_objects where id = photo and house_id = p_house_id and owner_id = actor and media_type = 'photo' and state = 'ready' for share;
      if not found then raise exception 'Ready owned House photo required' using errcode = '42501'; end if;
    end if;
    insert into public.game_events(session_id,house_id,sequence,operation_id,actor_id,kind,payload,media_id) values(sid,p_house_id,s.version,op,actor,kind,payload,photo);
    select user_id into partner from public.game_players where session_id = sid and user_id <> actor;
    if s.game_type = 'draw-guess' then
      select a.answer into answer from public.game_answers a where a.session_id = sid;
      complete := kind = 'guess' and (btrim(payload->>'text') = btrim(answer) or s.version >= 4);
      next_phase := 'guess';
      if kind = 'guess' then partner := actor; end if;
    else complete := s.version >= s.turn_limit; next_phase := s.phase; end if;
    update public.game_sessions set version = version+1, status = case when complete then 'completed' else 'active' end,
      current_turn_user_id = case when complete then null else partner end, phase = case when complete then null else next_phase end,
      updated_at = now(), completed_at = case when complete then now() else null end where id = sid;
    if complete then
      result := public.game_snapshot(sid,actor);
      insert into public.game_artifacts(session_id,house_id,data) values(sid,p_house_id,jsonb_build_object('sessionId',sid,'gameType',s.game_type,'events',result->'events','answer',result->'answer'));
    end if;
  end if;
  result := public.game_snapshot(sid,actor);
  insert into public.game_operations(operation_id,house_id,session_id,actor_id,request,outcome,snapshot) values(op,p_house_id,sid,actor,p_command,outcome,result);
  return jsonb_build_object('operationId',op,'actorId',actor,'houseId',p_house_id,'request',p_command,'outcome',outcome,'snapshot',result);
end;
$$;
revoke all on function public.game_text_valid(jsonb,integer,boolean),public.game_move_valid(text,jsonb) from public,anon;
grant execute on function public.game_text_valid(jsonb,integer,boolean),public.game_move_valid(text,jsonb) to authenticated;
revoke all on function public.get_game_session(uuid,uuid),public.apply_game_command(uuid,jsonb) from public,anon;
grant execute on function public.get_game_session(uuid,uuid),public.apply_game_command(uuid,jsonb) to authenticated;
