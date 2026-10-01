-- Additive repair of Phase 1 authorization. No rows are deleted.
-- Invalid existing membership data causes this migration to fail safely.
alter table public.house_members add column slot smallint;

update public.house_members as member
set slot = assigned.slot
from (
  select house_id, user_id,
    row_number() over (partition by house_id order by joined_at, user_id)::smallint as slot
  from public.house_members where status = 'active'
) as assigned
where member.house_id = assigned.house_id and member.user_id = assigned.user_id;

alter table public.house_members add constraint house_members_active_slot
  check (status <> 'active' or (slot is not null and slot in (1, 2)));
create unique index house_members_active_slot_unique
  on public.house_members (house_id, slot) where status = 'active';
create unique index house_members_one_active_house
  on public.house_members (user_id) where status = 'active';

create or replace function public.is_house_member(p_house_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.house_members m join public.houses h on h.id = m.house_id
    where m.house_id = p_house_id and m.user_id = auth.uid()
      and m.status = 'active' and h.state = 'active'
  );
$$;

create or replace function public.shares_house_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.house_members mine
    join public.house_members theirs on theirs.house_id = mine.house_id
    join public.houses h on h.id = mine.house_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
      and mine.status = 'active' and theirs.status = 'active' and h.state = 'active'
  );
$$;

create or replace function public.current_house_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.house_id from public.house_members m join public.houses h on h.id = m.house_id
  where m.user_id = auth.uid() and m.status = 'active' and h.state = 'active';
$$;

revoke all on function public.is_house_member(uuid), public.shares_house_with(uuid),
  public.current_house_id() from public, anon;
grant execute on function public.is_house_member(uuid), public.shares_house_with(uuid),
  public.current_house_id() to authenticated;

drop policy if exists profiles_select_housemate on public.profiles;
create policy profiles_select_housemate on public.profiles for select to authenticated
  using (public.shares_house_with(id));
drop policy if exists houses_select_member on public.houses;
drop policy if exists houses_insert_authenticated on public.houses;
create policy houses_select_member on public.houses for select to authenticated
  using (public.is_house_member(id));
drop policy if exists house_members_select on public.house_members;
drop policy if exists house_members_insert_self on public.house_members;
drop policy if exists house_members_update_own on public.house_members;
create policy house_members_select on public.house_members for select to authenticated
  using (public.is_house_member(house_id));
drop policy if exists pairing_invites_insert on public.pairing_invites;

revoke all on public.profiles, public.houses, public.house_members, public.pairing_invites
  from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.houses, public.house_members, public.pairing_invites to authenticated;

create or replace function public.enforce_two_member_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' and (NEW.house_id <> OLD.house_id or NEW.user_id <> OLD.user_id) then
    raise exception 'Membership keys are immutable' using errcode = '23514';
  end if;
  if NEW.status <> 'active' then return NEW; end if;
  perform 1 from public.houses where id = NEW.house_id for update;
  if not found then raise exception 'House not found' using errcode = '23503'; end if;
  if NEW.slot is null then
    select candidate into NEW.slot from generate_series(1, 2) as candidate
    where not exists (
      select 1 from public.house_members member
      where member.house_id = NEW.house_id and member.status = 'active'
        and member.slot = candidate and member.user_id <> NEW.user_id
    ) order by candidate limit 1;
  end if;
  if NEW.slot is null then
    raise exception 'House is full' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_two_member_limit() from public, anon, authenticated;

create or replace function public.create_house_with_owner()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_house_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  -- Account-level serialization also covers simultaneous creates for this user.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  if exists (select 1 from public.house_members where user_id = v_user_id and status = 'active') then
    raise exception 'Already in a house' using errcode = 'P0002';
  end if;
  insert into public.houses (state) values ('active') returning id into v_house_id;
  insert into public.house_members (house_id, user_id, role, slot)
    values (v_house_id, v_user_id, 'creator', 1);
  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;
  return v_house_id;
end;
$$;

create or replace function public.create_pairing_invite(p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_house_id uuid; v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  perform 1 from public.houses where id = v_house_id for update;
  if (select count(*) from public.house_members where house_id = v_house_id and status = 'active') <> 1 then
    raise exception 'House is full' using errcode = 'P0002';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'Invalid invite settings' using errcode = '22023';
  end if;
  insert into public.pairing_invites (house_id, token_hash, created_by, expires_at)
    values (v_house_id, p_token_hash, v_user_id, p_expires_at) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_pairing_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_invite public.pairing_invites; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select * into v_invite from public.pairing_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'Invalid invite' using errcode = 'P0002'; end if;
  if v_invite.used_at is not null then raise exception 'Invite already used' using errcode = 'P0002'; end if;
  if v_invite.expires_at <= now() then raise exception 'Invite expired' using errcode = 'P0002'; end if;
  if v_invite.created_by = v_user_id then raise exception 'Cannot accept your own invite' using errcode = 'P0002'; end if;
  if exists (select 1 from public.house_members where user_id = v_user_id and status = 'active') then
    raise exception 'Already in a house' using errcode = 'P0002';
  end if;
  perform 1 from public.houses where id = v_invite.house_id and state = 'active' for update;
  if not found or not exists (
    select 1 from public.house_members where house_id = v_invite.house_id
      and user_id = v_invite.created_by and status = 'active'
  ) then raise exception 'Invalid invite' using errcode = 'P0002'; end if;
  if (select count(*) from public.house_members where house_id = v_invite.house_id and status = 'active') <> 1 then
    raise exception 'House is full' using errcode = 'P0002';
  end if;
  insert into public.house_members (house_id, user_id, status)
    values (v_invite.house_id, v_user_id, 'active')
    on conflict (house_id, user_id) do update set status = 'active', slot = null, left_at = null;
  update public.pairing_invites set used_at = now(), used_by = v_user_id where id = v_invite.id;
  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;
  return v_invite.house_id;
end;
$$;

revoke all on function public.create_house_with_owner(),
  public.create_pairing_invite(text, timestamptz), public.accept_pairing_invite(text) from public, anon;
grant execute on function public.create_house_with_owner(),
  public.create_pairing_invite(text, timestamptz), public.accept_pairing_invite(text) to authenticated;
