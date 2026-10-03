import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline/store";
import { gameActors, gameHouse, initialGame } from "@/modules/games/test-fixtures";
import type { GameSession } from "@/modules/games/model";
import { deriveIslandState, type IslandEvent } from "./model";
import { IslandClient, parseIslandView, type IslandTransport } from "./client";
const context = { accountId: gameActors[0], houseId: gameHouse };
const time = "2026-10-02T09:00:00.000Z";
function completed(): GameSession {
  const base = initialGame();
  const events = gameActors.map((actorId, index) => ({ sequence: index + 1, actorId, operationId: crypto.randomUUID(), createdAt: time, kind: "line" as const, payload: { text: index === 0 ? "Thỏ đi tìm lá." : "Cú tìm thấy một ngôi nhà." } }));
  return { ...base, status: "completed", version: 3, turn: null, events, artifact: { sessionId: base.id, gameType: base.gameType, events, answer: null } };
}
function setup() {
  const artifact = completed();
  const events: IslandEvent[] = [{ id: crypto.randomUUID(), houseId: gameHouse, createdAt: time, type: "GAME_COMPLETED", sourceType: "game-artifact", sourceId: artifact.id }];
  const view = { state: deriveIslandState(gameHouse, events), artifacts: [artifact] };
  const store = new AccountOfflineStore(context.accountId);
  const transport: IslandTransport = { read: vi.fn(async () => ({ context, state: view.state })), list: vi.fn(async () => ({ context, sessions: [artifact] })) };
  let online = true;
  return { view, store, transport, client: new IslandClient(context, store, transport, () => online), offline: () => { online = false; } };
}
afterEach(async () => { for (const account of gameActors) await clearAccountOfflineData(account); });

it("keeps validated projection and completed artifacts across offline reload without speculative growth", async () => {
  const { client, view, transport, offline } = setup();
  expect(await client.refresh()).toEqual({ view, cached: false });
  offline();
  expect(await client.refresh()).toEqual({ view, cached: true });
  const reload = new IslandClient(context, new AccountOfflineStore(context.accountId), transport, () => false);
  expect((await reload.refresh()).view).toEqual(view);
  expect(transport.read).toHaveBeenCalledTimes(1);
  expect(view.state.world.memories).toBe(false);
});
it("isolates accounts and House caches and rejects invalid artifact projections", async () => {
  const { client, view, transport } = setup(); await client.refresh();
  const other = new IslandClient({ ...context, accountId: gameActors[1] }, new AccountOfflineStore(gameActors[1]), transport, () => false);
  expect(await other.cached()).toBeNull();
  expect(parseIslandView({ ...view, artifacts: [initialGame()] }, context)).toBeNull();
  expect(parseIslandView({ ...view, artifacts: [{ ...view.artifacts[0], houseId: crypto.randomUUID() }] }, context)).toBeNull();
  expect(parseIslandView({ ...view, state: { ...view.state, islandLevel: 9 } }, context)).toBeNull();
  expect(parseIslandView({ ...view, state: deriveIslandState(gameHouse, []) }, context)).toBeNull();
  expect(() => new IslandClient(context, new AccountOfflineStore(gameActors[1]), transport)).toThrow("Matching");
});
it("filters active games out of Island history and never caches their private answers", async () => {
  const { client, transport } = setup();
  const active = initialGame({ operationId: crypto.randomUUID(), sessionId: crypto.randomUUID(), expectedVersion: 0, kind: "create", payload: { gameType: "draw-guess", prompt: "Bí mật của Thỏ", turnLimit: 4 } });
  vi.mocked(transport.list).mockResolvedValue({ context, sessions: [active] });
  expect((await client.refresh()).view?.artifacts).toEqual([]);
  expect(JSON.stringify(await client.cached())).not.toContain("Bí mật");
});
it("preserves the last valid version when an old read arrives and permits an empty world cache", async () => {
  const { client, view } = setup();
  await client.remember(view);
  const empty = { state: deriveIslandState(gameHouse, []), artifacts: [] };
  expect((await client.remember(empty)).state.version).toBe(1);
  await clearAccountOfflineData(context.accountId);
  const fresh = setup();
  expect((await fresh.client.remember(empty)).state.version).toBe(0);
});
it("keeps a cached view on invalid reads but stops access after explicit authorization denial", async () => {
  const { client, transport, view } = setup(); await client.refresh();
  vi.mocked(transport.read).mockResolvedValue({ error: "Temporary network failure" });
  expect(await client.refresh()).toMatchObject({ view, cached: true, error: expect.any(String) });
  vi.mocked(transport.read).mockResolvedValue({ blocked: true });
  expect(await client.refresh()).toMatchObject({ blocked: true });
  await expect(client.cached()).rejects.toThrow("stopped");
});
it("stops cached access when a read reports another account or House", async () => {
  const { client, transport, view } = setup(); await client.refresh();
  vi.mocked(transport.read).mockResolvedValue({ context: { ...context, houseId: crypto.randomUUID() }, state: view.state });
  expect(await client.refresh()).toMatchObject({ blocked: true });
  await expect(client.cached()).rejects.toThrow("stopped");
});
it("logout rejects a late response and cannot restore deleted cache", async () => {
  const { client, transport, view } = setup();
  let resolve!: (value: Awaited<ReturnType<IslandTransport["read"]>>) => void;
  vi.mocked(transport.read).mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = client.refresh(); await vi.waitFor(() => expect(resolve).toBeDefined());
  await clearAccountOfflineData(context.accountId);
  resolve({ context, state: view.state });
  await expect(pending).rejects.toThrow();
  expect(await new AccountOfflineStore(context.accountId).listRecent()).toEqual([]);
});
