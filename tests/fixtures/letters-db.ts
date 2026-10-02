import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const letterActors = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"] as const;
/** Test-only auth shim. Never imported by the Next application. */
export async function letterAsUser<T = Record<string, unknown>>(db: PGlite, actor: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec(actor ? "set local role authenticated" : "set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor ?? ""]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
export async function createLettersDatabase() {
  const db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && n < "20261002050000").sort()) await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  for (const id of letterActors) await db.query("insert into auth.users(id) values($1)", [id]);
  const houses: string[] = [];
  for (const [first, second, token] of [[letterActors[0], letterActors[1], "a"], [letterActors[2], letterActors[3], "b"]]) {
    houses.push((await letterAsUser<{ id: string }>(db, first!, "select public.create_house_with_owner() id"))[0]!.id);
    await letterAsUser(db, first!, "select public.create_pairing_invite($1,now()+interval '1 hour')", [token!.repeat(64)]);
    await letterAsUser(db, second!, "select public.accept_pairing_invite($1)", [token!.repeat(64)]);
  }
  await db.exec(await readFile("supabase/install-letters.sql", "utf8"));
  return { db, house: houses[0]!, otherHouse: houses[1]! };
}
export async function makeLetterDue(db: PGlite, id: string) {
  await db.query("update public.letters set deliver_at=date_trunc('minute',clock_timestamp())-interval '1 minute',created_at=date_trunc('minute',clock_timestamp())-interval '2 minutes',local_delivery_time=(date_trunc('minute',clock_timestamp())-interval '1 minute') at time zone time_zone where id=$1 and delivery_mode='scheduled'", [id]);
}
