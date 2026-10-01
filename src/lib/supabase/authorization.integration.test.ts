import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// This suite executes real PostgreSQL policies and privileges. Only Supabase's
// auth.users/auth.uid() boundary is shimmed; application clients are not mocked.
const users = {
  a: "11111111-1111-4111-8111-111111111111",
  partnerA: "22222222-2222-4222-8222-222222222222",
  b: "33333333-3333-4333-8333-333333333333",
  partnerB: "44444444-4444-4444-8444-444444444444",
  outsider: "55555555-5555-4555-8555-555555555555",
  solo: "66666666-6666-4666-8666-666666666666",
};
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let database: PGlite;
let houseA: string;
let houseB: string;
let soloHouse: string;

async function asUser<T = Record<string, unknown>>(
  userId: string | null,
  sql: string,
  parameters: unknown[] = [],
) {
  await database.exec("savepoint request_boundary");
  try {
    await database.exec(userId ? "set local role authenticated" : "set local role anon");
    await database.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const result = await database.query<T>(sql, parameters);
    await database.exec("reset role; release savepoint request_boundary");
    return result.rows;
  } catch (error) {
    await database.exec("rollback to savepoint request_boundary; reset role; release savepoint request_boundary");
    throw error;
  }
}

async function createHouse(userId: string) {
  const rows = await asUser<{ id: string }>(userId, "select public.create_house_with_owner() as id");
  if (!rows[0]) throw new Error("House RPC returned no row");
  return rows[0].id;
}

async function pair(creator: string, partner: string, tokenHash: string) {
  await asUser(creator, "select public.create_pairing_invite($1, now() + interval '1 hour')", [tokenHash]);
  await asUser(partner, "select public.accept_pairing_invite($1)", [tokenHash]);
}

function setPresence(userId: string, expectedVersion = 0, note = "Một tách trà cho cậu") {
  return asUser<{ user_id: string; version: number; cleared: boolean }>(userId,
    "select * from public.set_presence('calm', 2, 'later', $1, '', null, $2)", [note, expectedVersion]);
}

