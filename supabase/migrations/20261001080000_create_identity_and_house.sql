-- Phase 1: Identity & House
-- Creates profiles, houses, house_members, pairing_invites
-- with RLS policies and transactional two-member enforcement.

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can insert their own profile (bootstrap on first sign-in).
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile.
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- houses
-- ============================================================
create type public.house_state as enum ('active', 'archived');

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nhà Mình',
  state public.house_state not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.houses enable row level security;

-- Authenticated users can create a house (they must also join it in the same tx).
create policy "houses_insert_authenticated"
  on public.houses for insert
  with check (auth.uid() is not null);

-- ============================================================
-- house_members
-- ============================================================
create type public.member_status as enum ('active', 'left');

create table public.house_members (
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (house_id, user_id)
);

alter table public.house_members enable row level security;

-- Partner can read profile if in the same house.
create policy "profiles_select_housemate"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.house_members hm1
      join public.house_members hm2
        on hm1.house_id = hm2.house_id
      where hm1.user_id = auth.uid()
        and hm2.user_id = profiles.id
        and hm1.status = 'active'
        and hm2.status = 'active'
    )
  );

-- Only members can see their house.
create policy "houses_select_member"
  on public.houses for select
  using (
    exists (
      select 1 from public.house_members
      where house_members.house_id = houses.id
        and house_members.user_id = auth.uid()
        and house_members.status = 'active'
    )
  );

-- Members can see their own house's members.
create policy "house_members_select"
  on public.house_members for select
  using (
    exists (
      select 1 from public.house_members as my
      where my.house_id = house_members.house_id
        and my.user_id = auth.uid()
        and my.status = 'active'
    )
  );

-- Authenticated users can insert themselves as members.
create policy "house_members_insert_self"
  on public.house_members for insert
  with check (
    auth.uid() = user_id
    and status = 'active'
  );

-- Members can update their own membership (e.g., leave).
create policy "house_members_update_own"
  on public.house_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Transactional constraint: at most 2 active members per house.
-- This is a partial unique index + trigger approach for safety.
create or replace function public.enforce_two_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if NEW.status <> 'active' then
    return NEW;
  end if;

  select count(*)
  into active_count
  from public.house_members
  where house_id = NEW.house_id
    and status = 'active'
    and user_id <> NEW.user_id;

  if active_count >= 2 then
    raise exception 'House already has 2 active members'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger trg_enforce_two_member_limit
  before insert or update on public.house_members
  for each row
  execute function public.enforce_two_member_limit();

-- Also add a partial index as a secondary safety net (allows at most 2 active).
-- Note: a unique index on (house_id) where status='active' limits to 1,
-- so we use an exclusion-style approach via trigger above.

-- ============================================================
-- pairing_invites
-- ============================================================
create table public.pairing_invites (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  token_hash text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Index for looking up by token hash.
create unique index pairing_invites_token_hash_idx on public.pairing_invites(token_hash);

alter table public.pairing_invites enable row level security;

-- Creator can see their own invites.
create policy "pairing_invites_select_creator"
  on public.pairing_invites for select
  using (auth.uid() = created_by);

-- Active house members can create invites.
create policy "pairing_invites_insert"
  on public.pairing_invites for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.house_members
      where house_members.house_id = pairing_invites.house_id
        and house_members.user_id = auth.uid()
        and house_members.status = 'active'
    )
  );

-- ============================================================
-- RPC: accept_pairing_invite
-- Validates token, checks expiry, checks single-use, checks house capacity,
-- then adds the user as a member. Runs as security definer for transactional safety.
-- ============================================================
create or replace function public.accept_pairing_invite(
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_active_count integer;
  v_user_id uuid;
  v_existing_membership integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Lock the invite row.
  select *
  into v_invite
  from public.pairing_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'Invalid invite' using errcode = 'P0002';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used' using errcode = 'P0002';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Invite expired' using errcode = 'P0002';
  end if;

  if v_invite.created_by = v_user_id then
    raise exception 'Cannot accept your own invite' using errcode = 'P0002';
  end if;

  -- Check user is not already in this house.
  select count(*)
  into v_existing_membership
  from public.house_members
  where house_id = v_invite.house_id
    and user_id = v_user_id
    and status = 'active';

  if v_existing_membership > 0 then
    raise exception 'Already a member of this house' using errcode = 'P0002';
  end if;

  -- Check house capacity (must be < 2 active members).
  select count(*)
  into v_active_count
  from public.house_members
  where house_id = v_invite.house_id
    and status = 'active'
  for update;

  if v_active_count >= 2 then
    raise exception 'House is full' using errcode = 'P0002';
  end if;

  -- Mark invite as used.
  update public.pairing_invites
  set used_at = now(),
      used_by = v_user_id
  where id = v_invite.id;

  -- Add the user as a member.
  insert into public.house_members (house_id, user_id, status)
  values (v_invite.house_id, v_user_id, 'active');

  -- Ensure the new user has a profile.
  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  return v_invite.house_id;
end;
$$;

-- ============================================================
-- RPC: create_house_with_owner
-- Creates a new house and adds the caller as the first member.
-- Ensures the user doesn't already have an active house.
-- ============================================================
create or replace function public.create_house_with_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing_house uuid;
  v_house_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Check the user is not already in an active house.
  select house_id
  into v_existing_house
  from public.house_members
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if v_existing_house is not null then
    raise exception 'Already in a house' using errcode = 'P0002';
  end if;

  -- Create house.
  insert into public.houses (state)
  values ('active')
  returning id into v_house_id;

  -- Add creator as first member.
  insert into public.house_members (house_id, user_id, role, status)
  values (v_house_id, v_user_id, 'creator', 'active');

  -- Bootstrap profile if needed.
  insert into public.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  return v_house_id;
end;
$$;
