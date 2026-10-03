import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ media: vi.fn(), client: vi.fn(), normalize: vi.fn(), voice: vi.fn() }));
vi.mock("@/modules/media/server", () => ({ getMediaReference: mocks.media }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/modules/media/photo", () => ({ normalizePhoto: mocks.normalize }));
vi.mock("@/modules/media/voice", () => ({ normalizeVoice: mocks.voice }));
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
function audioRead(range?: string, extra?: Record<string, string>) { return GET(new Request(`http://localhost/media/${id}?house=${houseId}`, { headers: { ...(range ? { Range: range } : {}), ...extra } }), { params: Promise.resolve({ id }) }); }
function readyVoice() { mocks.media.mockResolvedValue({ kind: "audio", mime: "audio/wav", bytes: 10, durationSeconds: 1, bucket: "nha-minh-private", path: `${houseId}/${id}` }); mocks.voice.mockReturnValue({ bytes: Buffer.from("0123456789"), durationSeconds: 1 }); }
it("serves validated private voice including a browser's bounded byte-range request", async () => {
  readyVoice();
  let response = await audioRead(); expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("audio/wav"); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.text()).toBe("0123456789");
  response = await audioRead("bytes=2-5"); expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 2-5/10"); expect(response.headers.get("content-length")).toBe("4"); expect(await response.text()).toBe("2345");
  response = await audioRead("bytes=-3"); expect(await response.text()).toBe("789");
  response = await audioRead("bytes=8-"); expect(await response.text()).toBe("89");
  response = await audioRead("bytes=2-5", { "If-Range": '"unrecognized"' }); expect(response.status).toBe(200);
});
it.each(["bytes=99-", "bytes=4-2", "bytes=-0", "bytes=0-1,3-4", "bytes=-", "bytes=9007199254740992-", "items=0-3"])("rejects unsafe or unsupported voice ranges (%s)", async range => {
  readyVoice(); const response = await audioRead(range); expect(response.status).toBe(416); expect(response.headers.get("content-range")).toBe("bytes */10"); expect(response.headers.get("cache-control")).toContain("no-store");
});
it("does not serve corrupt voice or metadata that disagrees with actual samples", async () => {
  readyVoice(); mocks.voice.mockReturnValueOnce({ bytes: Buffer.alloc(11), durationSeconds: 1 }); expect((await audioRead()).status).toBe(404);
  mocks.voice.mockReturnValueOnce({ bytes: Buffer.alloc(10), durationSeconds: 61 }); expect((await audioRead()).status).toBe(404);
  mocks.voice.mockImplementationOnce(() => { throw new Error("Invalid bytes"); }); expect((await audioRead()).status).toBe(404);
});
