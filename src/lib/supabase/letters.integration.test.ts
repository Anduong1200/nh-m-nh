import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLettersDatabase, letterActors, letterAsUser, makeLetterDue } from "../../../tests/fixtures/letters-db";
import { parseLetter, parseLetterReceipt, parseRevealSession, type LetterCommand, type LetterReceipt, type RevealCommand, type RevealSession } from "@/modules/letters/model";
import { makeLetterSchedule } from "@/modules/letters/schedule";
let db: PGlite; let house: string; let otherHouse: string;
const [a, b, outsider] = letterActors;
const send = (together = false, scheduled = false): LetterCommand => ({ operationId: crypto.randomUUID(), letterId: crypto.randomUUID(), kind: "send", payload: { content: "Nội dung riêng tư.\nThỏ nhớ Cú.", clue: "Một chiếc lá", revealTogether: together, delivery: scheduled ? makeLetterSchedule("2027-11-07T01:30", "America/New_York", "later") : { mode: "immediate" } } });
async function apply(actor: string, command: LetterCommand, houseId = house) {
  const r = (await letterAsUser<{ r: LetterReceipt }>(db, actor, "select public.apply_letter_command($1,$2) r", [houseId, command]))[0]!.r;
  expect(parseLetterReceipt(r, { accountId: actor, houseId }, command)).not.toBeNull(); return r;
}
async function read(actor: string, id: string, houseId = house) {
  const value = (await letterAsUser<{ r: unknown }>(db, actor, "select public.get_letter($1,$2) r", [houseId, id]))[0]!.r;
  if (value === null) return null;
  const letter = parseLetter(value, { accountId: actor, houseId }); expect(letter).not.toBeNull(); return letter!;
}
async function reveal(actor: string, command: RevealCommand) {
  const value = (await letterAsUser<{ r: RevealSession }>(db, actor, "select public.apply_letter_reveal($1,$2) r", [house, command]))[0]!.r;
  expect(parseRevealSession(value, { accountId: actor, houseId: house }, command)).not.toBeNull(); return value;
}
beforeAll(async () => { ({ db, house, otherHouse } = await createLettersDatabase()); }, 60000);
afterAll(async () => { if (db) await db.close(); });
it("immediate envelopes expose the clue but keep content sealed until recipient opens", async () => {
  const c = send(); await apply(a, c);
  expect(await read(a, c.letterId)).toMatchObject({ content: "Nội dung riêng tư.\nThỏ nhớ Cú.", state: "sent", version: 1 });
  expect(await read(b, c.letterId)).toMatchObject({ content: null, clue: "Một chiếc lá", state: "sealed", canOpen: true });
  expect(await letterAsUser(db, b, "select * from public.letter_contents where letter_id=$1", [c.letterId])).toEqual([]);
  const opened = await apply(b, { operationId: crypto.randomUUID(), letterId: c.letterId, kind: "open" });
  expect(opened.snapshot).toMatchObject({ state: "opened", version: 2, canOpen: false });
  expect(await letterAsUser(db, b, "select content from public.letter_contents where letter_id=$1", [c.letterId])).toHaveLength(1);
  // No recipient open time/state/version is exposed to the author by default.
  expect(await read(a, c.letterId)).toMatchObject({ state: "sent", version: 1 });
  expect(await letterAsUser(db, a, "select * from public.letter_openings where letter_id=$1", [c.letterId])).toEqual([]);
});
it("scheduled envelope, clue, body and receipts stay hidden before DB time is due", async () => {
  const c = send(false, true); await apply(a, c);
  expect(await read(a, c.letterId)).toMatchObject({ state: "scheduled", content: "Nội dung riêng tư.\nThỏ nhớ Cú." });
  expect(await read(b, c.letterId)).toBeNull();
  for (const table of ["letters", "letter_contents", "letter_operations"]) expect(await letterAsUser(db, b, `select * from public.${table} where ${table === "letters" ? "id" : "letter_id"}=$1`, [c.letterId])).toEqual([]);
  await expect(apply(b, { operationId: crypto.randomUUID(), letterId: c.letterId, kind: "open" })).rejects.toThrow("cannot be opened");
  await makeLetterDue(db, c.letterId);
  expect(await read(b, c.letterId)).toMatchObject({ state: "sealed", content: null });
});
it("direct RPC cannot forge schedules or use nonexistent wall time", async () => {
  const c = send(false, true); if (c.kind !== "send" || c.payload.delivery.mode !== "scheduled") throw new Error();
  for (const delivery of [{ ...c.payload.delivery, deliverAt: "2027-11-07T01:30:00.000Z" }, { mode: "scheduled", localDateTime: "2027-03-14T02:30", timeZone: "America/New_York", deliverAt: "2027-03-14T07:30:00.000Z" }, { ...c.payload.delivery, timeZone: "fake" }]) await expect(letterAsUser(db, a, "select public.apply_letter_command($1,$2)", [house, { ...c, payload: { ...c.payload, delivery } }])).rejects.toThrow("Invalid letter payload");
  const past = { ...c, payload: { ...c.payload, delivery: makeLetterSchedule("2020-01-01T12:00", "UTC") } };
  await expect(apply(a, past)).rejects.toThrow("must be in the future");
});
it("send and open retries are exact and cannot be reassigned to another actor/payload", async () => {
  const c = send(); const first = await apply(a, c); expect(await apply(a, c)).toEqual(first);
  await expect(apply(b, c)).rejects.toThrow("identity mismatch");
  if (c.kind !== "send") throw new Error();
  await expect(apply(a, { ...c, payload: { ...c.payload, content: "Đổi" } })).rejects.toThrow("identity mismatch");
  const open: LetterCommand = { operationId: crypto.randomUUID(), letterId: c.letterId, kind: "open" };
  const result = await apply(b, open); expect(await apply(b, open)).toEqual(result);
  expect(await letterAsUser(db, b, "select * from public.letter_openings where letter_id=$1", [c.letterId])).toHaveLength(1);
});
it("together requires both explicit joins, live presence and confirmations in one session", async () => {
  const c = send(true); await apply(a, c);
  await expect(apply(b, { operationId: crypto.randomUUID(), letterId: c.letterId, kind: "open" })).rejects.toThrow("cannot be opened");
  const room = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null });
  const one = await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId });
  expect(one).toMatchObject({ status: "active", connectedPlayers: 1, ownReady: true });
  const joined = await reveal(b, { kind: "join", letterId: c.letterId, sessionId: null }); expect(joined.sessionId).toBe(room.sessionId);
  expect(await read(b, c.letterId)).toMatchObject({ content: null });
  const both = await reveal(b, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId });
  expect(both).toMatchObject({ status: "revealed", connectedPlayers: 2, snapshot: { state: "opened", content: "Nội dung riêng tư.\nThỏ nhớ Cú." } });
  expect((await read(a, c.letterId))?.state).toBe("opened");
});
it("stale presence resets readiness; an old confirmation cannot reveal while partner is away", async () => {
  const c = send(true); await apply(a, c);
  const room = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null }); await reveal(b, { kind: "join", letterId: c.letterId, sessionId: null });
  await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId });
  await db.query("update public.letter_reveal_participants set heartbeat_at=clock_timestamp()-interval '16 seconds' where session_id=$1 and user_id=$2", [room.sessionId, a]);
  expect((await reveal(b, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })).status).toBe("active");
  expect((await read(b, c.letterId))?.content).toBeNull();
  const returned = await reveal(a, { kind: "heartbeat", letterId: c.letterId, sessionId: room.sessionId }); expect(returned.ownReady).toBe(false);
  expect((await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })).status).toBe("revealed");
});
it("leaving stops presence and requires a new explicit join", async () => {
  const c = send(true); await apply(a, c); const room = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null });
  const left = await reveal(a, { kind: "leave", letterId: c.letterId, sessionId: room.sessionId }); expect(left.ownPresent).toBe(false);
  await expect(reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })).rejects.toThrow("Join the reveal session first");
});
it("expired session keeps the letter sealed; another session cannot reuse old readiness", async () => {
  const c = send(true); await apply(a, c); const old = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null });
  await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: old.sessionId });
  await db.query("update public.letter_reveal_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1", [old.sessionId]);
  const expired = await reveal(a, { kind: "heartbeat", letterId: c.letterId, sessionId: old.sessionId }); expect(expired).toMatchObject({ status: "expired", ownReady: false, connectedPlayers: 0 });
  const fresh = await reveal(b, { kind: "join", letterId: c.letterId, sessionId: null }); expect(fresh.sessionId).not.toBe(old.sessionId);
  expect((await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: old.sessionId })).status).toBe("expired");
  expect((await read(b, c.letterId))?.content).toBeNull();
});
it("two racing confirms yield exactly one opening", async () => {
  const c = send(true); await apply(a, c); const room = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null }); await reveal(b, { kind: "join", letterId: c.letterId, sessionId: null });
  await Promise.all([reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId }), reveal(b, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })]);
  expect(await letterAsUser(db, b, "select * from public.letter_openings where letter_id=$1", [c.letterId])).toHaveLength(1);
});
it("cross-House, anonymous, internal emitter and heartbeat table access are denied", async () => {
  const c = send(true); await apply(a, c);
  for (const table of ["letters", "letter_contents", "letter_openings", "letter_operations"]) expect(await letterAsUser(db, outsider, `select * from public.${table} where house_id=$1`, [house])).toEqual([]);
  await expect(read(outsider, c.letterId)).rejects.toThrow("House access required");
  expect(await read(outsider, c.letterId, otherHouse)).toBeNull();
  for (const table of ["letters", "letter_contents", "letter_openings", "letter_operations", "letter_reveal_sessions", "letter_reveal_participants"]) {
    await expect(letterAsUser(db, null, `select * from public.${table}`)).rejects.toThrow("permission denied");
    for (const verb of ["insert", "update", "delete"]) await expect(letterAsUser(db, a, verb === "insert" ? `insert into public.${table} default values` : verb === "update" ? `update public.${table} set house_id=$1` : `delete from public.${table} where house_id=$1`, verb === "insert" ? [] : [house])).rejects.toThrow("permission denied");
  }
  await expect(letterAsUser(db, a, "select public.letter_snapshot($1,$2)", [c.letterId, b])).rejects.toThrow("permission denied");
  for (const table of ["letter_reveal_sessions", "letter_reveal_participants"]) await expect(letterAsUser(db, a, `select * from public.${table}`)).rejects.toThrow("permission denied");
});
it("rejects sender self-opening, premature scheduled join and non-participant session commands", async () => {
  const c = send(); await apply(a, c);
  await expect(apply(a, { kind: "open", operationId: crypto.randomUUID(), letterId: c.letterId })).rejects.toThrow("cannot be opened");
  await expect(reveal(a, { kind: "join", letterId: c.letterId, sessionId: null })).rejects.toThrow("Joint reveal unavailable");
  const later = send(true, true); await apply(a, later);
  await expect(reveal(b, { kind: "join", letterId: later.letterId, sessionId: null })).rejects.toThrow("Joint reveal unavailable");
  const together = send(true); await apply(a, together); const room = await reveal(a, { kind: "join", letterId: together.letterId, sessionId: null });
  await expect(reveal(b, { kind: "ready", letterId: together.letterId, sessionId: room.sessionId })).rejects.toThrow("Join the reveal session first");
  await expect(reveal(a, { kind: "ready", letterId: together.letterId, sessionId: crypto.randomUUID() })).rejects.toThrow();
});
it("failed joint opening cannot commit consent or expose content", async () => {
  const c = send(true); await apply(a, c); const room = await reveal(a, { kind: "join", letterId: c.letterId, sessionId: null }); await reveal(b, { kind: "join", letterId: c.letterId, sessionId: null });
  await reveal(a, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId });
  await db.exec("create function public.test_letter_failure() returns trigger language plpgsql as $$begin raise exception 'test opening failure'; end;$$; create trigger test_letter_failure before insert on public.letter_openings for each row execute function public.test_letter_failure();");
  try {
    await expect(reveal(b, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })).rejects.toThrow("test opening failure");
    expect((await read(b, c.letterId))?.content).toBeNull();
    expect((await db.query<{ ready: boolean }>("select ready from public.letter_reveal_participants where session_id=$1 and user_id=$2", [room.sessionId, b])).rows[0]!.ready).toBe(false);
  } finally { await db.exec("drop trigger test_letter_failure on public.letter_openings; drop function public.test_letter_failure();"); }
  expect((await reveal(b, { kind: "ready", letterId: c.letterId, sessionId: room.sessionId })).status).toBe("revealed");
});
it("departed partners lose access to old body, operations and sessions", async () => {
  const c = send(); await apply(a, c); const open: LetterCommand = { kind: "open", letterId: c.letterId, operationId: crypto.randomUUID() }; await apply(b, open);
  await db.query("update public.house_members set status='left' where house_id=$1 and user_id=$2", [house, b]);
  try {
    await expect(read(b, c.letterId)).rejects.toThrow("House access required"); await expect(apply(b, open)).rejects.toThrow("House access required");
    expect(await letterAsUser(db, b, "select * from public.letter_contents where letter_id=$1", [c.letterId])).toEqual([]);
    expect(await letterAsUser(db, b, "select * from public.letter_operations where letter_id=$1", [c.letterId])).toEqual([]);
  } finally { await db.query("update public.house_members set status='active' where house_id=$1 and user_id=$2", [house, b]); }
});
it("guarded installer preserves House/data and rejects a repeat", async () => {
  const count = (await db.query("select count(*) from public.letters")).rows;
  await expect(db.exec(await readFile("supabase/install-letters.sql", "utf8"))).rejects.toThrow("Letters already exist");
  await db.exec("rollback"); expect((await db.query("select count(*) from public.letters")).rows).toEqual(count);
});
it("archived House blocks reads and old operation retries", async () => {
  const c = send(); await apply(a, c); await db.query("update public.houses set state='archived' where id=$1", [house]);
  try {
    await expect(read(a, c.letterId)).rejects.toThrow("House access required"); await expect(apply(a, c)).rejects.toThrow("House access required");
    expect(await letterAsUser(db, a, "select * from public.letter_contents where letter_id=$1", [c.letterId])).toEqual([]);
  } finally { await db.query("update public.houses set state='active' where id=$1", [house]); }
});
