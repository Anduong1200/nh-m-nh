import { readFile, readdir, writeFile } from "node:fs/promises";
const directory = new URL("../supabase/migrations/", import.meta.url);
const names = (await readdir(directory)).filter(name => /^\d{14}_.+\.sql$/.test(name) && name >= "20261001110000").sort();
const source = async name => (await readFile(new URL(name, directory), "utf8")).replace(/[ \t]+(?=\r?$)/gm, "");
const identity = names[0];
const sections = await Promise.all(names.slice(1).map(async name => `-- Source: ${name}\n${await source(name)}`));
const sql = `-- GENERATED: node scripts/generate-v1-upgrade.mjs
-- Existing Phase 2 project ONLY, without Board/Whiteboard/Games/Letters/Island.
-- Preserves profiles, Houses, pairing, status, Knocks, preferences and mascots.
-- Rejects a partial/new/already upgraded schema. Do NOT remove the guards.
-- Any error rolls back this complete additive upgrade.
begin;
select pg_advisory_xact_lock(hashtextextended('nha-minh-v1-install',0));
do $guard$
declare t text;
begin
  foreach t in array array['profiles','houses','house_members','pairing_invites','presence_entries','knocks','notification_preferences','knock_dismissals'] loop
    if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Phase 2 baseline with RLS required: %',t;
    end if;
  end loop;
  if to_regprocedure('public.current_house_id()') is null or to_regprocedure('public.is_house_member(uuid)') is null then
    raise exception 'Hardened House authorization baseline required';
  end if;
  foreach t in array array['board_objects','board_operations','media_objects','whiteboards','whiteboard_operations','game_sessions','letters','island_events','island_entries','push_subscriptions','push_outbox'] loop
    if to_regclass('public.'||t) is not null then raise exception 'Partial/already installed V1: %. Use individual reviewed installers instead.',t; end if;
  end loop;
  if to_regtype('public.mascot_type') is null then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='house_members' and column_name='mascot') then raise exception 'Unexpected mascot schema'; end if;
    -- Source: ${identity}
    execute $identity_sql$
${await source(identity)}
    $identity_sql$;
  elsif not exists(select 1 from information_schema.columns where table_schema='public' and table_name='house_members' and column_name='mascot' and udt_name='mascot_type') then
    raise exception 'Incomplete mascot schema';
  end if;
end;
$guard$;

${sections.join("\n\n")}

notify pgrst, 'reload schema';
commit;
`;
await writeFile(new URL("../supabase/upgrade-phase2-to-v1.sql", import.meta.url), sql);
console.log(`Generated guarded Phase 2 upgrade from ${names.length} canonical migrations.`);
