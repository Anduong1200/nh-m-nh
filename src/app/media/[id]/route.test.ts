import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ media: vi.fn(), client: vi.fn(), normalize: vi.fn() }));
vi.mock("@/modules/media/server", () => ({ getMediaReference: mocks.media }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/modules/media/photo", () => ({ normalizePhoto: mocks.normalize }));
import { GET } from "./route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", houseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const download = vi.fn(), from = vi.fn();
function read() { return GET(new Request(`http://localhost/media/${id}?house=${houseId}`), { params: Promise.resolve({ id }) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.media.mockResolvedValue({ kind: "photo", bucket: "nha-minh-private", path: `${houseId}/${id}` }); from.mockReturnValue({ download }); mocks.client.mockResolvedValue({ storage: { from } }); download.mockResolvedValue({ data: new Blob(["encoded"]), error: null }); mocks.normalize.mockResolvedValue(Buffer.from("actual-jpeg")); });
it("uses authorized user-scoped storage and returns no-store normalized image bytes", async () => {
  const response = await read(); expect(response.status).toBe(200); expect(mocks.media).toHaveBeenCalledWith(id, houseId); expect(download).toHaveBeenCalledWith(`${houseId}/${id}`);
  expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("content-type")).toBe("image/jpeg"); expect(response.headers.get("x-content-type-options")).toBe("nosniff"); expect(await response.text()).toBe("actual-jpeg");
});
it.each([null, { kind: "audio" }])("never downloads inaccessible or non-photo metadata", async media => { mocks.media.mockResolvedValue(media); expect((await read()).status).toBe(404); expect(mocks.client).not.toHaveBeenCalled(); });
it("fails closed with identical response for auth, storage and pixel errors", async () => {
  mocks.media.mockRejectedValueOnce(new Error("Signed out")); expect((await read()).status).toBe(404);
  download.mockResolvedValueOnce({ data: null, error: {} }); expect((await read()).status).toBe(404);
  mocks.normalize.mockRejectedValueOnce(new Error("Corrupt")); const response = await read(); expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toContain("no-store");
});
