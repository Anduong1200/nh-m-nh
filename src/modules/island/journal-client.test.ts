import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline/store";
import { gameActors, gameHouse } from "@/modules/games/test-fixtures";
import { IslandJournalClient, type IslandJournalTransport } from "./journal-client";
import type { IslandEntry, IslandEntryCommand } from "./journal";
const context = { accountId: gameActors[0], houseId: gameHouse };
function setup() {
  const entry: IslandEntry = { id: crypto.randomUUID(), houseId: gameHouse, createdBy: gameActors[0], entryType: "memory", title: "Kỷ niệm", body: "Giữ cho hai đứa.", occurredOn: "2020-02-29", sourceSessionId: null, version: 1, createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z", trashedAt: null };
  const command: IslandEntryCommand = { operationId: crypto.randomUUID(), entryId: entry.id, expectedVersion: 0, kind: "create", payload: { entryType: entry.entryType, title: entry.title, body: entry.body, occurredOn: entry.occurredOn, sourceSessionId: null, confirmed: true } };
  const transport: IslandJournalTransport = { read: vi.fn(async () => ({ context, page: { entries: [entry], next: null } })), entry: vi.fn(async () => ({ context, entry })), write: vi.fn(async () => ({ receipt: { entryId: entry.id, operationId: command.operationId, entry, outcome: "applied" as const } })) };
  let online = true; const store = new AccountOfflineStore(context.accountId);
  return { entry, command, transport, store, client: new IslandJournalClient(context, store, transport, () => online), offline: () => { online = false; } };
}
afterEach(async () => { for (const account of gameActors) await clearAccountOfflineData(account); });
it("caches only authorized rows and supports private account/House-bound offline reads", async () => {
  const { client, entry, offline, transport } = setup(); expect((await client.read()).page?.entries).toEqual([entry]); offline(); expect(await client.read()).toMatchObject({ cached: true, page: { entries: [entry] } }); expect(transport.read).toHaveBeenCalledTimes(1);
  const other = new IslandJournalClient({ ...context, accountId: gameActors[1] }, new AccountOfflineStore(gameActors[1]), transport, () => false); expect(await other.cached()).toEqual([]);
});
it("entity versions prevent late historical retry receipts from reverting partner edits", async () => {
  const { client, entry, command } = setup(); await client.remember({ ...entry, title: "Người kia đã sửa", version: 2 });
  expect((await client.write(command)).receipt?.entry.version).toBe(1); expect((await client.cached())[0]?.title).toBe("Người kia đã sửa");
  expect((await client.read()).page?.entries[0]?.version).toBe(2);
});
it("an older empty list cannot hide a page acknowledged while that request was in flight", async () => {
  const { client, entry, transport } = setup(); await client.remember(entry); vi.mocked(transport.read).mockResolvedValue({ context, page: { entries: [], next: null } }); expect((await client.read()).page?.entries[0]?.id).toBe(entry.id);
});
it("retains cached reads on transient failure but stops after explicit authorization denial", async () => {
  const { client, transport, entry } = setup(); await client.read(); vi.mocked(transport.read).mockResolvedValue({ error: "network" }); expect(await client.read()).toMatchObject({ cached: true, page: { entries: [entry] } });
  vi.mocked(transport.read).mockResolvedValue({ blocked: true }); expect((await client.read()).blocked).toBe(true); await expect(client.cached()).rejects.toThrow("stopped");
});
it("draft CAS preserves both tab proposals; logout rejects late reads and writes", async () => {
  const { client, command, transport, entry } = setup(); const draft = await client.saveDraft("island-journal-draft:one", { title: "Draft" }, null); expect(draft.status).toBe("saved"); expect((await client.saveDraft("island-journal-draft:one", { title: "Other" }, null)).status).toBe("conflict");
  let resolve!: (reply: Awaited<ReturnType<IslandJournalTransport["write"]>>) => void;
  vi.mocked(transport.write).mockImplementation(() => new Promise(done => { resolve = done; })); const pending = client.write(command); await vi.waitFor(() => expect(resolve).toBeDefined()); await clearAccountOfflineData(context.accountId); resolve({ receipt: { operationId: command.operationId, entryId: entry.id, outcome: "applied", entry } }); await expect(pending).rejects.toThrow(); expect(await new AccountOfflineStore(context.accountId).listRecent()).toEqual([]);
});
