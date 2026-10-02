import { readFile,writeFile } from "node:fs/promises";
const name="20261002020000_whiteboard_snapshots.sql";
const source=(await readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8")).replace(/[ \t]+(?=\r?$)/gm,"");
const sql='-- GENERATED: node scripts/generate-whiteboard-install.mjs\n-- Install on an existing hardened Phase 2/Board project; apply once.\nbegin;\ndo $whiteboard_guard$\nbegin\n'
+"  if to_regprocedure('public.current_house_id()') is null or to_regclass('public.house_members') is null or to_regclass('public.presence_entries') is null or to_regclass('public.board_operations') is null then\n    raise exception 'Hardened Phase 2 and Board domain required; apply their migrations first.';\n  end if;\n"
+"  if to_regclass('public.whiteboards') is not null or to_regclass('public.whiteboard_operations') is not null then\n    raise exception 'Whiteboard already exists or requires schema review. No data changed.';\n  end if;\nend;\n$whiteboard_guard$;\n\n"
+"-- Source: "+name+"\n"+source+"\n\nnotify pgrst, 'reload schema';\ncommit;\n";
await writeFile(new URL("../supabase/install-whiteboard.sql",import.meta.url),sql);
console.log("Generated transactional additive Whiteboard install.");
