import { readFile, writeFile } from "node:fs/promises";
const name = "20261003020000_island_journal.sql";
const source = (await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8")).replace(/[ \t]+(?=\r?$)/gm, "");
await writeFile(new URL("../supabase/install-island-journal.sql", import.meta.url), `-- GENERATED: node scripts/generate-island-journal-install.mjs
-- Additive journal on the existing Island + Games + hardened House. Apply once.
begin;
do $guard$
begin
  if to_regclass('public.island_events') is null or to_regclass('public.game_artifacts') is null or to_regprocedure('public.get_island_state(uuid)') is null then
    raise exception 'Island and Games domain required. Apply prerequisites first.';
  end if;
  if to_regclass('public.island_entries') is not null or to_regclass('public.island_entry_operations') is not null then
    raise exception 'Island journal already exists or requires schema review. No data changed.';
  end if;
end;
$guard$;
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
console.log("Generated transactional additive Island journal install.");
