import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("upgrades the populated Phase 2 baseline transactionally and rejects rerunning the bundle", async () => {
  const database = new PGlite();
  const userId = "11111111-1111-4111-8111-111111111111";
  try {
    await database.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    for (const name of ["20261001080000_create_identity_and_house.sql", "20261001090000_harden_house_authorization.sql", "20261001100000_create_presence_and_knocks.sql"]) {
      await database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    await database.query("insert into auth.users(id) values ($1)", [userId]);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    const originalHouse = await database.query("select public.create_house_with_owner() as id");
    await database.query("update public.profiles set display_name=$1 where id=$2", ["Biệt danh đã lưu", userId]);
    await database.query("select public.set_presence('calm',2,'quiet','Trạng thái đã lưu','',null,0)");
    const bundle = await readFile(new URL("../upgrade-identity.sql", import.meta.url), "utf8");
    // Only trailing formatting whitespace is normalized in the generated artifact.
    for (const name of ["20261001110000_add_mascot_to_house_members.sql", "20261001111500_harden_mascot_assignment.sql"]) {
      const source = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
      expect(bundle).toContain(source.replace(/[ \t]+(?=\r?$)/gm, ""));
    }
    await database.exec(bundle);
    expect((await database.query("select id from public.houses")).rows).toEqual(originalHouse.rows);
    expect((await database.query("select display_name from public.profiles")).rows).toEqual([{ display_name: "Biệt danh đã lưu" }]);
    expect((await database.query("select note,version from public.presence_entries")).rows).toEqual([{ note: "Trạng thái đã lưu", version: 1 }]);
    await database.exec("set role authenticated");
    await database.query("select public.assign_mascot('rabbit')");
    expect((await database.query("select user_id,mascot from public.house_members")).rows).toEqual([{ user_id: userId, mascot: "rabbit" }]);
    await database.exec("reset role");
    await expect(database.exec(bundle)).rejects.toThrow("Identity already installed");
    await database.exec("rollback");
    expect((await database.query("select mascot from public.house_members")).rows).toEqual([{ mascot: "rabbit" }]);
  } finally {
    await database.close();
  }
}, 30_000);
