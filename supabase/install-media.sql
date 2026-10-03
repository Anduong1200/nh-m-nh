-- GENERATED: node scripts/generate-media-install.mjs
-- Additive private photo pipeline, apply once after Board media domain.
begin;
do $guard$
begin
  if to_regclass('public.media_objects') is null or to_regprocedure('public.is_house_member(uuid)') is null then
    raise exception 'Hardened House and Board media domain required';
  end if;
  if to_regprocedure('public.register_verified_photo(uuid,uuid,uuid,bigint)') is not null then
    raise exception 'Photo pipeline already exists. No data changed.';
  end if;
end;
$guard$;
-- Source: 20261003010000_private_photos.sql
-- Additive photo pipeline. Browser metadata writes remain forbidden.
do $guard$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage schema required';
  end if;
  if exists(select 1 from storage.buckets where id='nha-minh-private' and public) then
    raise exception 'Existing public bucket requires explicit migration review. No data changed.';
  end if;
end;
$guard$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nha-minh-private','nha-minh-private',false,4194304,array['image/jpeg'])
on conflict(id) do nothing;

-- No authenticated INSERT, UPDATE or DELETE policy. Uploads use server-only key.
create policy nha_minh_private_photo_read on storage.objects for select to authenticated
using(bucket_id='nha-minh-private' and exists(
  select 1 from public.media_objects m
  where m.bucket_id=storage.objects.bucket_id and m.storage_path=storage.objects.name
    and m.media_type='photo' and m.state='ready' and public.is_house_member(m.house_id)
));

-- Supabase policies compose with OR by default. Restrictive guards protect this
-- bucket even when an existing project has broad permissive policies elsewhere.
create policy nha_minh_private_photo_read_guard on storage.objects as restrictive for select to authenticated
using(bucket_id<>'nha-minh-private' or exists(
  select 1 from public.media_objects m where m.bucket_id=storage.objects.bucket_id
    and m.storage_path=storage.objects.name and m.media_type='photo'
    and m.state='ready' and public.is_house_member(m.house_id)
));
create policy nha_minh_private_photo_insert_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'nha-minh-private');
create policy nha_minh_private_photo_update_guard on storage.objects as restrictive for update to authenticated
using(bucket_id<>'nha-minh-private') with check(bucket_id<>'nha-minh-private');
create policy nha_minh_private_photo_delete_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'nha-minh-private');

-- Anonymous policies on other buckets must never open this private bucket.
create policy nha_minh_private_photo_anon_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'nha-minh-private') with check(bucket_id<>'nha-minh-private');

create function public.register_verified_photo(p_id uuid,p_house_id uuid,p_actor_id uuid,p_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.media_objects; object_size bigint;
begin
  if p_id is null or p_actor_id is null or p_size is null or p_size<1 or p_size>4194304 then raise exception 'Invalid photo'; end if;
  perform 1 from public.houses where id=p_house_id and state='active' for update;
  if not found then raise exception 'House access denied' using errcode='42501'; end if;
  perform 1 from public.house_members where house_id=p_house_id and status='active' order by user_id for share;
  if (select count(*) from public.house_members where house_id=p_house_id and status='active')<>2
    or not exists(select 1 from public.house_members where house_id=p_house_id and user_id=p_actor_id and status='active') then
    raise exception 'House access denied' using errcode='42501';
  end if;
  select (o.metadata->>'size')::bigint into object_size from storage.objects o
    join storage.buckets b on b.id=o.bucket_id and not b.public
    where o.bucket_id='nha-minh-private' and o.name=p_house_id::text||'/'||p_id::text
      and o.metadata->>'mimetype'='image/jpeg' for share of o;
  if object_size is null or object_size<>p_size then raise exception 'Uploaded bytes not confirmed'; end if;
  insert into public.media_objects(id,house_id,owner_id,media_type,bucket_id,storage_path,state,mime_type,size_bytes)
    values(p_id,p_house_id,p_actor_id,'photo','nha-minh-private',p_house_id::text||'/'||p_id::text,'ready','image/jpeg',p_size)
    returning * into result;
  return to_jsonb(result);
end;
$$;
revoke all on function public.register_verified_photo(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.register_verified_photo(uuid,uuid,uuid,bigint) to service_role;

notify pgrst, 'reload schema';
commit;
