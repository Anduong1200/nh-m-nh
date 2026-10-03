import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), house: vi.fn(), admin: vi.fn(), normalize: vi.fn() }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.house }));
vi.mock("@/lib/supabase/media-admin", () => ({ createMediaAdminClient: mocks.admin }));
vi.mock("./photo", () => ({ normalizePhoto: mocks.normalize, PHOTO_INPUT_MAX_BYTES: 4194304 }));
import { uploadPhotoAction } from "./actions";
const actor = "11111111-1111-4111-8111-111111111111", partner = "22222222-2222-4222-8222-222222222222", houseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { accountId: actor, houseId };
const upload = vi.fn(), rpc = vi.fn(), from = vi.fn();
function form() { const data = new FormData(); data.set("file", new File(["spoofed bytes"], "untrusted-name.svg", { type: "text/html" })); return data; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: actor }); mocks.house.mockResolvedValue({ id: houseId, members: [{ user_id: actor }, { user_id: partner }] }); mocks.normalize.mockResolvedValue(Buffer.from("normalized-jpeg"));
  upload.mockResolvedValue({ error: null }); from.mockReturnValue({ upload }); mocks.admin.mockReturnValue({ storage: { from }, rpc });
  rpc.mockImplementation(async (_name, params) => ({ data: { id: params.p_id, house_id: houseId, owner_id: actor, media_type: "photo", bucket_id: "nha-minh-private", storage_path: `${houseId}/${params.p_id}`, state: "ready", mime_type: "image/jpeg", size_bytes: 15, duration_seconds: null }, error: null }));
});
it("uses verified actor, decoded bytes and server-generated path, ignoring filename/MIME", async () => {
  expect(await uploadPhotoAction(form(), context)).toMatchObject({ media: { ownerId: actor, houseId, mime: "image/jpeg" } });
  expect(from).toHaveBeenCalledWith("nha-minh-private"); expect(upload.mock.calls[0]![0]).toMatch(new RegExp(`^${houseId}/[a-f0-9-]{36}$`));
  expect(upload.mock.calls[0]![1]).toEqual(Buffer.from("normalized-jpeg")); expect(upload.mock.calls[0]![2]).toMatchObject({ upsert: false, contentType: "image/jpeg" });
  expect(rpc.mock.calls[0]![1]).toMatchObject({ p_actor_id: actor, p_house_id: houseId, p_size: 15 });
});
it.each([{ accountId: partner, houseId }, { accountId: actor, houseId: crypto.randomUUID() }])("denies forged context before privileged access", async context => {
  expect(await uploadPhotoAction(form(), context)).toMatchObject({ blocked: true }); expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects failed auth, departed member and invalid pixels before admin calls", async () => {
  mocks.user.mockRejectedValueOnce(new Error("Signed out")); expect(await uploadPhotoAction(form(), context)).toHaveProperty("error"); expect(mocks.admin).not.toHaveBeenCalled();
  mocks.house.mockResolvedValueOnce({ id: houseId, members: [{ user_id: partner }] }); expect(await uploadPhotoAction(form(), context)).toMatchObject({ blocked: true });
  mocks.normalize.mockRejectedValueOnce(new Error("Invalid bytes")); expect(await uploadPhotoAction(form(), context)).toHaveProperty("error"); expect(mocks.admin).not.toHaveBeenCalled();
});
it("never claims ready after upload or metadata confirmation failure", async () => {
  upload.mockResolvedValueOnce({ error: {} }); expect(await uploadPhotoAction(form(), context)).not.toHaveProperty("media"); expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } }); expect(await uploadPhotoAction(form(), context)).toMatchObject({ blocked: true });
});
