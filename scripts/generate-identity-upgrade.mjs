import { readFile, writeFile } from "node:fs/promises";

const names = [
  "20261001110000_add_mascot_to_house_members.sql",
  "20261001111500_harden_mascot_assignment.sql",
];
const sections = await Promise.all(names.map(async (name) => {
  const source = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
  return `-- Source: ${name}\n${source.replace(/[ \t]+(?=\r?$)/gm, "")}`;
}));
const sql = `-- GENERATED: node scripts/generate-identity-upgrade.mjs
-- Incremental upgrade from the three Phase 2 migrations, NOT fresh setup.
-- Apply once in the existing project. No user rows are deleted or reassigned.
-- If mascot already exists, apply only the hardening migration separately.
begin;

do $identity_guard$
begin
  if to_regclass('public.house_members') is null
    or to_regprocedure('public.current_house_id()') is null
    or to_regclass('public.presence_entries') is null then
    raise exception 'Phase 2 baseline required before this identity upgrade.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'house_members' and column_name = 'mascot'
  ) then
    raise exception 'Identity already installed. Apply only 20261001111500_harden_mascot_assignment.sql if needed.';
  end if;
end;
$identity_guard$;

${sections.join("\n\n")}

notify pgrst, 'reload schema';
commit;
`;
await writeFile(new URL("../supabase/upgrade-identity.sql", import.meta.url), sql);
console.log("Generated transactional identity upgrade from 2 canonical migrations.");
