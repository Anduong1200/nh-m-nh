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
