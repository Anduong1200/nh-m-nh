-- GENERATED: node scripts/generate-board-upgrade.mjs
-- Install Board on an existing Phase 2 project without board_objects.
-- Apply once; never use this artifact on a fresh/empty project.
begin;
do $board_guard$
begin
  if to_regclass('public.house_members') is null or to_regprocedure('public.current_house_id()') is null
    or to_regclass('public.presence_entries') is null then
    raise exception 'Phase 2 baseline required.';
  end if;
  if to_regclass('public.board_objects') is not null then
    raise exception 'Board already exists: use upgrade-board-domain.sql.';
  end if;
  if to_regclass('public.board_operations') is not null or to_regclass('public.media_objects') is not null then
    raise exception 'Board domain already installed or schema requires review.';
  end if;
end;
$board_guard$;

-- Source: 20261001120000_create_board_objects.sql
-- Phase 3B: Board objects (notes and links) with version check and soft deletion.

create table public.board_objects (
  id uuid primary key,
  house_id uuid not null references public.houses(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  type text not null check (type in ('note', 'link')),
  payload jsonb not null default '{}'::jsonb,
  x numeric not null default 0,
  y numeric not null default 0,
  rotation numeric not null default 0,
  z_index integer not null default 0,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (house_id, created_by) references public.house_members(house_id, user_id)
);

create index board_objects_house_id_idx on public.board_objects(house_id, deleted_at);

alter table public.board_objects enable row level security;

-- Read policy: Both members can view any non-hard-deleted object in their house.
create policy board_objects_select on public.board_objects for select to authenticated
  using (public.is_house_member(house_id));

-- We revoke direct mutation from anon/authenticated so that modifications must go through a secure RPC.
revoke insert, update, delete on public.board_objects from public, anon, authenticated;
grant select on public.board_objects to authenticated;

-- RPC for appending board objects
create or replace function public.append_board_object(
  p_id uuid,
  p_type text,
  p_payload jsonb,
  p_x numeric,
  p_y numeric,
  p_rotation numeric,
  p_z_index integer
)
returns public.board_objects language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_house_id uuid;
  v_row public.board_objects;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  if p_id is null or p_type not in ('note', 'link') or p_payload is null then
    raise exception 'Invalid board object data' using errcode = '22023';
  end if;

  insert into public.board_objects (
    id, house_id, created_by, type, payload, x, y, rotation, z_index
  ) values (
    p_id, v_house_id, v_user_id, p_type, p_payload, coalesce(p_x, 0), coalesce(p_y, 0), coalesce(p_rotation, 0), coalesce(p_z_index, 0)
  ) returning * into v_row;

  return v_row;
end;
$$;

-- RPC for updating or soft-deleting board objects
create or replace function public.update_board_object(
  p_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_x numeric,
  p_y numeric,
  p_rotation numeric,
  p_z_index integer,
  p_deleted boolean
)
returns public.board_objects language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_house_id uuid;
  v_row public.board_objects;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Invalid update parameters' using errcode = '22023';
  end if;

  -- Lock the row for update
  perform pg_advisory_xact_lock(hashtextextended('board_object:' || p_id::text, 0));
  select * into v_row from public.board_objects where house_id = v_house_id and id = p_id for update;

  if v_row.id is null then
    raise exception 'Board object not found or not in this house' using errcode = 'P0002';
  end if;

  if coalesce(v_row.version, 1) <> p_expected_version then
    raise exception 'Board object version conflict' using errcode = '40001';
  end if;

  -- "Trust model": either member can update/delete any object on the board.
  update public.board_objects set
    payload = coalesce(p_payload, v_row.payload),
    x = coalesce(p_x, v_row.x),
    y = coalesce(p_y, v_row.y),
    rotation = coalesce(p_rotation, v_row.rotation),
    z_index = coalesce(p_z_index, v_row.z_index),
    version = v_row.version + 1,
    updated_at = now(),
    deleted_at = case when coalesce(p_deleted, false) = true then now() else null end
  where id = p_id returning * into v_row;

  return v_row;
end;
$$;


-- Source: 20261002010000_board_domain.sql
-- Additive repair: preserve existing Board rows and all applied migrations.
-- Both members edit; only the creator may trash/restore. No purge API.
create table public.media_objects (
  id uuid primary key,
  house_id uuid not null references public.houses(id),
  owner_id uuid not null references auth.users(id),
  media_type text not null check (media_type in ('photo', 'audio')),
  bucket_id text not null default 'nha-minh-private' check (bucket_id = 'nha-minh-private'),
  storage_path text not null unique,
  state text not null default 'pending' check (state in ('pending', 'ready', 'error')),
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  unique (house_id, id),
  foreign key (house_id, owner_id) references public.house_members(house_id, user_id),
  check (storage_path = house_id::text || '/' || id::text),
  check (state <> 'ready' or (
    size_bytes is not null and size_bytes > 0 and size_bytes <= 20971520 and mime_type is not null and
    ((media_type = 'photo' and mime_type in ('image/jpeg','image/png','image/webp') and duration_seconds is null) or
     (media_type = 'audio' and mime_type in ('audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav') and duration_seconds is not null and duration_seconds > 0 and duration_seconds <= 60))
  ))
);
alter table public.media_objects enable row level security;
revoke all on public.media_objects from public, anon, authenticated;
grant select on public.media_objects to authenticated;
create policy media_objects_select on public.media_objects for select to authenticated
  using (public.is_house_member(house_id) and (state = 'ready' or owner_id = auth.uid()));
-- Only a trusted, byte-validating media pipeline may create/update metadata.
-- No client ready-state write or public URL registration is exposed here.

alter table public.board_objects add column media_id uuid;
alter table public.board_objects add constraint board_house_item_unique unique(house_id,id);
alter table public.board_objects add constraint board_media_house_fk
  foreign key (house_id, media_id) references public.media_objects(house_id, id);
alter table public.board_objects drop constraint board_objects_type_check;
alter table public.board_objects add constraint board_objects_type_check
  check (type in ('note','link','doodle','photo','voice'));

create function public.board_payload_valid(p_type text, p_payload jsonb, p_media_id uuid)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_stroke jsonb; v_point jsonb; v_points integer := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 262144 then return false; end if;
  if p_type = 'note' then
    return p_media_id is null and jsonb_typeof(p_payload->'text') = 'string'
      and char_length(p_payload->>'text') <= 10000
      and regexp_replace(p_payload->>'text', E'[\n\r\t]', '', 'g') !~ '[[:cntrl:]]'
      and not exists (select 1 from jsonb_object_keys(p_payload) k where k <> 'text');
  elsif p_type = 'link' then
    return p_media_id is null and jsonb_typeof(p_payload->'url') = 'string'
      and char_length(p_payload->>'url') between 1 and 2048
      and (p_payload->>'url') ~ '^https?://[^/?#[:space:]@]+([/?#][^[:space:]]*)?$'
      and (not p_payload ? 'title' or (jsonb_typeof(p_payload->'title') = 'string' and char_length(p_payload->>'title') <= 200 and (p_payload->>'title') !~ '[[:cntrl:]]'))
      and not exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('url','title'));
  elsif p_type in ('photo','voice') then
    return p_media_id is not null
      and (not p_payload ? 'caption' or (jsonb_typeof(p_payload->'caption') = 'string' and char_length(p_payload->>'caption') <= 1000 and regexp_replace(p_payload->>'caption', E'[\n\r\t]', '', 'g') !~ '[[:cntrl:]]'))
      and not exists (select 1 from jsonb_object_keys(p_payload) k where k <> 'caption');
  elsif p_type = 'doodle' then
    if p_media_id is not null or p_payload->'schemaVersion' is distinct from '1'::jsonb
      or jsonb_typeof(p_payload->'strokes') is distinct from 'array'
      or exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('schemaVersion','strokes')) then return false; end if;
    if jsonb_array_length(p_payload->'strokes') > 256 then return false; end if;
    for v_stroke in select value from jsonb_array_elements(p_payload->'strokes') loop
      if jsonb_typeof(v_stroke) is distinct from 'object' or jsonb_typeof(v_stroke->'color') is distinct from 'string'
        or (v_stroke->>'color') !~ '^#[a-fA-F0-9]{6}$' or jsonb_typeof(v_stroke->'width') is distinct from 'number'
        or jsonb_typeof(v_stroke->'points') is distinct from 'array'
        or exists (select 1 from jsonb_object_keys(v_stroke) k where k not in ('color','width','points')) then return false; end if;
      if (v_stroke->>'width')::numeric not between 0.5 and 32 then return false; end if;
      v_points := v_points + jsonb_array_length(v_stroke->'points');
      if v_points > 10000 then return false; end if;
      for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
        if jsonb_typeof(v_point) <> 'array' then return false; end if;
        if jsonb_array_length(v_point) <> 2 or jsonb_typeof(v_point->0) <> 'number' or jsonb_typeof(v_point->1) <> 'number' then return false; end if;
        if (v_point->>0)::numeric not between -10000 and 10000 or (v_point->>1)::numeric not between -10000 and 10000 then return false; end if;
      end loop;
    end loop;
    return true;
  end if;
  return false;
