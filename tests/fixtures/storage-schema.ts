import type { PGlite } from "@electric-sql/pglite";
/** Test-only Storage metadata boundary. Actual object bytes/API are tested separately. */
export async function createStorageSchema(db: PGlite) {
  await db.exec(`
    create role service_role nologin bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    grant select on storage.buckets to anon,authenticated,service_role;
  `);
}
