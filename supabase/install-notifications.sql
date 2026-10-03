-- GENERATED: node scripts/generate-notifications-install.mjs
-- Additive notification support; apply once after House/Knock/Games/Letters.
begin;
do $guard$
begin
  if to_regclass('public.push_subscriptions') is not null or to_regclass('public.push_outbox') is not null then
    raise exception 'Notification pipeline already exists. No data changed.';
  end if;
  if to_regclass('public.knocks') is null or to_regclass('public.letters') is null or to_regclass('public.game_sessions') is null then
    raise exception 'House, Knock, Games and Letters required. No data changed.';
  end if;
end;
$guard$;
-- Source: 20261003030000_background_notifications.sql
-- Explicit opt-in device subscriptions and private generic-only delivery outbox.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), house_id uuid not null references public.houses(id),
  owner_id uuid not null, endpoint text not null unique,
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22}$'),
  active boolean not null default true, enabled_at timestamptz not null default clock_timestamp(),
  foreign key(house_id,owner_id) references public.house_members(house_id,user_id),
  check(length(endpoint)<=2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)(:443)?/[^[:space:]#]+$')
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select on public.push_subscriptions to authenticated;
create policy push_subscriptions_owner_read on public.push_subscriptions for select to authenticated
using(owner_id=auth.uid() and public.is_house_member(house_id));

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.push_subscriptions(id),
  house_id uuid not null references public.houses(id), recipient_id uuid not null,
  kind text not null check(kind in ('knock','letter-delivered','game-turn')), source_id uuid not null,
  source_version integer not null default 0, not_before timestamptz not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','suppressed','cancelled','failed','expired')),
  attempts integer not null default 0 check(attempts between 0 and 4),
  lease_token uuid, lease_until timestamptz, retry_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(house_id,recipient_id) references public.house_members(house_id,user_id),
  unique(subscription_id,kind,source_id,source_version)
);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public,anon,authenticated;
create index push_outbox_pending on public.push_outbox(status,retry_at,not_before);

