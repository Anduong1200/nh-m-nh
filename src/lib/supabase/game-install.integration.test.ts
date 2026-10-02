import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect,it } from "vitest";
const canonical = (sql: string) => sql.replace(/[ \t]+(?=\r?$)/gm,"").replaceAll("\r\n","\n").trim();
it("additive Games installer preserves existing House and Board data and fails atomically on repeat",async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
    for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && n < "20261002030000").sort()) await db.exec(await readFile("supabase/migrations/"+name,"utf8"));
    const a = crypto.randomUUID();await db.query("insert into auth.users(id) values($1)",[a]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec("set role authenticated");
    const house = (await db.query<{id:string}>("select public.create_house_with_owner() as id")).rows[0]!.id;
    await db.query("select public.apply_board_operation($1,$2,'append',$3,0,$4)",[crypto.randomUUID(),house,crypto.randomUUID(),{type:"note",payload:{text:"Giữ nguyên tờ giấy"}}]);
    await db.exec("reset role");const before = (await db.query("select * from public.board_objects")).rows;
    const installer = await readFile("supabase/install-games.sql","utf8");
    expect(canonical(installer)).toContain(canonical(await readFile("supabase/migrations/20261002030000_game_domain.sql","utf8")));
    await db.exec(installer);expect((await db.query("select * from public.board_objects")).rows).toEqual(before);
    await expect(db.exec(installer)).rejects.toThrow("Games already exist");await db.exec("rollback");
    expect((await db.query("select * from public.board_objects")).rows).toEqual(before);
    expect((await db.query("select relname from pg_class where relname='game_sessions'")).rows).toHaveLength(1);
  } finally {await db.close();}
},60000);
