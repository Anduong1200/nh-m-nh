import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createGame, gameActors } from "@/modules/games/test-fixtures";
import type { GameCommand, GameReceipt } from "@/modules/games/model";
import { deriveIslandState, parseIslandEvent, parseIslandState, type IslandEvent, type IslandState } from "@/modules/island/model";
let db: PGlite;
const [a, b] = gameActors;
const outsider = "44444444-4444-4444-8444-444444444444";
let house: string; let otherHouse: string; let historicalSession: string;
async function asUser<T = Record<string, unknown>>(actor: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec(actor ? "set local role authenticated" : "set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor ?? ""]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
async function apply(actor: string, command: GameCommand) {
  return (await asUser<{ r: GameReceipt }>(actor, "select public.apply_game_command($1,$2) r", [house, command]))[0]!.r;
}
async function completeStory() {
  const command = createGame("one-line-story"); await apply(a, command);
  const first: GameCommand = { operationId: crypto.randomUUID(), sessionId: command.sessionId, expectedVersion: 1, kind: "line", payload: { text: "Thỏ mở cửa." } };
  await apply(a, first);
  const last: GameCommand = { ...first, operationId: crypto.randomUUID(), expectedVersion: 2, payload: { text: "Cú về Nhà." } };
  const receipt = await apply(b, last);
  return { command, last, receipt };
}
async function readState(actor: string = a, houseId: string = house) {
  const raw = (await asUser<{ r: unknown }>(actor, "select public.get_island_state($1) r", [houseId]))[0]!.r;
  const state = parseIslandState(raw); expect(state).not.toBeNull(); return state!;
}
async function readEvents(): Promise<IslandEvent[]> {
  const rows = await asUser(a, "select id,house_id,event_type,source_type,source_id,created_at from public.island_events where house_id=$1", [house]);
  return rows.map(row => {
    const event = parseIslandEvent({ id: row.id, houseId: row.house_id, type: row.event_type, sourceType: row.source_type, sourceId: row.source_id, createdAt: new Date(row.created_at as string).toISOString() });
    expect(event).not.toBeNull(); return event!;
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && n < "20261002040000").sort()) await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  for (const id of [a, b, outsider]) await db.query("insert into auth.users(id) values($1)", [id]);
  house = (await asUser<{ id: string }>(a, "select public.create_house_with_owner() id"))[0]!.id;
  await asUser(a, "select public.create_pairing_invite($1,now()+interval '1 hour')", ["a".repeat(64)]);
  await asUser(b, "select public.accept_pairing_invite($1)", ["a".repeat(64)]);
  otherHouse = (await asUser<{ id: string }>(outsider, "select public.create_house_with_owner() id"))[0]!.id;
  historicalSession = (await completeStory()).command.sessionId;
  // Test the real existing-project installer, including its historical backfill.
  await db.exec(await readFile("supabase/install-island.sql", "utf8"));
}, 60000);
afterAll(async () => { if (db) await db.close(); });

it("backfills completed history only and matches the TypeScript projection", async () => {
  const state = await readState();
  expect(state).toMatchObject({ version: 2, historyItems: 1, contributions: { GAME_COMPLETED: 1, WEEKLY_ACTIVITY: 1, MEMORY_CREATED: 0 } });
  expect(state).toEqual(deriveIslandState(house, await readEvents()));
  expect((await readEvents()).some(e => e.sourceId === historicalSession)).toBe(true);
  expect((await asUser(a, "select status from public.game_sessions where id=$1", [historicalSession]))[0]).toEqual({ status: "completed" });
});
it("creates no progress for starting or partly playing a game", async () => {
  const before = await readState(); const c = createGame(); await apply(a, c);
  await apply(a, { operationId: crypto.randomUUID(), sessionId: c.sessionId, expectedVersion: 1, kind: "line", payload: { text: "Bản nháp." } });
  expect(await readState()).toEqual(before);
});
it("atomically records completion, makes exact retries idempotent and shares the same state", async () => {
  const before = await readState(); const { last, receipt } = await completeStory();
  const after = await readState();
  expect(after.version).toBe(before.version + 1);
  expect(after.historyItems).toBe(before.historyItems + 1);
  expect(after.contributions.WEEKLY_ACTIVITY).toBe(before.contributions.WEEKLY_ACTIVITY);
  expect(await apply(b, last)).toEqual(receipt); expect(await readState()).toEqual(after);
  expect(await readState(b)).toEqual(after);
  expect(after).toEqual(deriveIslandState(house, await readEvents()));
});
it("records Photo Mission in both categories but one history artifact", async () => {
  const before = await readState(); const c = createGame("photo-mission"); await apply(a, c);
  for (const [index, actor] of [a, b].entries()) {
    const id = crypto.randomUUID();
    await db.query("insert into public.media_objects(id,house_id,owner_id,media_type,bucket_id,storage_path,state,mime_type,size_bytes) values($1,$2,$3,'photo','nha-minh-private',$4,'ready','image/jpeg',100)", [id, house, actor, `${house}/${id}`]);
    await apply(actor, { operationId: crypto.randomUUID(), sessionId: c.sessionId, expectedVersion: index + 1, kind: "photo", payload: { mediaId: id, caption: "Riêng tư" } });
  }
  const after = await readState();
  expect(after.version).toBe(before.version + 2);
  expect(after.historyItems).toBe(before.historyItems + 1);
  expect(after.contributions.MISSION_COMPLETED).toBe(before.contributions.MISSION_COMPLETED + 1);
  expect(after.world.missions).toBe(true);
  expect(after).toEqual(deriveIslandState(house, await readEvents()));
  expect(JSON.stringify(await readEvents())).not.toContain("Riêng tư");
});
it("filters direct ledger/view reads and denies outsider RPC/anonymous access", async () => {
  expect(await asUser(outsider, "select * from public.island_events where house_id=$1", [house])).toEqual([]);
  expect(await asUser(outsider, "select * from public.island_state where house_id=$1", [house])).toEqual([]);
  await expect(readState(outsider, house)).rejects.toThrow("House access required");
  const empty = await readState(outsider, otherHouse);
  expect(empty).toMatchObject({ version: 0, historyItems: 0, updatedAt: null });
  for (const sql of ["select * from public.island_events", "select * from public.island_state", "select public.get_island_state($1)"]) await expect(asUser(null, sql, sql.includes("$1") ? [house] : [])).rejects.toThrow("permission denied");
});
it.each([a, b, outsider])("denies forged event/state writes and private emitters for %s", async actor => {
  for (const sql of [
    "insert into public.island_events(house_id,event_type,source_type,source_id,created_at) values($1,'MEMORY_CREATED','confirmed-memory',gen_random_uuid()::text,now())",
    "update public.island_events set source_id='fake' where house_id=$1",
    "delete from public.island_events where house_id=$1",
    "update public.island_state set version=999 where house_id=$1",
    "insert into public.island_state(house_id,version) values($1,999)",
    "delete from public.island_state where house_id=$1",
    "select public.island_record_game($1)",
  ]) await expect(asUser(actor, sql, [sql.includes("island_record_game") ? historicalSession : house])).rejects.toThrow();
});
it("rolls completion back if Island persistence fails", async () => {
  const c = createGame(); await apply(a, c);
  const first: GameCommand = { operationId: crypto.randomUUID(), sessionId: c.sessionId, expectedVersion: 1, kind: "line", payload: { text: "Một." } };
  await apply(a, first); const before = await readState();
  await db.exec("create function public.test_island_failure() returns trigger language plpgsql as $$begin raise exception 'test persistence failure'; end;$$; create trigger test_island_failure before insert on public.island_events for each row execute function public.test_island_failure();");
  try {
    await expect(apply(b, { ...first, operationId: crypto.randomUUID(), expectedVersion: 2 })).rejects.toThrow("test persistence failure");
    expect((await asUser(a, "select status,version from public.game_sessions where id=$1", [c.sessionId]))[0]).toEqual({ status: "active", version: 2 });
    expect(await asUser(a, "select * from public.game_artifacts where session_id=$1", [c.sessionId])).toEqual([]);
    expect(await readState()).toEqual(before);
  } finally { await db.exec("drop trigger test_island_failure on public.island_events; drop function public.test_island_failure();"); }
});
it("backfill retries and concurrent-shaped duplicate emits cannot add progress", async () => {
  const before = await readState();
  await Promise.all([db.query("select public.island_record_game($1)", [historicalSession]), db.query("select public.island_record_game($1)", [historicalSession])]);
  expect(await readState()).toEqual(before);
});
it("uses source completion time for one activity per UTC week, without streak logic", async () => {
  const c = createGame(); await apply(a, c);
  // Trusted import fixture: no client may mutate these tables. Both source times
  // are old instants, so processing today must not assign today's active week.
  await db.query("update public.game_sessions set status='completed',current_turn_user_id=null,phase=null,completed_at='2020-01-05T23:59:59Z' where id=$1", [c.sessionId]);
  await db.query("insert into public.game_artifacts(session_id,house_id,data) values($1,$2,'{}')", [c.sessionId, house]);
  const d = createGame(); await apply(a, d);
  await db.query("update public.game_sessions set status='completed',current_turn_user_id=null,phase=null,completed_at='2020-01-06T00:00:00Z' where id=$1", [d.sessionId]);
  await db.query("insert into public.game_artifacts(session_id,house_id,data) values($1,$2,'{}')", [d.sessionId, house]);
  const weeks = (await readEvents()).filter(e => e.type === 'WEEKLY_ACTIVITY').map(e => e.sourceId);
  expect(weeks).toContain('2019-12-30'); expect(weeks).toContain('2020-01-06');
  expect(await readState()).toEqual(deriveIslandState(house, await readEvents()));
});
it("guards repeated installer and preserves existing history", async () => {
  const before = await readState();
  await expect(db.exec(await readFile("supabase/install-island.sql", "utf8"))).rejects.toThrow("Island already exists");
  await db.exec("rollback"); expect(await readState()).toEqual(before);
});
it("denies inactive membership and archived House without deleting history", async () => {
  const before: IslandState = await readState();
  await db.query("update public.house_members set status='left' where house_id=$1 and user_id=$2", [house, b]);
  try {
    expect(await asUser(b, "select * from public.island_events where house_id=$1", [house])).toEqual([]);
    await expect(readState(b)).rejects.toThrow("House access required");
  } finally { await db.query("update public.house_members set status='active' where house_id=$1 and user_id=$2", [house, b]); }
  await db.query("update public.houses set state='archived' where id=$1", [house]);
  try {
    expect(await asUser(a, "select * from public.island_state where house_id=$1", [house])).toEqual([]);
    expect(await asUser(a, "select * from public.island_events where house_id=$1", [house])).toEqual([]);
    await expect(readState()).rejects.toThrow("House access required");
  } finally { await db.query("update public.houses set state='active' where id=$1", [house]); }
  expect(await readState()).toEqual(before);
});
