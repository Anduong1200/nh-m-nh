-- Phase 3A: Mascot & Identity
-- Add mascot column to house_members, ensure uniqueness per house,
-- and provide RPC for assignment.

create type public.mascot_type as enum ('rabbit', 'owl');

alter table public.house_members 
add column mascot public.mascot_type;

-- Ensure that within an active house, no two members have the same mascot.
create unique index house_members_unique_mascot 
  on public.house_members(house_id, mascot) 
  where status = 'active' and mascot is not null;

-- ============================================================
-- RPC: assign_mascot
-- Allows a user to choose their mascot. If the house has another member,
-- they will automatically receive the opposite mascot if they don't have one.
-- ============================================================
create or replace function public.assign_mascot(
  p_mascot public.mascot_type
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_house_id uuid;
  v_current_mascot public.mascot_type;
  v_partner_id uuid;
  v_partner_mascot public.mascot_type;
  v_opposite_mascot public.mascot_type;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_mascot = 'rabbit' then
    v_opposite_mascot := 'owl';
  else
    v_opposite_mascot := 'rabbit';
  end if;

  -- Lock the house members for this house to prevent race conditions
  select house_id, mascot
  into v_house_id, v_current_mascot
  from public.house_members
  where user_id = v_user_id and status = 'active'
  for update;

  if not found then
    raise exception 'Not in an active house' using errcode = 'P0002';
  end if;

  if v_current_mascot is not null then
    raise exception 'Mascot already assigned' using errcode = 'P0002';
  end if;

  -- Check if partner already has this mascot
  select user_id, mascot
  into v_partner_id, v_partner_mascot
  from public.house_members
  where house_id = v_house_id and user_id != v_user_id and status = 'active'
  for update;

  if found and v_partner_mascot = p_mascot then
    raise exception 'Mascot already taken by partner' using errcode = 'P0002';
  end if;

  -- Assign mascot to current user
  update public.house_members
  set mascot = p_mascot
  where house_id = v_house_id and user_id = v_user_id;

  -- Auto-assign opposite mascot to partner if they don't have one
  if found and v_partner_mascot is null then
    update public.house_members
    set mascot = v_opposite_mascot
    where house_id = v_house_id and user_id = v_partner_id;
  end if;
end;
$$;