describe("Supabase migrations and PostgreSQL House authorization", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    const directory = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
    const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    for (const migration of migrations) {
      await database.exec(await readFile(`${directory}/${migration}`, "utf8"));
    }
    for (const userId of Object.values(users)) {
      await database.query("insert into auth.users(id) values ($1)", [userId]);
    }
    await database.exec("begin");
    houseA = await createHouse(users.a);
    await pair(users.a, users.partnerA, "a".repeat(64));
    houseB = await createHouse(users.b);
    await pair(users.b, users.partnerB, "b".repeat(64));
    soloHouse = await createHouse(users.solo);
    await database.exec("commit");
  }, 30000);

  beforeEach(async () => { await database.exec("begin"); });
  afterEach(async () => { await database.exec("rollback; reset role"); });
  afterAll(async () => { if (database) await database.close(); });

  it("applies the complete ordered migration chain and enables RLS on every exposed table", async () => {
    const rows = await database.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(rows.rows).toHaveLength(8);
    expect(rows.rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("denies anonymous reads and security-definer mutations", async () => {
    await expect(asUser(null, "select * from public.houses")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(null, "select public.create_house_with_owner()")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(null, "select public.send_knock($1, 'note', 'hi')", [operationId])).rejects.toMatchObject({ code: "42501" });
  });

  it("allows a member to read only their House, its two members, and partner profiles", async () => {
    expect(await asUser(users.a, "select id from public.houses")).toEqual([{ id: houseA }]);
    const members = await asUser<{ user_id: string }>(users.a, "select user_id from public.house_members");
    expect(members.map((member) => member.user_id).sort()).toEqual([users.a, users.partnerA].sort());
    const profiles = await asUser<{ id: string }>(users.a, "select id from public.profiles");
    expect(profiles.map((profile) => profile.id).sort()).toEqual([users.a, users.partnerA].sort());
    expect(await asUser(users.outsider, "select * from public.houses")).toEqual([]);
    expect(await asUser(users.outsider, "select * from public.house_members")).toEqual([]);
  });

  it("blocks direct joining, creating orphan Houses, and changing membership keys", async () => {
    await expect(asUser(users.outsider,
      "insert into public.house_members(house_id,user_id) values ($1,$2)", [houseA, users.outsider],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(users.outsider, "insert into public.houses default values")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(users.a, "update public.house_members set house_id=$1 where user_id=$2", [houseB, users.a])).rejects.toMatchObject({ code: "42501" });
    await expect(database.query("update public.house_members set house_id=$1 where user_id=$2", [houseB, users.a])).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces capacity and a single active House through unique constraints", async () => {
    await database.exec("savepoint invalid_membership");
    await expect(database.query("insert into public.house_members(house_id,user_id) values ($1,$2)", [houseA, users.outsider])).rejects.toMatchObject({ code: "23514" });
    await database.exec("rollback to savepoint invalid_membership");
    await expect(database.query("insert into public.house_members(house_id,user_id,slot) values ($1,$2,2)", [soloHouse, users.a])).rejects.toMatchObject({ code: "23505" });
    await database.exec("rollback to savepoint invalid_membership; release savepoint invalid_membership");
    await expect(asUser(users.a, "select public.create_house_with_owner()")).rejects.toThrow("Already in a house");
  });

  it("rejects expired, reused, own, and full-House pairing invites", async () => {
    const token = "c".repeat(64);
    await asUser(users.solo, "select public.create_pairing_invite($1, now()+interval '1 hour')", [token]);
    await expect(asUser(users.solo, "select public.accept_pairing_invite($1)", [token])).rejects.toThrow("own invite");
    await database.query("update public.pairing_invites set expires_at=now()-interval '1 second' where token_hash=$1", [token]);
    await expect(asUser(users.outsider, "select public.accept_pairing_invite($1)", [token])).rejects.toThrow("expired");
    await expect(asUser(users.outsider, "select public.accept_pairing_invite($1)", ["a".repeat(64)])).rejects.toThrow("already used");
    await database.query("insert into public.pairing_invites(house_id,token_hash,created_by,expires_at) values ($1,$2,$3,now()+interval '1 hour')", [houseA, "d".repeat(64), users.a]);
    await expect(asUser(users.outsider, "select public.accept_pairing_invite($1)", ["d".repeat(64)])).rejects.toThrow("full");
    await expect(asUser(users.a, "select public.create_pairing_invite($1, now()+interval '1 hour')", ["e".repeat(64)])).rejects.toThrow("full");
    expect(await asUser(users.a, "select id from public.pairing_invites")).toHaveLength(2);
    expect(await asUser(users.outsider, "select id from public.pairing_invites")).toHaveLength(0);
  });

  it("requires an invite and atomically pairs only the caller", async () => {
    const token = "f".repeat(64);
    await asUser(users.solo, "select public.create_pairing_invite($1, now()+interval '1 hour')", [token]);
    expect(await asUser(users.outsider, "select public.accept_pairing_invite($1) as house", [token])).toEqual([{ house: soloHouse }]);
    const members = await asUser<{ user_id: string; slot: number }>(users.outsider, "select user_id,slot from public.house_members");
    expect(members.map((row) => row.slot).sort()).toEqual([1, 2]);
    await expect(asUser(users.partnerA, "select public.accept_pairing_invite($1)", [token])).rejects.toThrow("already used");
  });

  it("authorizes status reads and only the owner's versioned RPC changes", async () => {
    expect((await setPresence(users.a))[0]).toMatchObject({ user_id: users.a, version: 1 });
    expect(await asUser(users.partnerA, "select note from public.presence_entries")).toEqual([{ note: "Một tách trà cho cậu" }]);
    expect(await asUser(users.b, "select * from public.presence_entries")).toEqual([]);
    expect(await asUser(users.outsider, "select * from public.presence_entries")).toEqual([]);
    await expect(asUser(users.partnerA, "update public.presence_entries set note='changed' where user_id=$1", [users.a])).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(users.outsider, "select public.set_presence('calm',2,'quiet','','',null,0)")).rejects.toMatchObject({ code: "42501" });
    await expect(setPresence(users.a, 0, "stale")).rejects.toMatchObject({ code: "40001" });
    expect((await setPresence(users.a, 1, "new"))[0]?.version).toBe(2);
  });

  it("hides expired and cleared statuses from a partner while preserving the owner's conflict version", async () => {
    await setPresence(users.a);
    await database.query("update public.presence_entries set expires_at=now()-interval '1 second' where user_id=$1", [users.a]);
    expect(await asUser(users.partnerA, "select * from public.presence_entries")).toEqual([]);
    expect(await asUser(users.a, "select version from public.presence_entries")).toEqual([{ version: 1 }]);
    expect(await asUser(users.a, "select cleared,version from public.clear_presence(1)")).toEqual([{ cleared: true, version: 2 }]);
    expect(await asUser(users.partnerA, "select * from public.presence_entries")).toEqual([]);
    await expect(setPresence(users.a, 1)).rejects.toMatchObject({ code: "40001" });
  });

  it("creates a tombstone when an empty status is cleared, preventing delayed initial edits", async () => {
    expect(await asUser(users.a, "select cleared,version from public.clear_presence(0)")).toEqual([{ cleared: true, version: 1 }]);
    await expect(setPresence(users.a, 0)).rejects.toMatchObject({ code: "40001" });
  });

  it("validates status enums, lengths, control characters, and expiry inside PostgreSQL", async () => {
    await expect(asUser(users.a, "select public.set_presence('spying',2,'quiet','','',null,0)")).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(users.a, "select public.set_presence('calm',4,'quiet','','',null,0)")).rejects.toMatchObject({ code: "22023" });
    await expect(setPresence(users.a, 0, "x".repeat(161))).rejects.toMatchObject({ code: "22023" });
    await expect(setPresence(users.a, 0, "line\nbreak")).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(users.a, "select public.set_presence('calm',2,'quiet','','',now()-interval '1 second',0)")).rejects.toMatchObject({ code: "22023" });
  });

  it("derives Knock actors, isolates Houses, and retries an operation idempotently", async () => {
    const knock = await asUser(users.a, "select * from public.send_knock($1,'note','Nhớ cậu')", [operationId]);
    expect(knock[0]).toMatchObject({ house_id: houseA, sender_id: users.a, recipient_id: users.partnerA });
    expect(await asUser(users.a, "select * from public.send_knock($1,'note','Nhớ cậu')", [operationId])).toEqual(knock);
    expect(await asUser(users.partnerA, "select id from public.knocks")).toEqual([{ id: operationId }]);
    expect(await asUser(users.b, "select * from public.knocks")).toEqual([]);
    expect(await asUser(users.outsider, "select * from public.knocks")).toEqual([]);
    await expect(asUser(users.a, "select public.send_knock($1,'note','changed')", [operationId])).rejects.toMatchObject({ code: "23505" });
    await expect(asUser(users.b, "select public.send_knock($1,'note','Nhớ cậu')", [operationId])).rejects.toMatchObject({ code: "23505" });
    await expect(asUser(users.outsider, "insert into public.knocks(id,house_id,sender_id,recipient_id,kind,content) values ($1,$2,$3,$4,'note','fake')", [operationId, houseA, users.a, users.partnerA])).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps dismissal recipient-only and private from the sender", async () => {
    await asUser(users.a, "select public.send_knock($1,'sticker','leaf')", [operationId]);
    await expect(asUser(users.a, "select public.dismiss_knock($1)", [operationId])).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(users.b, "select public.dismiss_knock($1)", [operationId])).rejects.toMatchObject({ code: "42501" });
    await asUser(users.partnerA, "select public.dismiss_knock($1)", [operationId]);
    await asUser(users.partnerA, "select public.dismiss_knock($1)", [operationId]);
    expect(await asUser(users.partnerA, "select knock_id from public.knock_dismissals")).toEqual([{ knock_id: operationId }]);
    expect(await asUser(users.a, "select * from public.knock_dismissals")).toEqual([]);
    expect(await asUser(users.b, "select * from public.knock_dismissals")).toEqual([]);
  });

  it("rejects Knock with no partner or invalid payload and forbids edit/delete", async () => {
    await expect(asUser(users.solo, "select public.send_knock($1,'note','hi')", [operationId])).rejects.toThrow("not paired");
    await expect(asUser(users.a, "select public.send_knock($1,'sticker','arbitrary')", [operationId])).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(users.a, "select public.send_knock($1,'note',$2)", [operationId, "x".repeat(161)])).rejects.toMatchObject({ code: "22023" });
    await asUser(users.a, "select public.send_knock($1,'note','hi')", [operationId]);
    await expect(asUser(users.a, "update public.knocks set content='rewrite'")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(users.a, "delete from public.knocks")).rejects.toMatchObject({ code: "42501" });
  });

  it("owns notification preferences per recipient with generic default and validated quiet hours", async () => {
    await database.query("insert into public.notification_preferences(user_id) values ($1)", [users.a]);
    expect(await asUser(users.a, "select preview,quiet_enabled from public.notification_preferences")).toEqual([{ preview: "generic", quiet_enabled: false }]);
    expect(await asUser(users.partnerA, "select * from public.notification_preferences")).toEqual([]);
    expect(await asUser(users.b, "select * from public.notification_preferences")).toEqual([]);
    await expect(asUser(users.partnerA, "update public.notification_preferences set preview='detail' where user_id=$1", [users.a])).rejects.toMatchObject({ code: "42501" });
    expect(await asUser(users.a, "select user_id,quiet_enabled,preview from public.set_notification_preferences(true,1320,480,'Asia/Bangkok','detail',true)")).toEqual([{ user_id: users.a, quiet_enabled: true, preview: "detail" }]);
    await expect(asUser(users.a, "select public.set_notification_preferences(true,20,20,'Asia/Bangkok','generic')")).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(users.a, "select public.set_notification_preferences(false,20,30,'Invalid/Timezone','generic')")).rejects.toMatchObject({ code: "22023" });
    await expect(asUser(null, "select public.set_notification_preferences(false,20,30,'Asia/Bangkok','generic')")).rejects.toMatchObject({ code: "42501" });
  });
});
