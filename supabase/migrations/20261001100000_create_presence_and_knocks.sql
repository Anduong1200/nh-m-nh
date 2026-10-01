-- Phase 2: explicit status, lightweight Knock, and private notification settings.
-- Writes derive the caller and their active House; direct writes are not exposed.
create table public.presence_entries (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id),
  user_id uuid not null references auth.users(id),
  mood text not null check (mood in ('calm', 'happy', 'tired', 'overwhelmed', 'missing_you')),
  energy smallint not null check (energy between 1 and 3),
  availability text not null check (availability in ('available', 'later', 'quiet')),
  note text not null default '' check (char_length(note) <= 160),
  need text not null default '' check (char_length(need) <= 100),
  expires_at timestamptz,
  cleared boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (house_id, user_id),
  foreign key (house_id, user_id) references public.house_members(house_id, user_id)
);
alter table public.presence_entries enable row level security;
create policy presence_entries_select on public.presence_entries for select to authenticated
  using (public.is_house_member(house_id) and (
    user_id = auth.uid() or (not cleared and (expires_at is null or expires_at > now()))
  ));

create table public.knocks (
  id uuid primary key,
  house_id uuid not null references public.houses(id),
  sender_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  kind text not null check (kind in ('note', 'sticker')),
  content text not null check (char_length(content) between 1 and 160),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  foreign key (house_id, sender_id) references public.house_members(house_id, user_id),
  foreign key (house_id, recipient_id) references public.house_members(house_id, user_id)
);
create index knocks_house_created on public.knocks(house_id, created_at desc);
alter table public.knocks enable row level security;
create policy knocks_select on public.knocks for select to authenticated
  using (public.is_house_member(house_id) and (sender_id = auth.uid() or recipient_id = auth.uid()));

create table public.knock_dismissals (
  knock_id uuid not null references public.knocks(id),
  user_id uuid not null references auth.users(id),
  dismissed_at timestamptz not null default now(),
  primary key (knock_id, user_id)
);
alter table public.knock_dismissals enable row level security;
create policy knock_dismissals_select on public.knock_dismissals for select to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.knocks k where k.id = knock_id and k.recipient_id = auth.uid()
      and public.is_house_member(k.house_id)
  ));

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id),
  quiet_enabled boolean not null default false,
  start_minute smallint not null default 1320 check (start_minute between 0 and 1439),
  end_minute smallint not null default 420 check (end_minute between 0 and 1439),
  timezone text not null default 'Asia/Ho_Chi_Minh' check (char_length(timezone) between 1 and 100),
  preview text not null default 'generic' check (preview in ('generic', 'detail')),
  knocks_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check (not quiet_enabled or start_minute <> end_minute)
);
alter table public.notification_preferences enable row level security;
create policy notification_preferences_select on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

revoke all on public.presence_entries, public.knocks, public.knock_dismissals,
  public.notification_preferences from public, anon, authenticated;
grant select on public.presence_entries, public.knocks, public.knock_dismissals,
  public.notification_preferences to authenticated;