create function public.enroll_push_subscription(p_house_id uuid,p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.push_subscriptions;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if public.current_house_id() is distinct from p_house_id then raise exception 'House denied' using errcode='42501'; end if;
  perform 1 from public.houses where id=p_house_id and state='active' for update;
  if not found then raise exception 'House denied' using errcode='42501'; end if;
  perform 1 from public.house_members where house_id=p_house_id and status='active' order by user_id for share;
  if (select count(*) from public.house_members where house_id=p_house_id and status='active')<>2 then raise exception 'Paired House required' using errcode='42501'; end if;
  if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)(:443)?/[^[:space:]#]+$'
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invalid subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push_endpoint:'||p_endpoint,0));
  select * into current_row from public.push_subscriptions where endpoint=p_endpoint for update;
  if found then
    if current_row.owner_id<>actor or current_row.house_id<>p_house_id then raise exception 'Subscription owned by another account' using errcode='42501'; end if;
    update public.push_subscriptions set p256dh=p_p256dh,auth_key=p_auth,active=true,enabled_at=clock_timestamp() where id=current_row.id;
    update public.push_outbox set status='cancelled' where subscription_id=current_row.id and status in ('pending','sending');
    return current_row.id;
  end if;
  if (select count(*) from public.push_subscriptions where owner_id=actor and active)>=8 then raise exception 'Device limit reached'; end if;
  insert into public.push_subscriptions(house_id,owner_id,endpoint,p256dh,auth_key)
    values(p_house_id,actor,p_endpoint,p_p256dh,p_auth) returning * into current_row;
  return current_row.id;
end;
$$;
create function public.disable_push_subscription(p_house_id uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.current_house_id() is distinct from p_house_id then raise exception 'House denied' using errcode='42501'; end if;
  if not exists(select 1 from public.push_subscriptions where id=p_id and owner_id=auth.uid() and house_id=p_house_id) then raise exception 'Subscription denied' using errcode='42501'; end if;
  update public.push_subscriptions set active=false where id=p_id;
  update public.push_outbox set status='cancelled' where subscription_id=p_id and status in ('pending','sending');
  return true;
end;
$$;
revoke all on function public.enroll_push_subscription(uuid,text,text,text),public.disable_push_subscription(uuid,uuid) from public,anon;
grant execute on function public.enroll_push_subscription(uuid,text,text,text),public.disable_push_subscription(uuid,uuid) to authenticated;

create function public.enqueue_private_push(p_house uuid,p_recipient uuid,p_kind text,p_source uuid,p_version integer,p_due timestamptz)
returns void language sql security definer set search_path='' as $$
  insert into public.push_outbox(subscription_id,house_id,recipient_id,kind,source_id,source_version,not_before)
  select s.id,p_house,p_recipient,p_kind,p_source,p_version,p_due from public.push_subscriptions s
  where s.active and s.owner_id=p_recipient and s.house_id=p_house
    and exists(select 1 from public.house_members m where m.house_id=p_house and m.user_id=p_recipient and m.status='active')
  on conflict(subscription_id,kind,source_id,source_version) do nothing
$$;
create function public.enqueue_knock_push() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.enqueue_private_push(new.house_id,new.recipient_id,'knock',new.id,0,new.created_at); return new; end; $$;
create function public.enqueue_letter_push() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.enqueue_private_push(new.house_id,new.recipient_id,'letter-delivered',new.id,0,new.deliver_at); return new; end; $$;
create function public.enqueue_game_turn_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and (tg_op='UPDATE' or new.current_turn_user_id<>new.created_by) then
    perform public.enqueue_private_push(new.house_id,new.current_turn_user_id,'game-turn',new.id,new.version,clock_timestamp());
  end if;
  return new;
end; $$;
create trigger knocks_push after insert on public.knocks for each row execute function public.enqueue_knock_push();
create trigger letters_push after insert on public.letters for each row execute function public.enqueue_letter_push();
create trigger game_turn_push after insert or update of version,current_turn_user_id,status on public.game_sessions for each row execute function public.enqueue_game_turn_push();
revoke all on function public.enqueue_private_push(uuid,uuid,text,uuid,integer,timestamptz),public.enqueue_knock_push(),public.enqueue_letter_push(),public.enqueue_game_turn_push() from public,anon,authenticated;

create function public.push_source_ready(o public.push_outbox)
returns boolean language sql volatile security definer set search_path='' as $$
  select case o.kind
    when 'knock' then exists(select 1 from public.knocks k where k.id=o.source_id and k.house_id=o.house_id and k.recipient_id=o.recipient_id)
    when 'letter-delivered' then exists(select 1 from public.letters l where l.id=o.source_id and l.house_id=o.house_id and l.recipient_id=o.recipient_id and l.deliver_at<=statement_timestamp())
    when 'game-turn' then exists(select 1 from public.game_sessions g where g.id=o.source_id and g.house_id=o.house_id and g.status='active' and g.version=o.source_version and g.current_turn_user_id=o.recipient_id)
    else false end
$$;
create function public.push_delivery_ready(p_id uuid,p_lease_token uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.push_outbox o join public.push_subscriptions s on s.id=o.subscription_id
    join public.houses h on h.id=o.house_id and h.state='active'
    where o.id=p_id and o.lease_token=p_lease_token and o.status='sending' and o.lease_until>statement_timestamp()
      and s.active and s.house_id=o.house_id and s.owner_id=o.recipient_id and o.created_at>=s.enabled_at
      and (select count(*) from public.house_members m where m.house_id=o.house_id and m.status='active')=2
      and exists(select 1 from public.house_members m where m.house_id=o.house_id and m.user_id=o.recipient_id and m.status='active')
      and o.not_before<=statement_timestamp() and public.push_source_ready(o))
$$;
create function public.claim_push_deliveries(p_limit integer default 8)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare o public.push_outbox; s public.push_subscriptions; prefs jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>8 then raise exception 'Invalid dispatch limit'; end if;
  update public.push_outbox set status='expired' where status='pending' and not_before<clock_timestamp()-interval '24 hours';
  update public.push_outbox set status='failed' where status='sending' and lease_until<=clock_timestamp() and attempts>=4;
  for o in select * from public.push_outbox where (status='pending' or (status='sending' and lease_until<=clock_timestamp()))
    and attempts<4 and retry_at<=clock_timestamp() and not_before<=clock_timestamp()
    order by not_before,id limit p_limit for update skip locked loop
    update public.push_outbox set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where id=o.id returning * into o;
    if not public.push_delivery_ready(o.id,o.lease_token) then
      update public.push_outbox set status='cancelled' where id=o.id; continue;
    end if;
    select * into s from public.push_subscriptions where id=o.subscription_id;
    select to_jsonb(p) into prefs from public.notification_preferences p where p.user_id=o.recipient_id;
    return next jsonb_build_object('outbox_id',o.id,'lease_token',o.lease_token,'device_token',s.id,'event_id',o.id,'kind',o.kind,
      'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)),
      'preferences',prefs,'db_now',clock_timestamp());
  end loop;
end;
$$;
create function public.finish_push_delivery(p_id uuid,p_lease_token uuid,p_result text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.push_outbox;
begin
  if p_result is null or p_result not in ('sent','suppressed','retry','expired') then raise exception 'Invalid outcome'; end if;
  select * into o from public.push_outbox where id=p_id and lease_token=p_lease_token and status='sending' for update;
  if not found then return false; end if;
  if p_result='expired' then update public.push_subscriptions set active=false where id=o.subscription_id; end if;
  update public.push_outbox set status=case when p_result='retry' then case when attempts>=4 then 'failed' else 'pending' end else p_result end,
    retry_at=clock_timestamp()+interval '15 seconds'*power(2,attempts),lease_until=null where id=o.id;
  return true;
end;
$$;
revoke all on function public.push_source_ready(public.push_outbox),public.push_delivery_ready(uuid,uuid),public.claim_push_deliveries(integer),public.finish_push_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.push_delivery_ready(uuid,uuid),public.claim_push_deliveries(integer),public.finish_push_delivery(uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
