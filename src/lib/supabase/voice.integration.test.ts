import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLettersDatabase, letterAsUser, letterActors } from "../../../tests/fixtures/letters-db";
import { createStorageSchema } from "../../../tests/fixtures/storage-schema";
let fixture: Awaited<ReturnType<typeof createLettersDatabase>>;
beforeAll(async () => { fixture = await createLettersDatabase(); await createStorageSchema(fixture.db); await fixture.db.exec(await readFile("supabase/install-media.sql", "utf8")); await fixture.db.exec(await readFile("supabase/install-voice.sql", "utf8")); }, 60000);
afterAll(async () => { await fixture?.db.close(); });
async function register(actor: string = letterActors[0], house = fixture.house, duration = 1, size = 32044, mime = "audio/wav") {
  const id = crypto.randomUUID();
  await fixture.db.query("insert into storage.objects(bucket_id,name,metadata) values('nha-minh-private',$1,$2)", [`${house}/${id}`, { size, mimetype: mime }]);
  return (await fixture.db.transaction(async tx => { await tx.exec("set local role service_role"); return (await tx.query<{r: {id: string}}>("select public.register_verified_voice($1,$2,$3,$4,$5) r", [id, house, actor, size, duration])).rows; }))[0]!.r;
}
it("adds WAV to the existing private bounded bucket and service-only registration", async () => {
  expect((await fixture.db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='nha-minh-private'")).rows[0]).toEqual({ public: false, file_size_limit: 4194304, allowed_mime_types: ["image/jpeg", "audio/wav"] });
  const args = [crypto.randomUUID(), fixture.house, letterActors[0]];
  for (const actor of [letterActors[0], null]) await expect(letterAsUser(fixture.db, actor, "select public.register_verified_voice($1,$2,$3,32044,1)", args)).rejects.toThrow(/permission denied/);
});
it("permits both members to read registered voice while outsider/anonymous remain denied", async () => {
  const voice = await register();
  for (const actor of letterActors.slice(0, 2)) expect(await letterAsUser(fixture.db, actor, "select name from storage.objects where name=$1", [`${fixture.house}/${voice.id}`])).toHaveLength(1);
  for (const actor of [letterActors[2], null]) expect(await letterAsUser(fixture.db, actor, "select name from storage.objects where bucket_id='nha-minh-private'")).toHaveLength(0);
});
it("rejects unsupported type, invalid duration and actor who left before registration", async () => {
  await expect(register(letterActors[2])).rejects.toThrow(/House access denied/);
  await expect(register(letterActors[0], fixture.house, 61)).rejects.toThrow(/Invalid voice/);
  await expect(register(letterActors[0], fixture.house, 0)).rejects.toThrow(/Invalid voice/);
  await expect(register(letterActors[0], fixture.house, 1, 32044, "audio/mp4")).rejects.toThrow(/not confirmed/);
  await fixture.db.exec("begin");
  try {
    await fixture.db.query("update public.house_members set status='left' where user_id=$1", [letterActors[0]]);
    await expect(register()).rejects.toThrow(/House access denied/);
  } finally { await fixture.db.exec("rollback"); }
});
it("keeps voice invisible before confirmed registration and blocks broad policies", async () => {
  await fixture.db.exec("begin");
  try {
    await fixture.db.exec("create policy other_broad_read_write on storage.objects for all to authenticated using(true) with check(true); create policy other_anon_read_write on storage.objects for all to anon using(true) with check(true)");
    const voice = await register();
    for (const actor of [letterActors[2], null]) expect(await letterAsUser(fixture.db, actor, "select name from storage.objects where bucket_id='nha-minh-private'")).toHaveLength(0);
    expect(await letterAsUser(fixture.db, letterActors[0], "select name from storage.objects where name not in(select storage_path from public.media_objects)")).toHaveLength(0);
    await expect(letterAsUser(fixture.db, letterActors[0], "insert into storage.objects(bucket_id,name) values('nha-minh-private','forged-voice')")).rejects.toThrow(/row-level security/);
    expect(await letterAsUser(fixture.db, letterActors[0], "update storage.objects set metadata='{}' where name=$1 returning id", [`${fixture.house}/${voice.id}`])).toHaveLength(0);
    expect(await letterAsUser(fixture.db, letterActors[0], "delete from storage.objects where name=$1 returning id", [`${fixture.house}/${voice.id}`])).toHaveLength(0);
  } finally { await fixture.db.exec("rollback"); }
});
it("guarded installer refuses a second apply without changing media or policies", async () => {
  const before = await fixture.db.query("select count(*) from public.media_objects");
  await expect(fixture.db.exec(await readFile("supabase/install-voice.sql", "utf8"))).rejects.toThrow(/already exists/);
  await fixture.db.exec("rollback");
  expect(await fixture.db.query("select count(*) from public.media_objects")).toEqual(before);
});
