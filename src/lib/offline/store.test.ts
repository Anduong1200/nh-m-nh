import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountOfflineStore,
  clearAccountOfflineData,
  RECENT_CONTENT_MAX_AGE_MS,
  RECENT_CONTENT_MAX_ITEMS,
} from "./store";

const accounts = new Set<string>();

function newAccount() {
  const id = crypto.randomUUID();
  accounts.add(id);
  return { id, store: new AccountOfflineStore(id) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of accounts) await clearAccountOfflineData(id);
  accounts.clear();
});

describe("account-scoped offline foundation", () => {
  it("keeps matching draft, recent-content and operation IDs isolated across accounts", async () => {
    const a = newAccount();
    const b = newAccount();
    await a.store.saveDraft({ id: "same-id", kind: "note", payload: "private A", expectedVersion: null });
    await b.store.saveDraft({ id: "same-id", kind: "note", payload: "private B", expectedVersion: null });
    await a.store.cacheRecent({ id: "same-id", kind: "note", payload: "recent A", serverVersion: 1 });
    await b.store.cacheRecent({ id: "same-id", kind: "note", payload: "recent B", serverVersion: 1 });
    const operation = await a.store.enqueue({ entityId: "same-id", entity: "note", mutation: "append", payload: "queued A" });

    expect((await a.store.getDraft("same-id"))?.payload).toBe("private A");
    expect((await b.store.getDraft("same-id"))?.payload).toBe("private B");
    expect((await b.store.listRecent()).map((item) => item.payload)).toEqual(["recent B"]);
    expect(await b.store.listOperations()).toEqual([]);
    await expect(b.store.preserveConflict(operation.operationId, "not authorized", 2)).rejects.toThrow("does not exist");
    expect((await a.store.listOperations())[0]?.state).toBe("pending");
  });

  it("persists unsent draft and stable operation IDs across handle reopen", async () => {
    const { id, store } = newAccount();
    await store.saveDraft({ id: "doodle", kind: "doodle", payload: { strokes: [[1, 2], [3, 4]] }, expectedVersion: null });
    const queued = await store.enqueue({ entityId: "doodle", entity: "doodle", mutation: "append", payload: { strokes: [[1, 2]] } });
    store.close();
    const reopened = new AccountOfflineStore(id);

    expect((await reopened.getDraft("doodle"))?.payload).toEqual({ strokes: [[1, 2], [3, 4]] });
    expect((await reopened.listOperations())[0]?.operationId).toBe(queued.operationId);
    expect((await reopened.listOperations())[0]?.state).toBe("pending");
  });

  it("returns both versions for a stale draft save without overwriting the current draft", async () => {
    const { store } = newAccount();
    await store.saveDraft({ id: "note", kind: "note", payload: "original", expectedVersion: null });
    await store.saveDraft({ id: "note", kind: "note", payload: "saved in another tab", expectedVersion: 1 });
    const conflict = await store.saveDraft({ id: "note", kind: "note", payload: "unsaved local version", expectedVersion: 1 });

    expect(conflict.status).toBe("conflict");
    if (conflict.status === "conflict") {
      expect(conflict.current?.payload).toBe("saved in another tab");
      expect(conflict.proposed.payload).toBe("unsaved local version");
    }
    expect((await store.getDraft("note"))?.payload).toBe("saved in another tab");
  });

  it("uses add semantics so a repeated operation ID cannot replace queued work", async () => {
    const { store } = newAccount();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    await store.enqueue({ entityId: "first", entity: "note", mutation: "append", payload: "first version" });
    await expect(store.enqueue({ entityId: "second", entity: "note", mutation: "append", payload: "replacement" })).rejects.toThrow();

    expect((await store.listOperations()).map((item) => item.payload)).toEqual(["first version"]);
  });

  it("preserves both server-conflict versions after reopen and prevents acknowledgement from discarding them", async () => {
    const { id, store } = newAccount();
    const operation = await store.enqueue({ entityId: "note", entity: "note", mutation: "update", baseVersion: 1, payload: "my change" });
    await store.preserveConflict(operation.operationId, "partner's change", 2);
    await store.preserveConflict(operation.operationId, "later version", 3);
    await expect(store.acknowledgeOperation(operation.operationId)).rejects.toThrow("Resolve");
    store.close();
    const reopened = new AccountOfflineStore(id);
    const preserved = (await reopened.listOperations())[0];

    expect(preserved?.state).toBe("conflict");
    expect(preserved?.baseVersion).toBe(1);
    expect(preserved?.conflict?.local).toBe("my change");
    expect(preserved?.conflict?.remote).toBe("partner's change");
    expect(preserved?.conflict?.remoteVersion).toBe(2);
  });

  it("clears only the logging-out account and revokes all its existing handles", async () => {
    const a = newAccount();
    const sameAccountHandle = new AccountOfflineStore(a.id);
    const b = newAccount();
    await a.store.saveDraft({ id: "draft", kind: "note", payload: "private A", expectedVersion: null });
    await a.store.enqueue({ entityId: "draft", entity: "note", mutation: "append", payload: "private A" });
    await a.store.cacheRecent({ id: "draft", kind: "note", payload: "private A", serverVersion: 1 });
    await b.store.saveDraft({ id: "draft", kind: "note", payload: "private B", expectedVersion: null });
    await clearAccountOfflineData(a.id);

    await expect(a.store.listDrafts()).rejects.toThrow("cleared");
    await expect(sameAccountHandle.saveDraft({ id: "late-write", kind: "note", payload: "old tab", expectedVersion: null })).rejects.toThrow("cleared");
    const reopened = new AccountOfflineStore(a.id);
    expect(await reopened.listDrafts()).toEqual([]);
    expect(await reopened.listOperations()).toEqual([]);
    expect(await reopened.listRecent()).toEqual([]);
    expect((await b.store.getDraft("draft"))?.payload).toBe("private B");
  });

  it("bounds recent cache size and age without expiring unsent work", async () => {
    const { store } = newAccount();
    await store.saveDraft({ id: "unsent", kind: "note", payload: "keep my draft", expectedVersion: null });
    await store.enqueue({ entityId: "unsent", entity: "note", mutation: "append", payload: "keep my action" });
    for (let index = 0; index < RECENT_CONTENT_MAX_ITEMS + 3; index++) {
      await store.cacheRecent({ id: `recent-${index}`, kind: "note", payload: index, serverVersion: 1 });
    }
    expect(await store.listRecent()).toHaveLength(RECENT_CONTENT_MAX_ITEMS);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + RECENT_CONTENT_MAX_AGE_MS + 1_000);

    expect(await store.listRecent()).toEqual([]);
    expect((await store.getDraft("unsent"))?.payload).toBe("keep my draft");
    expect(await store.listOperations()).toHaveLength(1);
  });
});
