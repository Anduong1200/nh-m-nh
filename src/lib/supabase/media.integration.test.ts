import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLettersDatabase, letterAsUser, letterActors } from "../../../tests/fixtures/letters-db";
import { createStorageSchema } from "../../../tests/fixtures/storage-schema";
let fixture: Awaited<ReturnType<typeof createLettersDatabase>>;
beforeAll(async () => { fixture = await createLettersDatabase(); await createStorageSchema(fixture.db); await fixture.db.exec(await readFile("supabase/install-media.sql", "utf8")); }, 60000);
afterAll(async () => { await fixture?.db.close(); });
async function register(actor: string = letterActors[0], house = fixture.house, id = crypto.randomUUID()) {
  await fixture.db.query("insert into storage.objects(bucket_id,name,metadata) values('nha-minh-private',$1,$2)", [`${house}/${id}`, { size: 123, mimetype: "image/jpeg" }]);
  const rows = await fixture.db.transaction(async tx => { await tx.exec("set local role service_role"); return (await tx.query<{ r: { id: string } }>("select public.register_verified_photo($1,$2,$3,123) r", [id, house, actor])).rows; });
  return rows[0]!.r;
}
it("creates a private bounded bucket and only grants registration to server role", async () => {
  expect((await fixture.db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='nha-minh-private'")).rows[0]).toEqual({ public: false, file_size_limit: 4194304, allowed_mime_types: ["image/jpeg"] });
  const id = crypto.randomUUID();
  await expect(letterAsUser(fixture.db, letterActors[0], "select public.register_verified_photo($1,$2,$3,123)", [id, fixture.house, letterActors[0]])).rejects.toThrow(/permission denied/);
  await expect(letterAsUser(fixture.db, null, "select public.register_verified_photo($1,$2,$3,123)", [id, fixture.house, letterActors[0]])).rejects.toThrow(/permission denied/);
});
it("allows both active House members to read confirmed photo, denies outsider/anonymous", async () => {
  const photo = await register();
  for (const actor of letterActors.slice(0, 2)) expect(await letterAsUser(fixture.db, actor, "select name from storage.objects where name=$1", [`${fixture.house}/${photo.id}`])).toHaveLength(1);
  expect(await letterAsUser(fixture.db, letterActors[2], "select name from storage.objects")).toHaveLength(0);
  expect(await letterAsUser(fixture.db, null, "select name from storage.objects")).toHaveLength(0);
  expect(await letterAsUser(fixture.db, letterActors[2], "select id from public.media_objects")).toHaveLength(0);
});
it("blocks broad anonymous policies for this bucket while preserving unrelated bucket access", async () => {
  await fixture.db.exec("begin");
  try {
    await fixture.db.exec("create policy unrelated_anon_policy on storage.objects for all to anon using(true) with check(true)");
    await fixture.db.exec("insert into storage.buckets(id,name) values('unrelated','unrelated'); insert into storage.objects(bucket_id,name) values('unrelated','public-example')");
    expect(await letterAsUser(fixture.db, null, "select name from storage.objects where bucket_id='nha-minh-private'")).toHaveLength(0);
    expect(await letterAsUser(fixture.db, null, "select name from storage.objects where bucket_id='unrelated'")).toEqual([{ name: "public-example" }]);
    expect(await letterAsUser(fixture.db, null, "delete from storage.objects where bucket_id='nha-minh-private' returning id")).toHaveLength(0);
    await expect(letterAsUser(fixture.db, null, "insert into storage.objects(bucket_id,name) values('nha-minh-private','forged')")).rejects.toThrow(/row-level security/);
  } finally { await fixture.db.exec("rollback"); }
});
it("denies browser upload, overwrite, deletion and metadata ready-state writes", async () => {
  const photo = await register();
  await expect(letterAsUser(fixture.db, letterActors[0], "insert into storage.objects(bucket_id,name) values('nha-minh-private',$1)", [`${fixture.house}/${crypto.randomUUID()}`])).rejects.toThrow(/row-level security/);
  expect(await letterAsUser(fixture.db, letterActors[0], "update storage.objects set metadata='{}' where name=$1 returning id", [`${fixture.house}/${photo.id}`])).toHaveLength(0);
  expect(await letterAsUser(fixture.db, letterActors[0], "delete from storage.objects where name=$1 returning id", [`${fixture.house}/${photo.id}`])).toHaveLength(0);
  await expect(letterAsUser(fixture.db, letterActors[0], "update public.media_objects set state='error' where id=$1", [photo.id])).rejects.toThrow(/permission denied/);
});
it("rechecks actor House at registration and leaves unconfirmed bytes invisible", async () => {
  await expect(register(letterActors[2], fixture.house)).rejects.toThrow(/House access denied/);
  expect(await letterAsUser(fixture.db, letterActors[0], "select name from storage.objects where name not in(select storage_path from public.media_objects)")).toHaveLength(0);
});
it("requires matching uploaded size/type and current membership", async () => {
  const id = crypto.randomUUID();
  await expect(fixture.db.query("select public.register_verified_photo($1,$2,$3,123)", [id, fixture.house, letterActors[0]])).rejects.toThrow(/not confirmed/);
  await fixture.db.exec("begin");
  try {
    await fixture.db.query("update public.house_members set status='left' where user_id=$1", [letterActors[0]]);
    await expect(fixture.db.query("select public.register_verified_photo($1,$2,$3,123)", [id, fixture.house, letterActors[0]])).rejects.toThrow(/House access denied/);
  } finally { await fixture.db.exec("rollback"); }
});
it("remains private when a project already has broad permissive Storage policies", async () => {
  await fixture.db.exec("begin");
  try {
    await fixture.db.exec("create policy unrelated_broad_policy on storage.objects for all to authenticated using(true) with check(true)");
    const id = crypto.randomUUID();
    await fixture.db.query("insert into storage.objects(bucket_id,name,metadata) values('nha-minh-private',$1,$2)", [`${fixture.house}/${id}`, { size: 123, mimetype: "image/jpeg" }]);
    expect(await fixture.db.query("select * from storage.objects where name=$1", [`${fixture.house}/${id}`])).toHaveProperty("rows");
    await fixture.db.exec("savepoint policy_boundary; set local role authenticated");
    await fixture.db.query("select set_config('request.jwt.claim.sub',$1,true)", [letterActors[2]]);
    expect((await fixture.db.query("select name from storage.objects where bucket_id='nha-minh-private'")).rows).toHaveLength(0);
    expect((await fixture.db.query("update storage.objects set metadata='{}' where bucket_id='nha-minh-private' returning id")).rows).toHaveLength(0);
    expect((await fixture.db.query("delete from storage.objects where bucket_id='nha-minh-private' returning id")).rows).toHaveLength(0);
    await expect(fixture.db.query("insert into storage.objects(bucket_id,name) values('nha-minh-private',$1)", [`${fixture.house}/${crypto.randomUUID()}`])).rejects.toThrow(/row-level security/);
    await fixture.db.exec("rollback to savepoint policy_boundary; reset role");
    await fixture.db.exec("set local role authenticated");
    await fixture.db.query("select set_config('request.jwt.claim.sub',$1,true)", [letterActors[0]]);
    expect((await fixture.db.query("select name from storage.objects where name=$1", [`${fixture.house}/${id}`])).rows).toHaveLength(0);
  } finally { await fixture.db.exec("rollback"); }
});
