import { readFile, writeFile } from "node:fs/promises";
const sources = ["20261001120000_create_board_objects.sql", "20261002010000_board_domain.sql"];
for (const install of [true, false]) {
  const names = install ? sources : sources.slice(1);
  const sections = await Promise.all(names.map(async (name) => `-- Source: ${name}\n${(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).replace(/[ \t]+(?=\r?$)/gm, "")}`));
  const sql = `-- GENERATED: node scripts/generate-board-upgrade.mjs
-- ${install ? "Install Board on an existing Phase 2 project without board_objects." : "Upgrade an existing legacy Board; preserve all user rows."}
-- Apply once; never use this artifact on a fresh/empty project.
begin;
do $board_guard$
begin
  if to_regclass('public.house_members') is null or to_regprocedure('public.current_house_id()') is null
    or to_regclass('public.presence_entries') is null then
    raise exception 'Phase 2 baseline required.';
  end if;
  if ${install ? "to_regclass('public.board_objects') is not null" : "to_regclass('public.board_objects') is null"} then
    raise exception '${install ? "Board already exists: use upgrade-board-domain.sql." : "Legacy Board required: use install-board-domain.sql."}';
  end if;
  if to_regclass('public.board_operations') is not null or to_regclass('public.media_objects') is not null then
    raise exception 'Board domain already installed or schema requires review.';
  end if;
end;
$board_guard$;

${sections.join("\n\n")}

notify pgrst, 'reload schema';
commit;
`;
  await writeFile(new URL(`../supabase/${install ? "install" : "upgrade"}-board-domain.sql`, import.meta.url), sql);
}
console.log("Generated transactional Board install and legacy upgrade from canonical migrations.");
