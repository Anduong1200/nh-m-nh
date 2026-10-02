import { readFile,writeFile } from "node:fs/promises";
const name = "20261002030000_game_domain.sql";
const source = (await readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8")).replace(/[ \t]+(?=\r?$)/gm,"");
const sql = `-- GENERATED: node scripts/generate-game-install.mjs
-- Additive install on an existing hardened Board domain project. Apply once.
begin;
do $games_guard$
begin
  if to_regprocedure('public.current_house_id()') is null or to_regclass('public.board_operations') is null or to_regclass('public.media_objects') is null then
    raise exception 'Hardened House and Board domain required; apply prerequisites first.';
  end if;
  if exists(select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename in ('game_sessions','game_players','game_events','game_answers','game_artifacts','game_operations')) then
    raise exception 'Games already exist or require schema review. No data changed.';
  end if;
end;
$games_guard$;

-- Source: ${name}
${source}

notify pgrst, 'reload schema';
commit;
`;
await writeFile(new URL("../supabase/install-games.sql",import.meta.url),sql);
console.log("Generated transactional additive Games install.");
