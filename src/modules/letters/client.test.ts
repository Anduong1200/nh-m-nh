import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline/store";
import { LetterClient, type LetterTransport } from "./client";
import { letterTestCommand, letterTestContext as context, letterTestPartner, letterTestReceipt, letterTestSnapshot } from "./test-fixtures";
afterEach(async () => { await clearAccountOfflineData(context.accountId); await clearAccountOfflineData(letterTestPartner); });
function setup() {
  const command = letterTestCommand(); const store = new AccountOfflineStore(context.accountId);
  const transport: LetterTransport = { read: vi.fn(async () => ({ context, letter: letterTestSnapshot(command) })), apply: vi.fn(async () => ({ receipt: letterTestReceipt(command) })), reveal: vi.fn() };
  let online = true; const client = new LetterClient(context, store, transport, () => online);
  return { command, store, client, transport, offline: () => { online = false; } };
}
it("preserves account-bound drafts and cached authorized reads across client reload", async () => {
  const { command, store, client, transport, offline } = setup();
  await client.saveDraft(command.letterId, { text: command.payload.content }, null); await client.apply(command);
  offline(); expect((await client.read(command.letterId))?.content).toBe(command.payload.content);
  const reloaded = new LetterClient(context, new AccountOfflineStore(context.accountId), transport, () => false);
  expect((await reloaded.read(command.letterId))?.content).toBe(command.payload.content);
  expect((await store.getDraft(`letter:${command.letterId}`))?.payload).toEqual({ text: command.payload.content });
  expect(await new LetterClient({ ...context, accountId: letterTestPartner }, new AccountOfflineStore(letterTestPartner), transport, () => false).cached(command.letterId)).toBeNull();
});
it("never queues offline sends/opens or infers a reveal from time", async () => {
  const { command, client, store, offline } = setup(); offline();
  await client.saveDraft(command.letterId, { text: "Còn ở đây" }, null);
  await expect(client.apply(command)).rejects.toThrow("Connect before");
  await expect(client.reveal({ kind: "join", letterId: command.letterId, sessionId: null })).rejects.toThrow("online");
  expect(await store.listOperations()).toEqual([]); expect(await store.getDraft(`letter:${command.letterId}`)).toBeDefined();
});
it("does not cache invalid partner content; blocked auth stops offline access", async () => {
  const { command, client, transport } = setup();
  vi.mocked(transport.read).mockResolvedValue({ context, letter: { ...letterTestSnapshot(command), senderId: letterTestPartner, recipientId: context.accountId, state: "sealed", canOpen: true } });
  expect(await client.read(command.letterId)).toBeNull(); expect(await client.cached(command.letterId)).toBeNull();
  vi.mocked(transport.read).mockResolvedValue({ blocked: true }); expect(await client.read(command.letterId)).toBeNull();
  await expect(client.cached(command.letterId)).rejects.toThrow("stopped");
});
it("logout rejects late replies and cannot repopulate cached letters", async () => {
  const { command, client, transport } = setup();
  let release!: (value: Awaited<ReturnType<LetterTransport["read"]>>) => void;
  vi.mocked(transport.read).mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const reading = client.read(command.letterId); await vi.waitFor(() => expect(release).toBeDefined());
  await clearAccountOfflineData(context.accountId); release({ context, letter: letterTestSnapshot(command) });
  await expect(reading).rejects.toThrow();
  expect(await new AccountOfflineStore(context.accountId).listRecent()).toEqual([]);
});
