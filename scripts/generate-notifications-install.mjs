import { readFile, writeFile } from "node:fs/promises";
const name = "20261003030000_background_notifications.sql";
const source = await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
await writeFile(new URL("../supabase/install-notifications.sql", import.meta.url), `-- GENERATED: node scripts/generate-notifications-install.mjs
-- Additive notification support; apply once after House/Knock/Games/Letters.
begin;
do $guard$
begin
  if to_regclass('public.push_subscriptions') is not null or to_regclass('public.push_outbox') is not null then
    raise exception 'Notification pipeline already exists. No data changed.';
  end if;
  if to_regclass('public.knocks') is null or to_regclass('public.letters') is null or to_regclass('public.game_sessions') is null then
    raise exception 'House, Knock, Games and Letters required. No data changed.';
  end if;
end;
$guard$;
-- Source: ${name}
${source}
notify pgrst, 'reload schema';
commit;
`);
