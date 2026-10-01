-- Additive identity repair. Existing assignments and member permissions remain.
-- Serialize on the House before locking members, matching pairing's lock order.
create or replace function public.assign_mascot(p_mascot public.mascot_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_house_id uuid;
  v_current_mascot public.mascot_type;
  v_partner_id uuid;
  v_partner_mascot public.mascot_type;
  v_opposite_mascot public.mascot_type;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_mascot is null then
    raise exception 'Invalid mascot' using errcode = '22023';
  end if;

  v_house_id := public.current_house_id();
  if v_house_id is null then
    raise exception 'House membership required' using errcode = '42501';
  end if;
  perform 1 from public.houses where id = v_house_id and state = 'active' for update;
  if not found then
    raise exception 'Active House required' using errcode = '42501';
  end if;

  -- Recheck after the House lock: membership can change while waiting for it.
  select mascot into v_current_mascot from public.house_members
  where house_id = v_house_id and user_id = v_user_id and status = 'active'
  for update;
  if not found then
    raise exception 'House membership required' using errcode = '42501';
  end if;
  if v_current_mascot = p_mascot then return; end if; -- Safe response-loss retry.
  if v_current_mascot is not null then
    raise exception 'Mascot already assigned' using errcode = 'P0002';
  end if;

  select user_id, mascot into v_partner_id, v_partner_mascot
  from public.house_members
  where house_id = v_house_id and user_id <> v_user_id and status = 'active'
  for update;
  if v_partner_mascot = p_mascot then
    raise exception 'Mascot already taken by partner' using errcode = 'P0002';
  end if;

  v_opposite_mascot := case when p_mascot = 'rabbit' then 'owl' else 'rabbit' end;
  update public.house_members set mascot = p_mascot
  where house_id = v_house_id and user_id = v_user_id and status = 'active';
  if v_partner_id is not null and v_partner_mascot is null then
    update public.house_members set mascot = v_opposite_mascot
    where house_id = v_house_id and user_id = v_partner_id and status = 'active';
  end if;
end;
$$;

revoke all on function public.assign_mascot(public.mascot_type) from public, anon;
grant execute on function public.assign_mascot(public.mascot_type) to authenticated;
