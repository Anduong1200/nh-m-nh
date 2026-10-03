import { readFile, writeFile } from "node:fs/promises";
const name = "20261003015000_private_voice.sql";
const source = await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
await writeFile(new URL("../supabase/install-voice.sql", import.meta.url), `-- GENERATED: node scripts/generate-voice-install.mjs
-- Additive private voice pipeline, apply once after install-media.sql.
begin;
do $guard$
begin
  if to_regprocedure('public.register_verified_voice(uuid,uuid,uuid,bigint,numeric)') is not null then
    raise exception 'Voice pipeline already exists. No data changed.';
  end if;
end;
$guard$;
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
