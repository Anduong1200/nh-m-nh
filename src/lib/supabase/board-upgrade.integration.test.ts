import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
const root = fileURLToPath(new URL("../../../supabase/", import.meta.url));
const actor = "11111111-1111-4111-8111-111111111111";
async function baseline(includeBoard: boolean) {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  const names = (await readdir(`${root}/migrations`)).filter((n) => n.endsWith(".sql") && n < "20261002010000" && (includeBoard || !n.includes("create_board_objects"))).sort();
  for (const name of names) await db.exec(await readFile(`${root}/migrations/${name}`, "utf8"));
  await db.query("insert into auth.users values ($1)", [actor]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const house = (await db.query<{ id: string }>("select public.create_house_with_owner() as id")).rows[0]!.id;
  return { db, house };
}
it.each([true, false])("upgrades a populated legacy Board or installs atomically on Phase 2 (legacy=%s)", async (legacy) => {
  const { db, house } = await baseline(legacy);
  try {
    const id = crypto.randomUUID(), invalidId = crypto.randomUUID();
    if (legacy) {
      await db.query("select public.append_board_object($1,'note',$2,12,34,5,7)", [id, { text: "Ghi chú đã có" }]);
      await db.query("select public.append_board_object($1,'note',$2,0,0,0,0)", [invalidId, { legacyPayload: "Preserve for repair" }]);
    }
    const before = legacy ? (await db.query<Record<string, unknown>>("select * from public.board_objects order by id")).rows : [];
    const bundle = await readFile(`${root}/${legacy ? "upgrade" : "install"}-board-domain.sql`, "utf8");
    const source = await readFile(`${root}/migrations/20261002010000_board_domain.sql`, "utf8");
    expect(bundle).toContain(source.replace(/[ \t]+(?=\r?$)/gm, ""));
    await db.exec(bundle);
    if (legacy) {
      const after = (await db.query<Record<string, unknown>>("select * from public.board_objects order by id")).rows;
      expect(after.map(({ media_id: mediaId, ...row }) => { expect(mediaId).toBeNull(); return row; })).toEqual(before);
    }
    await db.exec("set role authenticated");
    const result = await db.query<{ result: { outcome: string; item: { version: number; house_id: string } } }>(
      "select public.apply_board_operation($1,$2,$3,$4,$5,$6) as result",
      [crypto.randomUUID(),house,legacy ? "update" : "append",legacy ? id : crypto.randomUUID(),legacy ? 1 : 0,legacy ? { payload: { text: "Đã đổi" } } : { type: "note", payload: { text: "Mới" } }]);
    expect(result.rows[0]!.result).toMatchObject({ outcome: "applied", item: { version: legacy ? 2 : 1, house_id: house } });
    await expect(db.query("select public.append_board_object($1,'note',$2,0,0,0,0)",[crypto.randomUUID(),{text:"Bypass"}])).rejects.toMatchObject({code:"42501"});
    await db.exec("reset role");
    await expect(db.exec(bundle)).rejects.toThrow();
    await db.exec("rollback");
    expect((await db.query("select count(*)::integer as n from public.board_objects")).rows[0]).toEqual({ n: legacy ? 2 : 1 });
  } finally { await db.close(); }
}, 30000);
