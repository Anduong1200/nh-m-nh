import { readFile, writeFile } from "node:fs/promises";
const name = "20261002050000_letters_core.sql";
const source = (await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8")).replace(/[ \t]+(?=\r?$)/gm, "");
await writeFile(new URL("../supabase/install-letters.sql", import.meta.url), `-- GENERATED: node scripts/generate-letters-install.mjs
-- Additive Letters core for a hardened House project. Apply once.
begin;
do $guard$
begin
  if to_regprocedure('public.current_house_id()') is null or to_regprocedure('public.is_house_member(uuid)') is null or to_regclass('public.house_members') is null then
    raise exception 'Hardened House domain required; apply prerequisites first.';
  end if;
  if exists(select 1 from pg_catalog.pg_tables where schemaname='public' and tablename in ('letters','letter_contents','letter_openings','letter_operations','letter_reveal_sessions','letter_reveal_participants')) then
    raise exception 'Letters already exist or require schema review. No data changed.';
  end if;
end;
$guard$;
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
console.log("Generated transactional additive Letters install.");
