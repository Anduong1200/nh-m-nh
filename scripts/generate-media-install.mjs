import { readFile, writeFile } from "node:fs/promises";
const name = "20261003010000_private_photos.sql";
const source = await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
await writeFile(new URL("../supabase/install-media.sql", import.meta.url), `-- GENERATED: node scripts/generate-media-install.mjs
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
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
