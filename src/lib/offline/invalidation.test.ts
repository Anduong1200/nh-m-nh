import { afterEach, expect, it, vi } from "vitest";
import { notifyAccountInvalidation, subscribeAccountInvalidation } from "./invalidation";
afterEach(() => vi.unstubAllGlobals());
it("closes only matching account views and detaches on unmount", () => {
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("BroadcastChannel", undefined);
  const own = vi.fn(), other = vi.fn(); const detach = subscribeAccountInvalidation("own", own); const detachOther = subscribeAccountInvalidation("other", other);
  notifyAccountInvalidation("own"); expect(own).toHaveBeenCalledOnce(); expect(other).not.toHaveBeenCalled();
  detach(); notifyAccountInvalidation("own"); expect(own).toHaveBeenCalledOnce(); detachOther();
});
it("broadcasts account identity only, accepts no cross-account signal", () => {
  vi.stubGlobal("window", new EventTarget());
  const post = vi.fn(), close = vi.fn(); const instances: Array<{ onmessage?: (event: { data: unknown }) => void }> = [];
  vi.stubGlobal("BroadcastChannel", class { onmessage?: (event: { data: unknown }) => void; constructor() { instances.push(this); } postMessage = post; close = close; });
  const callback = vi.fn(); const detach = subscribeAccountInvalidation("own", callback);
  instances[0]!.onmessage?.({ data: { accountId: "other" } }); expect(callback).not.toHaveBeenCalled();
  instances[0]!.onmessage?.({ data: { accountId: "own" } }); expect(callback).toHaveBeenCalledOnce();
  notifyAccountInvalidation("own"); expect(post).toHaveBeenCalledWith({ accountId: "own" }); detach(); expect(close).toHaveBeenCalledTimes(2);
});
it("keeps local invalidation and logout safe if channel creation or sending throws", () => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("Unavailable"); } });
  const callback = vi.fn(); const detach = subscribeAccountInvalidation("own", callback);
  expect(() => notifyAccountInvalidation("own")).not.toThrow(); expect(callback).toHaveBeenCalledOnce(); detach();
  const close = vi.fn(); vi.stubGlobal("BroadcastChannel", class { postMessage() { throw new Error("Unavailable"); } close = close; });
  expect(() => notifyAccountInvalidation("own")).not.toThrow(); expect(close).toHaveBeenCalledOnce();
});
