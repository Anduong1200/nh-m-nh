-- Private Letters: time gates, immutable sends, explicit opens and short-lived joint reveal.
create function public.letter_text_valid(v jsonb,max_length integer,required boolean default true)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'string' and length(v #>> '{}') <= max_length
    and (not required or length(btrim(v #>> '{}',chr(32)||chr(9)||chr(10)||chr(13)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))) > 0)
    and (v #>> '{}') !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
$$;
create function public.letter_delivery_valid(v jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare zone text; local_time timestamp; instant timestamptz;
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  if v->>'mode' = 'immediate' then return (select count(*) = 1 from jsonb_object_keys(v)); end if;
  if v->>'mode' is distinct from 'scheduled' or (select count(*) from jsonb_object_keys(v)) <> 4
    or not v ?& array['mode','deliverAt','localDateTime','timeZone']
    or jsonb_typeof(v->'deliverAt') is distinct from 'string' or jsonb_typeof(v->'localDateTime') is distinct from 'string' or jsonb_typeof(v->'timeZone') is distinct from 'string'
    or v->>'deliverAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$'
    or v->>'localDateTime' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then return false; end if;
  zone := v->>'timeZone';
  if length(zone) > 100 or not exists(select 1 from pg_catalog.pg_timezone_names where name = zone) then return false; end if;
  local_time := (v->>'localDateTime')::timestamp; instant := (v->>'deliverAt')::timestamptz;
  return extract(year from local_time) between 2000 and 2100
    and to_char(local_time,'YYYY-MM-DD"T"HH24:MI') = v->>'localDateTime'
    and instant at time zone zone = local_time;
exception when others then return false;
end;
$$;
create table public.letters (
  id uuid primary key,
  house_id uuid not null references public.houses(id),
  sender_id uuid not null, recipient_id uuid not null,
  delivery_mode text not null check(delivery_mode in ('immediate','scheduled')),
  deliver_at timestamptz not null,
  time_zone text, local_delivery_time timestamp,
  clue text not null check(public.letter_text_valid(to_jsonb(clue),80,false) and clue !~ '[\x09\x0A\x0D]'),
  reveal_together boolean not null,
  created_at timestamptz not null,
  unique(house_id,id), unique(house_id,id,sender_id), unique(house_id,id,recipient_id),
  foreign key(house_id,sender_id) references public.house_members(house_id,user_id),
  foreign key(house_id,recipient_id) references public.house_members(house_id,user_id),
  check(sender_id <> recipient_id),
  check((delivery_mode = 'immediate' and time_zone is null and local_delivery_time is null and deliver_at = created_at)
    or (delivery_mode = 'scheduled' and time_zone is not null and local_delivery_time is not null and deliver_at > created_at))
);
create table public.letter_contents (
  letter_id uuid primary key, house_id uuid not null, sender_id uuid not null,
  content text not null check(public.letter_text_valid(to_jsonb(content),2000)),
  foreign key(house_id,letter_id,sender_id) references public.letters(house_id,id,sender_id)
);
-- Separate recipient-private opening truth avoids default sender read receipts.
create table public.letter_openings (
  letter_id uuid primary key, house_id uuid not null, recipient_id uuid not null,
  mode text not null check(mode in ('single','together')), opened_at timestamptz not null,
  foreign key(house_id,letter_id,recipient_id) references public.letters(house_id,id,recipient_id)
);
create table public.letter_operations (
  operation_id uuid primary key, letter_id uuid not null, house_id uuid not null, actor_id uuid not null,
  request jsonb not null, snapshot jsonb not null, created_at timestamptz not null default now(),
  foreign key(house_id,letter_id) references public.letters(house_id,id),
  foreign key(house_id,actor_id) references public.house_members(house_id,user_id)
);
create table public.letter_reveal_sessions (
  id uuid primary key default gen_random_uuid(), letter_id uuid not null, house_id uuid not null,
  expires_at timestamptz not null, closed_at timestamptz,
  unique(house_id,id), foreign key(house_id,letter_id) references public.letters(house_id,id)
);
create unique index letter_reveal_active on public.letter_reveal_sessions(letter_id) where closed_at is null;
create table public.letter_reveal_participants (
  session_id uuid not null, house_id uuid not null, user_id uuid not null,
  heartbeat_at timestamptz, ready boolean not null default false,
  primary key(session_id,user_id),
  foreign key(house_id,session_id) references public.letter_reveal_sessions(house_id,id),
  foreign key(house_id,user_id) references public.house_members(house_id,user_id),
  check(not ready or heartbeat_at is not null)
);
create index letters_house_delivery on public.letters(house_id,deliver_at desc,id);
alter table public.letters enable row level security;
alter table public.letter_contents enable row level security;
alter table public.letter_openings enable row level security;
alter table public.letter_operations enable row level security;
alter table public.letter_reveal_sessions enable row level security;
alter table public.letter_reveal_participants enable row level security;
revoke all on public.letters,public.letter_contents,public.letter_openings,public.letter_operations,public.letter_reveal_sessions,public.letter_reveal_participants from public,anon,authenticated;
grant select on public.letters,public.letter_contents,public.letter_openings,public.letter_operations to authenticated;
create policy letters_read on public.letters for select to authenticated using(public.is_house_member(house_id) and (sender_id = auth.uid() or recipient_id = auth.uid() and deliver_at <= statement_timestamp()));
create policy letter_openings_read on public.letter_openings for select to authenticated using(public.is_house_member(house_id) and exists(select 1 from public.letters l where l.id = letter_id and (l.recipient_id = auth.uid() or mode = 'together' and l.sender_id = auth.uid())));
create policy letter_contents_read on public.letter_contents for select to authenticated using(public.is_house_member(house_id) and exists(
  select 1 from public.letters l where l.id = letter_id and (l.sender_id = auth.uid() or l.recipient_id = auth.uid() and l.deliver_at <= statement_timestamp() and exists(select 1 from public.letter_openings o where o.letter_id = l.id))));
create policy letter_operations_read on public.letter_operations for select to authenticated using(actor_id = auth.uid() and public.is_house_member(house_id));

create function public.letter_snapshot(p_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.letters; body text; opened boolean; due boolean; author boolean; state text; delivery jsonb;
begin
  select * into strict l from public.letters where id = p_id;
  if p_actor not in (l.sender_id,l.recipient_id) then return null; end if;
  author := p_actor = l.sender_id; due := l.deliver_at <= clock_timestamp();
  if not author and not due then return null; end if;
  select exists(select 1 from public.letter_openings where letter_id = l.id) into opened;
  if author or due and opened then select content into body from public.letter_contents where letter_id = l.id; end if;
  state := case when not due then 'scheduled' when author and not l.reveal_together then 'sent' when opened then 'opened' else 'sealed' end;
  delivery := case when l.delivery_mode = 'immediate' then jsonb_build_object('mode','immediate') else jsonb_build_object('mode','scheduled',
    'deliverAt',to_char(l.deliver_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timeZone',l.time_zone,'localDateTime',to_char(l.local_delivery_time,'YYYY-MM-DD"T"HH24:MI')) end;
  return jsonb_build_object('id',l.id,'houseId',l.house_id,'senderId',l.sender_id,'recipientId',l.recipient_id,
    'delivery',delivery,'deliverAt',l.deliver_at,'createdAt',l.created_at,'clue',l.clue,'revealTogether',l.reveal_together,
    'state',state,'version',case when state = 'opened' then 2 else 1 end,'content',body,
    'canOpen',not author and not l.reveal_together and due and not opened,'canJoin',l.reveal_together and due and not opened);
end;
$$;
revoke all on function public.letter_snapshot(uuid,uuid) from public,anon,authenticated;
create function public.get_letter(p_house_id uuid,p_letter_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_house_member(p_house_id) then raise exception 'House access required' using errcode = '42501'; end if;
  if not exists(select 1 from public.letters where id = p_letter_id and house_id = p_house_id) then return null; end if;
  return public.letter_snapshot(p_letter_id,auth.uid());
end;
$$;
revoke all on function public.get_letter(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_letter(uuid,uuid) to authenticated;

create function public.apply_letter_command(p_house_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); op uuid; lid uuid; kind text; p jsonb; prior public.letter_operations; l public.letters; recipient uuid; instant timestamptz; v_now timestamptz; result jsonb;
begin
  if actor is null or public.current_house_id() is distinct from p_house_id then raise exception 'House access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or (p_command->>'operationId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') is not true
    or (p_command->>'letterId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') is not true then raise exception 'Invalid letter command'; end if;
  op := (p_command->>'operationId')::uuid; lid := (p_command->>'letterId')::uuid; kind := p_command->>'kind';
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and status = 'active' for share;
  if (select count(*) from public.house_members where house_id = p_house_id and status = 'active') <> 2
    or not exists(select 1 from public.house_members where house_id = p_house_id and status = 'active' and user_id = actor) then raise exception 'Two active members required' using errcode = '42501'; end if;
  select * into prior from public.letter_operations where operation_id = op;
  if found then
    if prior.actor_id <> actor or prior.house_id <> p_house_id or prior.request <> p_command then raise exception 'Operation identity mismatch' using errcode = '42501'; end if;
    return jsonb_build_object('operationId',op,'actorId',actor,'houseId',p_house_id,'letterId',lid,'snapshot',prior.snapshot);
  end if;
  v_now := clock_timestamp();
  if kind = 'send' then
    p := p_command->'payload';
    if (select count(*) from jsonb_object_keys(p_command)) <> 4 or not p_command ?& array['operationId','letterId','kind','payload']
      or jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p)) <> 4 or not p ?& array['content','clue','delivery','revealTogether']
      or public.letter_text_valid(p->'content',2000) is not true or public.letter_text_valid(p->'clue',80,false) is not true or p->>'clue' ~ '[\x09\x0A\x0D]'
      or jsonb_typeof(p->'revealTogether') is distinct from 'boolean' or public.letter_delivery_valid(p->'delivery') is not true then raise exception 'Invalid letter payload'; end if;
    select user_id into strict recipient from public.house_members where house_id = p_house_id and status = 'active' and user_id <> actor;
    instant := case when p->'delivery'->>'mode' = 'immediate' then v_now else (p->'delivery'->>'deliverAt')::timestamptz end;
    if p->'delivery'->>'mode' = 'scheduled' and instant <= v_now then raise exception 'Scheduled delivery must be in the future'; end if;
    insert into public.letters(id,house_id,sender_id,recipient_id,delivery_mode,deliver_at,time_zone,local_delivery_time,clue,reveal_together,created_at)
      values(lid,p_house_id,actor,recipient,p->'delivery'->>'mode',instant,p->'delivery'->>'timeZone',(p->'delivery'->>'localDateTime')::timestamp,p->>'clue',(p->>'revealTogether')::boolean,v_now);
    insert into public.letter_contents(letter_id,house_id,sender_id,content) values(lid,p_house_id,actor,p->>'content');
  elsif kind = 'open' then
    if (select count(*) from jsonb_object_keys(p_command)) <> 3 or not p_command ?& array['operationId','letterId','kind'] then raise exception 'Invalid open command'; end if;
    select * into strict l from public.letters where id = lid and house_id = p_house_id for update;
    if l.recipient_id <> actor or l.reveal_together or l.deliver_at > v_now then raise exception 'Letter cannot be opened' using errcode = '42501'; end if;
    insert into public.letter_openings(letter_id,house_id,recipient_id,mode,opened_at) values(lid,p_house_id,actor,'single',v_now) on conflict(letter_id) do nothing;
  else raise exception 'Unknown letter command'; end if;
  result := public.letter_snapshot(lid,actor);
  insert into public.letter_operations(operation_id,letter_id,house_id,actor_id,request,snapshot) values(op,lid,p_house_id,actor,p_command,result);
  return jsonb_build_object('operationId',op,'actorId',actor,'houseId',p_house_id,'letterId',lid,'snapshot',result);
end;
$$;
revoke all on function public.apply_letter_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_letter_command(uuid,jsonb) to authenticated;

create function public.apply_letter_reveal(p_house_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); lid uuid; sid uuid; kind text; l public.letters; room public.letter_reveal_sessions; v_now timestamptz; mine public.letter_reveal_participants; connected integer; opened boolean; active boolean;
begin
  if actor is null or public.current_house_id() is distinct from p_house_id then raise exception 'House access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_command)) <> 3 or not p_command ?& array['letterId','sessionId','kind'] then raise exception 'Invalid reveal command'; end if;
  lid := (p_command->>'letterId')::uuid; kind := p_command->>'kind';
  if kind not in ('join','heartbeat','ready','leave') or kind is null then raise exception 'Unknown reveal action'; end if;
  if kind = 'join' and p_command->'sessionId' is distinct from 'null'::jsonb or kind <> 'join' and jsonb_typeof(p_command->'sessionId') is distinct from 'string' then raise exception 'Invalid reveal session'; end if;
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and status = 'active' for share;
  if (select count(*) from public.house_members where house_id = p_house_id and status = 'active') <> 2 or not exists(select 1 from public.house_members where house_id = p_house_id and user_id = actor and status = 'active') then raise exception 'Two active members required' using errcode = '42501'; end if;
  select * into strict l from public.letters where id = lid and house_id = p_house_id for update;
  v_now := clock_timestamp();
  if not l.reveal_together or actor not in (l.sender_id,l.recipient_id) or l.deliver_at > v_now then raise exception 'Joint reveal unavailable' using errcode = '42501'; end if;
  select exists(select 1 from public.letter_openings where letter_id = lid) into opened;
  if kind = 'join' then
    select * into room from public.letter_reveal_sessions where letter_id = lid and closed_at is null for update;
    if found and room.expires_at <= v_now then
      update public.letter_reveal_sessions set closed_at = v_now where id = room.id;
      room.id := null;
    end if;
    if room.id is null then
      if opened then raise exception 'Letter already revealed'; end if;
      insert into public.letter_reveal_sessions(letter_id,house_id,expires_at) values(lid,p_house_id,v_now + interval '120 seconds') returning * into room;
    end if;
    insert into public.letter_reveal_participants(session_id,house_id,user_id,heartbeat_at) values(room.id,p_house_id,actor,v_now)
      on conflict(session_id,user_id) do update set heartbeat_at = excluded.heartbeat_at,
        ready = public.letter_reveal_participants.ready and public.letter_reveal_participants.heartbeat_at > v_now - interval '15 seconds';
  else
    sid := (p_command->>'sessionId')::uuid;
    select * into strict room from public.letter_reveal_sessions where id = sid and letter_id = lid and house_id = p_house_id for update;
    if not opened and room.closed_at is null and room.expires_at > v_now then
      select * into mine from public.letter_reveal_participants where session_id = sid and user_id = actor;
      if not found or mine.heartbeat_at is null then raise exception 'Join the reveal session first' using errcode = '42501'; end if;
      if kind = 'leave' then
        update public.letter_reveal_participants set heartbeat_at = null,ready = false where session_id = sid and user_id = actor;
      else
        -- A stale client cannot confirm with an old heartbeat; reconnect clears readiness.
        update public.letter_reveal_participants set ready = case when kind = 'ready' then mine.heartbeat_at > v_now - interval '15 seconds' else mine.ready and mine.heartbeat_at > v_now - interval '15 seconds' end,
          heartbeat_at = v_now where session_id = sid and user_id = actor;
        if kind = 'ready' and (select count(*) from public.letter_reveal_participants where session_id = sid and user_id in (l.sender_id,l.recipient_id) and ready and heartbeat_at > v_now - interval '15 seconds') = 2 then
          insert into public.letter_openings(letter_id,house_id,recipient_id,mode,opened_at) values(lid,p_house_id,l.recipient_id,'together',v_now) on conflict(letter_id) do nothing;
          update public.letter_reveal_sessions set closed_at = v_now where id = sid;
          opened := true;
        end if;
      end if;
    end if;
  end if;
  active := not opened and room.closed_at is null and room.expires_at > v_now;
  select * into mine from public.letter_reveal_participants where session_id = room.id and user_id = actor;
  select count(*)::integer into connected from public.letter_reveal_participants where session_id = room.id and user_id in (l.sender_id,l.recipient_id) and heartbeat_at > v_now - interval '15 seconds';
  return jsonb_build_object('sessionId',room.id,'letterId',lid,'houseId',p_house_id,'expiresAt',room.expires_at,
    'status',case when opened then 'revealed' when active then 'active' else 'expired' end,
    'connectedPlayers',case when active or opened then connected else 0 end,
    'ownPresent',coalesce((active or opened) and mine.heartbeat_at > v_now - interval '15 seconds',false),
    'ownReady',coalesce((active or opened) and mine.ready and mine.heartbeat_at > v_now - interval '15 seconds',false),
    'snapshot',public.letter_snapshot(lid,actor));
end;
$$;
revoke all on function public.apply_letter_reveal(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_letter_reveal(uuid,jsonb) to authenticated;
