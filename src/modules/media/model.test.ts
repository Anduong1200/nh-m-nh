import { describe, expect, it } from "vitest";
import { mediaReferenceFromRow } from "./model";
const row = { id: crypto.randomUUID(), house_id: crypto.randomUUID(), owner_id: crypto.randomUUID(), state: "ready", media_type: "photo", bucket_id: "nha-minh-private", mime_type: "image/jpeg", size_bytes: 100, duration_seconds: null, storage_path: "" };
row.storage_path = `${row.house_id}/${row.id}`;
describe("private media references", () => {
  it("decodes verified metadata without carrying public or signed URLs", () => {
    expect(mediaReferenceFromRow({ ...row, url: "https://public.invalid/photo" })).toEqual({ id: row.id, houseId: row.house_id, ownerId: row.owner_id, kind: "photo", bucket: "nha-minh-private", path: row.storage_path, mime: "image/jpeg", bytes: 100, durationSeconds: null });
  });
  it.each([{ state: "pending" }, { bucket_id: "public" }, { storage_path: `another-house/${row.id}` }, { size_bytes: null }, { size_bytes: 20971521 }, { mime_type: "image/svg+xml" }, { duration_seconds: 1 }])("rejects unverified or unsafe metadata %j", (patch) => {
    expect(mediaReferenceFromRow({ ...row, ...patch })).toBeNull();
  });
  it("bounds short voice duration and handles numeric DB serialization", () => {
    expect(mediaReferenceFromRow({ ...row, media_type: "audio", mime_type: "audio/webm", duration_seconds: "60", size_bytes: "100" })?.durationSeconds).toBe(60);
    for (const duration of [null, 0, 61, Infinity, "NaN"]) expect(mediaReferenceFromRow({ ...row, media_type: "audio", mime_type: "audio/webm", duration_seconds: duration })).toBeNull();
  });
});
