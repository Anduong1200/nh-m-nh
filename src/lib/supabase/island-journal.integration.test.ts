import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createGame, gameActors } from "@/modules/games/test-fixtures";
import type { GameCommand, GameReceipt } from "@/modules/games/model";
import { parseIslandState } from "@/modules/island/model";
import { parseIslandEntryReceipt, parseIslandJournalPage, type IslandEntryCommand } from "@/modules/island/journal";

let db: PGlite; let house: string; let otherHouse: string; let source: string;
const [a, b] = gameActors; const outsider = "44444444-4444-4444-8444-444444444444";
async function asUser<T = Record<string, unknown>>(actor: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec(actor ? "set local role authenticated" : "set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor ?? ""]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
function create(entryType: "memory" | "milestone" = "memory", sourceSessionId: string | null = null): IslandEntryCommand {
  return { operationId: crypto.randomUUID(), entryId: crypto.randomUUID(), expectedVersion: 0, kind: "create", payload: { entryType, title: "Một ngày nhỏ", body: "Thỏ và Cú cùng về Nhà.", occurredOn: "2026-10-03", sourceSessionId, confirmed: true } };
}
async function apply(actor: string, command: IslandEntryCommand, houseId = house) {
  const raw = (await asUser<{ r: unknown }>(actor, "select public.apply_island_entry_command($1,$2) r", [houseId, command]))[0]!.r;
  const receipt = parseIslandEntryReceipt(raw, command, houseId); expect(receipt).not.toBeNull(); return receipt!;
}
async function state() { return parseIslandState((await asUser<{ r: unknown }>(a, "select public.get_island_state($1) r", [house]))[0]!.r)!; }
async function list(actor: string = a, houseId = house, cursor: { createdAt: string; id: string } | null = null) {
  const raw = (await asUser<{ r: unknown }>(actor, "select public.get_island_entries($1,$2,$3) r", [houseId, cursor?.createdAt ?? null, cursor?.id ?? null]))[0]!.r;
  const page = parseIslandJournalPage(raw, houseId); expect(page).not.toBeNull(); return page!;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql") && n <= "20261002040000_island_event_projection.sql").sort()) await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  for (const id of [a, b, outsider]) await db.query("insert into auth.users(id) values($1)", [id]);
  house = (await asUser<{ id: string }>(a, "select public.create_house_with_owner() id"))[0]!.id;
  await asUser(a, "select public.create_pairing_invite($1,now()+interval '1 hour')", ["b".repeat(64)]);
  await asUser(b, "select public.accept_pairing_invite($1)", ["b".repeat(64)]);
  otherHouse = (await asUser<{ id: string }>(outsider, "select public.create_house_with_owner() id"))[0]!.id;
  const game = createGame("one-line-story"); source = game.sessionId;
  await asUser<GameReceipt>(a, "select public.apply_game_command($1,$2)", [house, game]);
  for (const [index, actor] of [a, b].entries()) {
    const command: GameCommand = { operationId: crypto.randomUUID(), sessionId: source, expectedVersion: index + 1, kind: "line", payload: { text: "Một câu chuyện." } };
    await asUser(actor, "select public.apply_game_command($1,$2)", [house, command]);
  }
  await db.exec(await readFile("supabase/install-island-journal.sql", "utf8"));
}, 60000);
afterAll(async () => { if (db) await db.close(); });

it("requires explicit memory confirmation and a persisted completed same-House source", async () => {
  const unconfirmed = create(); if (unconfirmed.kind !== "create") throw new Error("fixture"); unconfirmed.payload.confirmed = false;
  const before = await state();
  await expect(apply(a, unconfirmed)).rejects.toThrow("Memory confirmation");
  await expect(apply(a, create("memory", crypto.randomUUID()))).rejects.toThrow("Completed shared artifact required");
  const pending = createGame(); await asUser(a, "select public.apply_game_command($1,$2)", [house, pending]);
  await expect(apply(a, create("memory", pending.sessionId))).rejects.toThrow("Completed shared artifact required");
  await expect(apply(outsider, create("memory", source), otherHouse)).rejects.toThrow("Paired House access required");
  expect(await state()).toEqual(before);
});
it("creates source-backed memories once and stores exact replay receipts", async () => {
  const command = create("memory", source); const before = await state(); const receipt = await apply(a, command);
  expect(receipt.entry.sourceSessionId).toBe(source); expect(receipt.entry.occurredOn).toBe("2026-10-03");
  expect(await apply(a, command)).toEqual(receipt);
  await expect(apply(b, create("memory", source))).rejects.toThrow("already exists");
  await expect(apply(a, { ...command, payload: { ...command.payload, title: "Changed retry" } } as IslandEntryCommand)).rejects.toThrow("Operation identity changed");
  const after = await state(); expect(after.contributions.MEMORY_CREATED).toBe(before.contributions.MEMORY_CREATED + 1);
  expect(after.historyItems).toBe(before.historyItems + 1);
  expect((await list(b)).entries.some(e => e.id === receipt.entry.id)).toBe(true);
  expect(JSON.stringify(await asUser(a, "select * from public.island_events where journal_entry_id=$1", [receipt.entry.id]))).not.toContain("Thỏ");
});
it("both members edit with CAS; only creator trashes/restores; no loss or duplicate progression", async () => {
  const command = create("milestone"); const created = await apply(a, command); const before = await state();
  const edit: IslandEntryCommand = { operationId: crypto.randomUUID(), entryId: command.entryId, expectedVersion: 1, kind: "update", payload: { title: "Ngày gặp nhau", body: "Lưu lại cho hai đứa.", occurredOn: "2020-02-29" } };
  expect((await apply(b, edit)).entry).toMatchObject({ title: "Ngày gặp nhau", version: 2, createdBy: a, occurredOn: "2020-02-29" });
  const stale = await apply(a, { ...edit, operationId: crypto.randomUUID(), payload: { ...edit.payload, title: "Không được ghi đè" } });
  expect(stale.outcome).toBe("conflict"); expect(stale.entry.title).toBe("Ngày gặp nhau");
  const trash: IslandEntryCommand = { operationId: crypto.randomUUID(), entryId: created.entry.id, expectedVersion: 2, kind: "trash", payload: {} };
  await expect(apply(b, trash)).rejects.toThrow("Creator access required");
  const trashed = await apply(a, trash); expect(trashed.entry.trashedAt).not.toBeNull();
  expect((await list(b)).entries.find(e => e.id === trash.entryId)?.trashedAt).not.toBeNull();
  const restore: IslandEntryCommand = { ...trash, operationId: crypto.randomUUID(), expectedVersion: 3, kind: "restore" };
  await expect(apply(b, restore)).rejects.toThrow("Creator access required");
  expect((await apply(a, restore)).entry).toMatchObject({ version: 4, trashedAt: null });
  expect(await apply(a, trash)).toEqual(trashed); // exact historical reply, not current version
  expect(await state()).toEqual(before);
});
it("denies outsider, anonymous and forged direct writes to journal, receipts and source links", async () => {
  expect(await asUser(outsider, "select * from public.island_entries where house_id=$1", [house])).toEqual([]);
  expect(await asUser(b, "select * from public.island_entry_operations where actor_id=$1", [a])).toEqual([]);
  for (const sql of ["select public.get_island_entries($1)", "select public.get_island_entry($1,gen_random_uuid())", "select public.apply_island_entry_command($1,'{}')"]) await expect(asUser(outsider, sql, [house])).rejects.toThrow("House access required");
  for (const actor of [a, b, outsider, null]) {
    for (const sql of ["insert into public.island_entries(id,house_id,created_by,entry_type,title,occurred_on) values(gen_random_uuid(),$1,auth.uid(),'memory','forged',current_date)", "update public.island_entries set title='forged' where house_id=$1", "delete from public.island_entries where house_id=$1", "insert into public.island_entry_operations(actor_id,operation_id,house_id,command,receipt) values(auth.uid(),gen_random_uuid(),$1,'{}','{}')", "delete from public.island_entry_operations where house_id=$1"]) await expect(asUser(actor, sql, [house])).rejects.toThrow("permission denied");
  }
});
it("two competing edits have one applied result and one preserved conflict", async () => {
  const created = await apply(a, create("milestone")); const content = { title: "Cùng một phiên bản", body: "Không ghi đè lặng lẽ.", occurredOn: "2026-10-03" };
  const edits: IslandEntryCommand[] = [a, b].map((_, i) => ({ operationId: crypto.randomUUID(), entryId: created.entry.id, expectedVersion: 1, kind: "update", payload: { ...content, title: `Bản ${i}` } }));
  // PGlite serializes connections; this verifies the production CAS contract,
  // not independent hosted PostgreSQL connection lock stress.
  const replies = await Promise.all([apply(a, edits[0]!), apply(b, edits[1]!)]);
  expect(replies.map(r => r.outcome).sort()).toEqual(["applied", "conflict"]);
  expect(replies[0]!.entry.title).toBe(replies[1]!.entry.title);
  expect(await apply(b, edits[1]!)).toEqual(replies[1]);
});
it("rejects immutable-source edits, invalid dates/content and unknown command fields", async () => {
  const c = create(); const e = (await apply(a, c)).entry;
  await expect(apply(b, { operationId: crypto.randomUUID(), entryId: e.id, expectedVersion: 1, kind: "update", payload: { title: "New", body: "", occurredOn: "2026-10-03", sourceSessionId: source } } as IslandEntryCommand)).rejects.toThrow("immutable");
  for (const command of [{ ...create(), unknown: "x" }, { ...create(), expectedVersion: -1 }, { ...create(), payload: { ...(create() as { payload: object }).payload, occurredOn: "2025-02-29" } }]) await expect(asUser(a, "select public.apply_island_entry_command($1,$2)", [house, command])).rejects.toThrow();
});
it("atomic source persistence rolls back entry, receipt and progress if event write fails", async () => {
  const before = await state(); const c = create();
  await db.exec("create function public.test_journal_failure() returns trigger language plpgsql as $$begin if new.event_type='MEMORY_CREATED' then raise exception 'test source failure'; end if; return new; end;$$; create trigger test_journal_failure before insert on public.island_events for each row execute function public.test_journal_failure();");
  try { await expect(apply(a, c)).rejects.toThrow("test source failure"); expect(await asUser(a, "select * from public.island_entries where id=$1", [c.entryId])).toEqual([]); expect(await state()).toEqual(before); }
  finally { await db.exec("drop trigger test_journal_failure on public.island_events; drop function public.test_journal_failure();"); }
});
it("paginates with stable tuple cursors and never removes older history", async () => {
  for (let i = 0; i < 22; i++) await apply(a, create(i % 2 ? "memory" : "milestone"));
  const first = await list(); expect(first.entries).toHaveLength(20); expect(first.next).not.toBeNull();
  const second = await list(b, house, first.next); expect(second.entries.length).toBeGreaterThan(0);
  expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(first.entries.length + second.entries.length);
});
it("guards repeated installer, membership loss and archived House without changing history", async () => {
  await expect(db.exec(await readFile("supabase/install-island-journal.sql", "utf8"))).rejects.toThrow("journal already exists"); await db.exec("rollback");
  const before = await state();
  await db.query("update public.house_members set status='left' where house_id=$1 and user_id=$2", [house, b]);
  try { await expect(list(b)).rejects.toThrow("House access required"); await expect(apply(a, create())).rejects.toThrow("Paired House access required"); }
  finally { await db.query("update public.house_members set status='active' where house_id=$1 and user_id=$2", [house, b]); }
  await db.query("update public.houses set state='archived' where id=$1", [house]);
  try { expect(await asUser(a, "select * from public.island_entries where house_id=$1", [house])).toEqual([]); await expect(list()).rejects.toThrow("House access required"); }
  finally { await db.query("update public.houses set state='active' where id=$1", [house]); }
  expect(await state()).toEqual(before);
});