create or replace function public.set_presence(
  p_mood text, p_energy integer, p_availability text, p_note text, p_need text,
  p_expires_at timestamptz, p_expected_version integer
)
returns public.presence_entries language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_house_id uuid; v_row public.presence_entries;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 0 or p_mood is null
    or p_mood not in ('calm', 'happy', 'tired', 'overwhelmed', 'missing_you')
    or p_energy is null or p_energy not between 1 and 3
    or p_availability is null or p_availability not in ('available', 'later', 'quiet')
    or p_note is null or char_length(p_note) > 160 or p_note ~ '[[:cntrl:]]'
    or p_need is null or char_length(p_need) > 100 or p_need ~ '[[:cntrl:]]'
    or (p_expires_at is not null and p_expires_at <= now()) then
    raise exception 'Invalid presence' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('presence:' || v_user_id::text, 0));
  select * into v_row from public.presence_entries where house_id = v_house_id and user_id = v_user_id for update;
  if coalesce(v_row.version, 0) <> p_expected_version then
    raise exception 'Presence version conflict' using errcode = '40001';
  end if;
  insert into public.presence_entries (house_id, user_id, mood, energy, availability, note, need, expires_at)
    values (v_house_id, v_user_id, p_mood, p_energy, p_availability, p_note, p_need, p_expires_at)
    on conflict (house_id, user_id) do update set
      mood = excluded.mood, energy = excluded.energy, availability = excluded.availability,
      note = excluded.note, need = excluded.need, expires_at = excluded.expires_at,
      cleared = false, version = presence_entries.version + 1, updated_at = now()
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.clear_presence(p_expected_version integer)
returns public.presence_entries language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_house_id uuid; v_row public.presence_entries;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid presence version' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('presence:' || v_user_id::text, 0));
  select * into v_row from public.presence_entries where house_id = v_house_id and user_id = v_user_id for update;
  if coalesce(v_row.version, 0) <> p_expected_version then
    raise exception 'Presence version conflict' using errcode = '40001';
  end if;
  -- Keep a version even for an initially empty status, protecting delayed drafts.
  insert into public.presence_entries (house_id, user_id, mood, energy, availability, cleared, expires_at)
    values (v_house_id, v_user_id, 'calm', 2, 'quiet', true, now())
    on conflict (house_id, user_id) do update set
      cleared = true, expires_at = now(), note = '', need = '',
      version = presence_entries.version + 1, updated_at = now()
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.send_knock(p_operation_id uuid, p_kind text, p_content text)
returns public.knocks language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_house_id uuid; v_recipient_id uuid; v_row public.knocks;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_house_id := public.current_house_id();
  if v_house_id is null then raise exception 'House membership required' using errcode = '42501'; end if;
  if p_operation_id is null or p_kind is null or p_kind not in ('note', 'sticker')
    or p_content is null or char_length(btrim(p_content)) not between 1 and 160
    or p_content ~ '[[:cntrl:]]' then
    raise exception 'Invalid Knock' using errcode = '22023';
  end if;
  if p_kind = 'sticker' and p_content not in ('leaf', 'tea', 'star', 'hug') then
    raise exception 'Invalid sticker' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('knock:' || p_operation_id::text, 0));
  select * into v_row from public.knocks where id = p_operation_id;
  if found then
    if v_row.sender_id <> v_user_id or v_row.house_id <> v_house_id
      or v_row.kind <> p_kind or v_row.content <> btrim(p_content) then
      raise exception 'Knock operation conflict' using errcode = '23505';
    end if;
    return v_row;
  end if;
  select user_id into v_recipient_id from public.house_members
    where house_id = v_house_id and status = 'active' and user_id <> v_user_id;
  if v_recipient_id is null then raise exception 'House is not paired' using errcode = 'P0002'; end if;
  insert into public.knocks (id, house_id, sender_id, recipient_id, kind, content)
    values (p_operation_id, v_house_id, v_user_id, v_recipient_id, p_kind, btrim(p_content)) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.dismiss_knock(p_knock_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.knocks
    where id = p_knock_id and recipient_id = v_user_id and public.is_house_member(house_id)) then
    raise exception 'Knock unavailable' using errcode = '42501';
  end if;
  insert into public.knock_dismissals (knock_id, user_id) values (p_knock_id, v_user_id)
    on conflict (knock_id, user_id) do nothing;
  return true;
end;
$$;

create or replace function public.set_notification_preferences(
  p_quiet_enabled boolean, p_start_minute integer, p_end_minute integer,
  p_timezone text, p_preview text, p_knocks_enabled boolean default true
)
returns public.notification_preferences language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_row public.notification_preferences;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_quiet_enabled is null or p_start_minute is null or p_start_minute not between 0 and 1439
    or p_end_minute is null or p_end_minute not between 0 and 1439
    or (p_quiet_enabled and p_start_minute = p_end_minute) or p_knocks_enabled is null
    or p_preview is null or p_preview not in ('generic', 'detail')
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid notification preferences' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id, quiet_enabled, start_minute, end_minute, timezone, preview, knocks_enabled)
    values (v_user_id, p_quiet_enabled, p_start_minute, p_end_minute, p_timezone, p_preview, p_knocks_enabled)
    on conflict (user_id) do update set quiet_enabled = excluded.quiet_enabled,
      start_minute = excluded.start_minute, end_minute = excluded.end_minute,
      timezone = excluded.timezone, preview = excluded.preview, knocks_enabled = excluded.knocks_enabled,
      updated_at = now() returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.set_presence(text, integer, text, text, text, timestamptz, integer),
  public.clear_presence(integer), public.send_knock(uuid, text, text), public.dismiss_knock(uuid),
  public.set_notification_preferences(boolean, integer, integer, text, text, boolean) from public, anon;
grant execute on function public.set_presence(text, integer, text, text, text, timestamptz, integer),
  public.clear_presence(integer), public.send_knock(uuid, text, text), public.dismiss_knock(uuid),
  public.set_notification_preferences(boolean, integer, integer, text, text, boolean) to authenticated;
