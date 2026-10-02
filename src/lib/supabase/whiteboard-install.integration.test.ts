import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect,it } from "vitest";
import { textScene } from "@/modules/whiteboard/test-fixtures";
async function foundation() {
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
 return db;
}
it("installs Whiteboard on populated Board without changing House/Board rows, and refuses a second install atomically",async()=>{
 const db=await foundation();try{
  for(const name of (await readdir("supabase/migrations")).filter(n=>n.endsWith(".sql")&&n<"20261002020000").sort())await db.exec(await readFile("supabase/migrations/"+name,"utf8"));
  const a=crypto.randomUUID(),b=crypto.randomUUID();
  await db.query("insert into auth.users values ($1),($2)",[a,b]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  const house=(await db.query<{id:string}>("select public.create_house_with_owner() as id")).rows[0]!.id;
  await db.query("select public.create_pairing_invite($1,now()+interval '1 hour')",["f".repeat(64)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);await db.query("select public.accept_pairing_invite($1)",["f".repeat(64)]);
  await db.query("select public.apply_board_operation($1,$2,'append',$3,0,$4)",[crypto.randomUUID(),house,crypto.randomUUID(),{type:"note",payload:{text:"Board đã có"}}]);
  const board=(await db.query("select * from public.board_objects")).rows, members=(await db.query("select * from public.house_members order by user_id")).rows;
  const source=await readFile("supabase/migrations/20261002020000_whiteboard_snapshots.sql","utf8"),installer=await readFile("supabase/install-whiteboard.sql","utf8");
  expect(installer).toContain(source.replace(/[ \t]+(?=\r?$)/gm,""));
  await db.exec(installer);
  expect((await db.query("select * from public.board_objects")).rows).toEqual(board);
  expect((await db.query("select * from public.house_members order by user_id")).rows).toEqual(members);
  await db.exec("set role authenticated");
  const saved=(await db.query<{result:{outcome:string;snapshot:{version:number}}}>("select public.save_whiteboard_snapshot($1,$2,0,$3) as result",[crypto.randomUUID(),house,textScene()])).rows[0]!.result;
  expect(saved).toMatchObject({outcome:"applied",snapshot:{version:1}});
  await db.exec("reset role");await expect(db.exec(installer)).rejects.toThrow();await db.exec("rollback");
  expect((await db.query("select count(*)::integer as n from public.whiteboards")).rows[0]).toEqual({n:1});
 }finally{await db.close();}
},30000);
it("fresh-project generated setup contains and applies the complete canonical migration chain",async()=>{
 const db=await foundation();try{
  const setup=await readFile("supabase/setup-new-project.sql","utf8");
  for(const name of (await readdir("supabase/migrations")).filter(n=>n.endsWith(".sql")).sort())expect(setup).toContain((await readFile("supabase/migrations/"+name,"utf8")).replace(/[ \t]+(?=\r?$)/gm,""));
  await db.exec(setup);
  expect((await db.query("select relrowsecurity as rls from pg_class where relname in ('whiteboards','whiteboard_operations') order by relname")).rows).toEqual([{rls:true},{rls:true}]);
 }finally{await db.close();}
},30000);
