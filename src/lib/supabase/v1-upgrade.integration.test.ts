import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { createStorageSchema } from "../../../tests/fixtures/storage-schema";
import { letterAsUser } from "../../../tests/fixtures/letters-db";
it.each([false, true])("upgrades populated Phase 2 atomically, preserving identity (mascots=%s)", async withMascots => {
  const db = new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
    await createStorageSchema(db);
    const names = (await readdir("supabase/migrations")).filter(n => /^\d/.test(n) && n < "20261001110000").sort();
    for (const name of names) await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    const a = crypto.randomUUID(), b = crypto.randomUUID(); await db.query("insert into auth.users values($1),($2)", [a,b]);
    const house = (await letterAsUser<{ id: string }>(db,a,"select public.create_house_with_owner() id"))[0]!.id;
    await letterAsUser(db,a,"select public.create_pairing_invite($1,now()+interval '1 hour')",["c".repeat(64)]); await letterAsUser(db,b,"select public.accept_pairing_invite($1)",["c".repeat(64)]);
    if (withMascots) { await db.exec(await readFile("supabase/migrations/20261001110000_add_mascot_to_house_members.sql", "utf8")); await letterAsUser(db,a,"select public.assign_mascot('rabbit')"); }
    await db.query("insert into public.knocks(id,house_id,sender_id,recipient_id,kind,content) values($1,$2,$3,$4,'note','Dữ liệu cũ')", [crypto.randomUUID(),house,a,b]);
    const old = await db.query("select id,house_id,sender_id,recipient_id,content from public.knocks"), members = await db.query("select house_id,user_id,status,joined_at from public.house_members order by user_id");
    const upgrade = await readFile("supabase/upgrade-phase2-to-v1.sql","utf8"); await db.exec(upgrade);
    expect((await db.query("select id,house_id,sender_id,recipient_id,content from public.knocks")).rows).toEqual(old.rows); expect((await db.query("select house_id,user_id,status,joined_at from public.house_members order by user_id")).rows).toEqual(members.rows);
    expect((await db.query<{ mascot: string | null }>("select mascot from public.house_members order by user_id")).rows.filter(r=>r.mascot)).toHaveLength(withMascots?2:0);
    expect((await db.query<{ rls: boolean }>("select relrowsecurity rls from pg_class where relname in ('board_objects','whiteboards','game_sessions','letters','island_entries','push_outbox','media_objects')")).rows).toHaveLength(7);
    expect((await db.query<{ rls: boolean }>("select relrowsecurity rls from pg_class where relname in ('board_objects','whiteboards','game_sessions','letters','island_entries','push_outbox','media_objects')")).rows.every(r=>r.rls)).toBe(true);
    await expect(db.exec(upgrade)).rejects.toThrow(/Partial\/already installed/); await db.exec("rollback");
    expect((await db.query("select content from public.knocks")).rows).toEqual([{content:"Dữ liệu cũ"}]);
  } finally { await db.close(); }
},60000);
