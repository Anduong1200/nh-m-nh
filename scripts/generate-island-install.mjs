import { readFile, writeFile } from "node:fs/promises";
const name = "20261002040000_island_event_projection.sql";
const source = (await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8")).replace(/[ \t]+(?=\r?$)/gm, "");
await writeFile(new URL("../supabase/install-island.sql", import.meta.url), `-- GENERATED: node scripts/generate-island-install.mjs
-- Additive Island install on an existing Games domain project. Apply once.
begin;
do $guard$
begin
  if to_regprocedure('public.apply_game_command(uuid,jsonb)') is null or to_regclass('public.game_artifacts') is null or to_regprocedure('public.is_house_member(uuid)') is null then
    raise exception 'Hardened House and Games domain required. Apply prerequisites first.';
  end if;
  if to_regclass('public.island_events') is not null or to_regclass('public.island_state') is not null then
    raise exception 'Island already exists or requires schema review. No data changed.';
  end if;
end;
$guard$;
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
console.log("Generated transactional additive Island install.");
