-- Additive voice registration. Requires the existing private photo pipeline.
do $guard$
begin
  if to_regprocedure('public.register_verified_photo(uuid,uuid,uuid,bigint)') is null
    or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nha_minh_private_photo_read_guard') then
    raise exception 'Private photo pipeline required. No data changed.';
  end if;
  if not exists(select 1 from storage.buckets where id='nha-minh-private' and not public) then
    raise exception 'Private media bucket required. No data changed.';
  end if;
end;
$guard$;

-- Keep the established 4 MiB bound and existing allowed types; add only PCM WAV.
update storage.buckets
set allowed_mime_types=case when allowed_mime_types is null then array['image/jpeg','audio/wav']
  when not ('audio/wav'=any(allowed_mime_types)) then array_append(allowed_mime_types,'audio/wav') else allowed_mime_types end
where id='nha-minh-private' and not public;

create policy nha_minh_private_voice_read on storage.objects for select to authenticated
using(bucket_id='nha-minh-private' and exists(
  select 1 from public.media_objects m where m.bucket_id=storage.objects.bucket_id
    and m.storage_path=storage.objects.name and m.media_type='audio' and m.mime_type='audio/wav'
    and m.state='ready' and public.is_house_member(m.house_id)
));
-- Preserve the restrictive boundary against unrelated permissive policies.
alter policy nha_minh_private_photo_read_guard on storage.objects
using(bucket_id<>'nha-minh-private' or exists(
  select 1 from public.media_objects m where m.bucket_id=storage.objects.bucket_id
    and m.storage_path=storage.objects.name and (m.media_type='photo' or (m.media_type='audio' and m.mime_type='audio/wav'))
    and m.state='ready' and public.is_house_member(m.house_id)
));
-- Authenticated/anonymous INSERT, UPDATE and DELETE guards remain untouched.

create function public.register_verified_voice(p_id uuid,p_house_id uuid,p_actor_id uuid,p_size bigint,p_duration numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.media_objects; object_size bigint;
begin
  if p_id is null or p_actor_id is null or p_size is null or p_size<45 or p_size>4194304
    or p_duration is null or p_duration<=0 or p_duration>60 then raise exception 'Invalid voice'; end if;
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
      and o.metadata->>'mimetype'='audio/wav' for share of o;
  if object_size is null or object_size<>p_size then raise exception 'Uploaded bytes not confirmed'; end if;
  insert into public.media_objects(id,house_id,owner_id,media_type,bucket_id,storage_path,state,mime_type,size_bytes,duration_seconds)
    values(p_id,p_house_id,p_actor_id,'audio','nha-minh-private',p_house_id::text||'/'||p_id::text,'ready','audio/wav',p_size,p_duration)
    returning * into result;
  return to_jsonb(result);
end;
$$;
revoke all on function public.register_verified_voice(uuid,uuid,uuid,bigint,numeric) from public,anon,authenticated;
grant execute on function public.register_verified_voice(uuid,uuid,uuid,bigint,numeric) to service_role;
