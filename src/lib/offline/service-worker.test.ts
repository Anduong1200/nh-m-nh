import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://nha-minh.example";
const script = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

function harness(build?: { id: string; assets: string[] }) {
  const listeners = new Map<string, (event: unknown) => void>();
  const content = new Map<string, Map<string, Response>>();
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () =>
    new Response("public asset", { headers: { "cache-control": "public, max-age=31536000, immutable", "content-type": "text/javascript" } }),
  );
  const skipWaiting = vi.fn(async () => undefined);
  const showNotification = vi.fn(async () => undefined);
  const closeNotification = vi.fn();
  const normalize = (value: string | Request) => typeof value === "string" ? new URL(value, ORIGIN).href : value.url;
  class RelativeRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN) : input, init);
    }
  }
  const caches = {
    async open(name: string) {
      const items = content.get(name) ?? new Map<string, Response>();
      content.set(name, items);
      return {
        async match(key: string | Request) { return items.get(normalize(key))?.clone(); },
        async put(key: string | Request, response: Response) { items.set(normalize(key), response.clone()); },
        async keys() { return [...items.keys()].map((url) => new RelativeRequest(url)); },
        async delete(key: string | Request) { return items.delete(normalize(key)); },
        async addAll(requests: Request[]) {
          for (const request of requests) items.set(request.url, await fetchMock(request));
        },
      };
    },
    async keys() { return [...content.keys()]; },
    async delete(name: string) { return content.delete(name); },
  };
  runInNewContext(script, {
    self: { NHA_MINH_OFFLINE_BUILD: build, registration: { showNotification, getNotifications: async () => [{ close: closeNotification }] }, location: { origin: ORIGIN }, addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler), skipWaiting, clients: { claim: vi.fn(async () => undefined) } },
    caches,
    fetch: fetchMock,
    URL,
    Request: RelativeRequest,
    Response,
  });

  function dispatchFetch(path: string, options?: RequestInit, navigate = false) {
    const request = new RelativeRequest(path, options);
    if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
    let result: Promise<Response> | undefined;
    listeners.get("fetch")?.({ request, respondWith: (response: Promise<Response>) => { result = response; } });
    return result;
  }

  return { listeners, content, fetchMock, skipWaiting, caches, dispatchFetch, showNotification, closeNotification };
}