exception when others then return false;
end;
$$;
revoke all on function public.board_payload_valid(text,jsonb,uuid) from public, anon;
grant execute on function public.board_payload_valid(text,jsonb,uuid) to authenticated;
-- NOT VALID preserves old invalid rows; all new/modified rows are checked.
alter table public.board_objects add constraint board_payload_bounds
  check (public.board_payload_valid(type,payload,media_id) is true) not valid;
alter table public.board_objects add constraint board_layout_bounds
  check (x between -10000 and 10000 and y between -10000 and 10000
    and rotation between -180 and 180 and z_index between 0 and 1000000) not valid;

create table public.board_operations (
  operation_id uuid primary key,
  house_id uuid not null references public.houses(id),
  actor_id uuid not null references auth.users(id),
  item_id uuid not null,
  request jsonb not null,
  outcome text not null check (outcome in ('applied','conflict')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (house_id,actor_id) references public.house_members(house_id,user_id),
  foreign key (house_id,item_id) references public.board_objects(house_id,id)
);
alter table public.board_operations enable row level security;
revoke all on public.board_objects, public.board_operations from public, anon, authenticated;
grant select on public.board_objects, public.board_operations to authenticated;
create policy board_operations_select on public.board_operations for select to authenticated
  using (actor_id = auth.uid() and public.is_house_member(house_id));

-- Retire insecure legacy write entry points without deleting their definitions.
revoke all on function public.append_board_object(uuid,text,jsonb,numeric,numeric,numeric,integer),
  public.update_board_object(uuid,integer,jsonb,numeric,numeric,numeric,integer,boolean)
  from public, anon, authenticated;

create function public.apply_board_operation(
  p_operation_id uuid, p_house_id uuid, p_mutation text,
  p_item_id uuid, p_expected_version integer, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_request jsonb; v_previous public.board_operations;
  v_item public.board_objects; v_outcome text := 'applied'; v_media public.media_objects; v_key text;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_operation_id is null or p_item_id is null or p_house_id is null
    or p_mutation is null or p_mutation not in ('append','update','trash','restore')
    or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 300000
    or p_expected_version is null then raise exception 'Invalid operation' using errcode = '22023'; end if;
  if public.current_house_id() is distinct from p_house_id then raise exception 'House membership required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('board_operation:' || p_operation_id::text,0));
  perform 1 from public.houses where id = p_house_id and state = 'active' for update;
  if not found then raise exception 'Active House required' using errcode = '42501'; end if;
  perform 1 from public.house_members where house_id = p_house_id and user_id = v_actor and status = 'active' for share;
  if not found then raise exception 'House membership required' using errcode = '42501'; end if;
  v_request := jsonb_build_object('mutation',p_mutation,'itemId',p_item_id,'expectedVersion',p_expected_version,'data',p_data);
  select * into v_previous from public.board_operations where operation_id = p_operation_id;
  if found then
    if v_previous.house_id <> p_house_id or v_previous.actor_id <> v_actor or v_previous.request <> v_request then
      raise exception 'Operation identity mismatch' using errcode = '23505';
    end if;
    return jsonb_build_object('operation_id',p_operation_id,'house_id',p_house_id,'actor_id',v_actor,'outcome',v_previous.outcome,'item',v_previous.snapshot);
  end if;

  if p_mutation = 'append' then
    if p_expected_version <> 0 or exists (select 1 from jsonb_object_keys(p_data) k where k not in ('type','payload','mediaId','x','y','rotation','zIndex'))
      or jsonb_typeof(p_data->'type') <> 'string' or not p_data ? 'payload' then raise exception 'Invalid append' using errcode = '22023'; end if;
    v_item.id := p_item_id; v_item.house_id := p_house_id; v_item.created_by := v_actor;
    v_item.type := p_data->>'type'; v_item.payload := p_data->'payload';
    v_item.media_id := (p_data->>'mediaId')::uuid;
    v_item.x := coalesce((p_data->>'x')::numeric,0); v_item.y := coalesce((p_data->>'y')::numeric,0);
    v_item.rotation := coalesce((p_data->>'rotation')::numeric,0); v_item.z_index := coalesce((p_data->>'zIndex')::integer,0);
  else
    if p_expected_version < 1 then raise exception 'Invalid version' using errcode = '22023'; end if;
    select * into v_item from public.board_objects where id = p_item_id and house_id = p_house_id for update;
    if not found then raise exception 'Board object unavailable' using errcode = 'P0002'; end if;
    if p_mutation in ('trash','restore') and v_item.created_by <> v_actor then raise exception 'Creator required' using errcode = '42501'; end if;
    if v_item.version <> p_expected_version then v_outcome := 'conflict';
    elsif p_mutation = 'update' then
      if v_item.deleted_at is not null then raise exception 'Object is in trash' using errcode = 'P0002'; end if;
      if p_data = '{}'::jsonb or exists (select 1 from jsonb_object_keys(p_data) k where k not in ('payload','mediaId','x','y','rotation','zIndex')) then raise exception 'Invalid update' using errcode = '22023'; end if;
      if p_data ? 'payload' then v_item.payload := p_data->'payload'; end if;
      if p_data ? 'mediaId' then v_item.media_id := (p_data->>'mediaId')::uuid; end if;
      if p_data ? 'x' then v_item.x := (p_data->>'x')::numeric; end if;
      if p_data ? 'y' then v_item.y := (p_data->>'y')::numeric; end if;
      if p_data ? 'rotation' then v_item.rotation := (p_data->>'rotation')::numeric; end if;
      if p_data ? 'zIndex' then v_item.z_index := (p_data->>'zIndex')::integer; end if;
    elsif p_data <> '{}'::jsonb or (p_mutation = 'trash' and v_item.deleted_at is not null) or (p_mutation = 'restore' and v_item.deleted_at is null) then
      raise exception 'Invalid trash transition' using errcode = '22023';
    end if;
  end if;

  for v_key in select unnest(array['x','y','rotation','zIndex']) loop
    if p_data ? v_key and jsonb_typeof(p_data->v_key) is distinct from 'number' then raise exception 'Invalid layout type' using errcode = '22023'; end if;
  end loop;

  if v_outcome = 'applied' then
    if public.board_payload_valid(v_item.type,v_item.payload,v_item.media_id) is not true
      or v_item.x is null or v_item.y is null or v_item.rotation is null or v_item.z_index is null
      or v_item.x not between -10000 and 10000 or v_item.y not between -10000 and 10000
      or v_item.rotation not between -180 and 180 or v_item.z_index not between 0 and 1000000 then
      raise exception 'Invalid Board content' using errcode = '22023';
    end if;
    if v_item.media_id is not null then
      select * into v_media from public.media_objects where id = v_item.media_id and house_id = p_house_id and state = 'ready' for share;
      if not found or (v_item.type = 'photo' and v_media.media_type <> 'photo') or (v_item.type = 'voice' and v_media.media_type <> 'audio') then
        raise exception 'Media unavailable' using errcode = '42501';
      end if;
    end if;
    if p_mutation = 'append' then
      insert into public.board_objects(id,house_id,created_by,type,payload,media_id,x,y,rotation,z_index)
        values(v_item.id,p_house_id,v_actor,v_item.type,v_item.payload,v_item.media_id,v_item.x,v_item.y,v_item.rotation,v_item.z_index) returning * into v_item;
    else
      update public.board_objects set payload=v_item.payload, media_id=v_item.media_id,
        x=v_item.x, y=v_item.y, rotation=v_item.rotation, z_index=v_item.z_index,
        version=version+1, updated_at=now(),
        deleted_at=case when p_mutation='trash' then now() when p_mutation='restore' then null else deleted_at end
      where id=p_item_id and house_id=p_house_id returning * into v_item;
    end if;
  end if;
  insert into public.board_operations(operation_id,house_id,actor_id,item_id,request,outcome,snapshot)
    values(p_operation_id,p_house_id,v_actor,p_item_id,v_request,v_outcome,to_jsonb(v_item));
  return jsonb_build_object('operation_id',p_operation_id,'house_id',p_house_id,'actor_id',v_actor,'outcome',v_outcome,'item',to_jsonb(v_item));
end;
$$;
revoke all on function public.apply_board_operation(uuid,uuid,text,uuid,integer,jsonb) from public, anon;
grant execute on function public.apply_board_operation(uuid,uuid,text,uuid,integer,jsonb) to authenticated;


notify pgrst, 'reload schema';
commit;