describe("public service-worker caching boundary", () => {
  it("precaches a public recovery document and editor code but rejects private build-manifest paths", async () => {
    const worker = harness({ id: "test-build", assets: ["/_next/static/chunk.js", "/house", "/media/private", "/_next/static/../private.js"] });
    let installed: Promise<unknown> | undefined;
    worker.listeners.get("install")?.({ waitUntil: (work: Promise<unknown>) => { installed = work; } }); await installed;
    const paths = [...worker.content.get("nha-minh-public-shell-v2-test-build")!.keys()].map(url => new URL(url).pathname);
    expect(paths).toContain("/offline"); expect(paths).toContain("/_next/static/chunk.js"); expect(paths).not.toContain("/house"); expect(paths).not.toContain("/media/private");
    expect(worker.fetchMock.mock.calls.every(([request]) => request.credentials === "omit")).toBe(true);
    worker.fetchMock.mockRejectedValue(new Error("origin stopped"));
    expect(await (await worker.dispatchFetch("/offline", undefined, true))?.text()).toBe("public asset");
    expect(await (await worker.dispatchFetch("/_next/static/chunk.js"))?.text()).toBe("public asset");
  });
  it("shows generic push only for the currently bound device and ignores delayed pushes after logout", async () => {
    const worker = harness(), token = crypto.randomUUID(), eventId = crypto.randomUUID(), ack = vi.fn();
    async function event(name: string, value: Record<string, unknown>) { let work: Promise<unknown> | undefined; worker.listeners.get(name)?.({ ...value, waitUntil: (pending: Promise<unknown>) => { work = pending; } }); await work; }
    const push = (deviceToken: string) => event("push", { data: { text: () => JSON.stringify({ kind: "nha-minh", deviceToken, eventId, title: "Private", body: "Secret letter" }) } });
    await push(token); expect(worker.showNotification).not.toHaveBeenCalled();
    await event("message", { data: { type: "SET_PUSH_BINDING", token }, ports: [{ postMessage: ack }] }); expect(ack).toHaveBeenCalledWith({ type: "PUSH_BINDING_ACK", token });
    await push(crypto.randomUUID()); expect(worker.showNotification).not.toHaveBeenCalled();
    await push(token); expect(worker.showNotification).toHaveBeenCalledWith("Nhà Mình", expect.objectContaining({ body: "Có điều mới trong Nhà.", tag: eventId }));
    await event("message", { data: { type: "CLEAR_PUSH_BINDING" }, ports: [{ postMessage: ack }] });
    await push(token); expect(worker.showNotification).toHaveBeenCalledTimes(1); expect(worker.closeNotification).toHaveBeenCalledTimes(2);
  });
  it("caches only versioned public Whiteboard font assets without session cookies", async () => {
    const worker = harness();
    const path = "/vendor/excalidraw-0.18.1/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2";
    worker.fetchMock.mockResolvedValue(new Response("public font", { headers: { "cache-control": "public, max-age=31536000, immutable", "content-type": "font/woff2" } }));
    await worker.dispatchFetch(path);
    await worker.dispatchFetch(path);
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
    expect(worker.fetchMock.mock.calls[0]?.[0].credentials).toBe("omit");
    expect(worker.dispatchFetch(path + "?private=1")).toBeUndefined();
    expect(worker.dispatchFetch("/vendor/excalidraw-0.18.1/media/private-photo.png")).toBeUndefined();
    expect(worker.dispatchFetch(path, { headers: { authorization: "Bearer private" } })).toBeUndefined();
    expect(worker.content.get("nha-minh-public-assets-v2")?.size).toBe(1);
  });
  it("does not intercept APIs, private media, Supabase, cross-origin assets or RSC responses", () => {
    const worker = harness();
    for (const path of ["/api/board", "/letters/private", "/storage/private/file", "https://project.supabase.co/rest/v1/notes", "https://other.example/_next/static/chunk.js"]) {
      expect(worker.dispatchFetch(path)).toBeUndefined();
    }
    expect(worker.dispatchFetch("/_next/static/chunk.js", { headers: { RSC: "1" } })).toBeUndefined();
    expect(worker.dispatchFetch("/_next/static/chunk.js", { headers: { Authorization: "Bearer private" } })).toBeUndefined();
    expect(worker.dispatchFetch("/_next/static/chunk.js", { cache: "no-store" })).toBeUndefined();
    expect(worker.dispatchFetch("/_next/static/chunk.js", { headers: { accept: "text/x-component" } })).toBeUndefined();
    expect(worker.dispatchFetch("/_next/static/chunk.js?private=true")).toBeUndefined();
    expect(worker.dispatchFetch("/api/board", { method: "POST", body: "private" })).toBeUndefined();
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("fetches immutable static assets without cookies and reuses only their public cache", async () => {
    const worker = harness();
    const first = await worker.dispatchFetch("/_next/static/hash/chunk.js");
    const second = await worker.dispatchFetch("/_next/static/hash/chunk.js");

    expect(await first?.text()).toBe("public asset");
    expect(await second?.text()).toBe("public asset");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
    expect(worker.fetchMock.mock.calls[0]?.[0].credentials).toBe("omit");
    expect(worker.content.get("nha-minh-public-assets-v2")?.size).toBe(1);
  });

  it.each([
    { "cache-control": "private, immutable", "content-type": "text/javascript" },
    { "cache-control": "no-store, immutable", "content-type": "text/javascript" },
    { "cache-control": "public, max-age=60", "content-type": "text/javascript" },
    { "cache-control": "public, immutable", "content-type": "text/html" },
    { "cache-control": "public, immutable", "content-type": "text/x-component" },
    { "cache-control": "public, immutable", "content-type": "application/json" },
    { "cache-control": "public, immutable", "content-type": "text/javascript", "set-cookie": "session=private" },
  ])("refuses to cache nonpublic or sensitive static-path responses: %j", async (headers) => {
    const worker = harness();
    worker.fetchMock.mockResolvedValue(new Response("sensitive", { headers }));
    await worker.dispatchFetch("/_next/static/not-safe.js");
    expect(worker.content.get("nha-minh-public-assets-v2")?.size).toBe(0);
  });

  it("serves a public offline fallback without persisting authenticated navigations", async () => {
    const worker = harness();
    const shell = await worker.caches.open("nha-minh-public-shell-v2-baseline");
    await shell.put("/offline.html", new Response("generic offline shell"));
    worker.fetchMock.mockResolvedValueOnce(new Response("private letter"));
    expect(await (await worker.dispatchFetch("/letters/secret", undefined, true))?.text()).toBe("private letter");
    worker.fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await (await worker.dispatchFetch("/letters/secret", undefined, true))?.text()).toBe("generic offline shell");
    expect([...worker.content.values()].some((cache) => cache.has(`${ORIGIN}/letters/secret`))).toBe(false);
  });

  it("precaches only listed public shell files and waits for an explicit update message", async () => {
    const worker = harness();
    let installed: Promise<unknown> | undefined;
    worker.listeners.get("install")?.({ waitUntil: (work: Promise<unknown>) => { installed = work; } });
    await installed;

    const paths = [...worker.content.get("nha-minh-public-shell-v2-baseline")?.keys() ?? []].map((url) => new URL(url).pathname);
    expect(paths).toEqual(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]);
    expect(worker.fetchMock.mock.calls.every(([request]) => request.credentials === "omit")).toBe(true);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.listeners.get("message")?.({ data: { type: "ACTIVATE_UPDATE" } });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
});
