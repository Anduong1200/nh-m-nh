import "fake-indexeddb/auto";
import { afterEach,expect,it,vi } from "vitest";
import { AccountOfflineStore,clearAccountOfflineData,type JsonValue } from "@/lib/offline/store";
import { gameActors,gameHouse,createGame,initialGame } from "./test-fixtures";
import { GAME_SCHEMA_VERSION,gameLocalId,type GameReceipt } from "./model";
import { GameSyncSession,type GameTransport } from "./sync";
const context = {accountId:gameActors[0],houseId:gameHouse};
afterEach(async () => {await clearAccountOfflineData(context.accountId);vi.restoreAllMocks();});
function setup() {
  const store = new AccountOfflineStore(context.accountId);const c = createGame();const snapshot = initialGame(c);
  const receipt: GameReceipt = {operationId:c.operationId,actorId:context.accountId,houseId:context.houseId,request:c,outcome:"applied",snapshot};
  const transport: GameTransport = {read:vi.fn(async () => ({context,snapshot})),apply:vi.fn(async command => ({receipt:{...receipt,operationId:command.operationId,request:command}}))};
  const sync = new GameSyncSession(context,store,transport);
  const {operationId:_,...proposal} = c; void _;
  return {store,c,snapshot,receipt,transport,sync,proposal};
}
it("offline queue survives close/reopen and lost acknowledgement retries identical operation",async () => {
  const s = setup();const row = await s.sync.queue(s.proposal);s.sync.stop();s.store.close();
  const reopened = new AccountOfflineStore(context.accountId);const sync = new GameSyncSession(context,reopened,s.transport);
  vi.mocked(s.transport.apply).mockRejectedValueOnce(new Error("lost response"));
  expect((await sync.drain()).acknowledged).toEqual([]);
  expect((await reopened.listOperations())[0]?.operationId).toBe(row.operationId);
  expect((await sync.drain()).acknowledged).toEqual([row.operationId]);
  expect(vi.mocked(s.transport.apply).mock.calls[0]?.[0]).toEqual(vi.mocked(s.transport.apply).mock.calls[1]?.[0]);
  expect((await reopened.listOperations()).length).toBe(0);
});
it("persists draft CAS and never syncs while offline",async () => {
  const s = setup();let online = false;const sync = new GameSyncSession(context,s.store,s.transport,() => online);
  expect((await sync.saveDraft(s.c.sessionId,{text:"Một câu"},null)).status).toBe("saved");
  expect((await sync.saveDraft(s.c.sessionId,{text:"Ghi đè"},null)).status).toBe("conflict");
  await sync.queue(s.proposal);expect((await sync.drain()).acknowledged).toEqual([]);expect(s.transport.apply).not.toHaveBeenCalled();
  online = true;expect((await sync.drain()).acknowledged.length).toBe(1);
  expect((await s.store.getDraft(gameLocalId(s.c.sessionId)))?.payload).toEqual({text:"Một câu"});
});
it("rejects forged/mismatched receipts and retains work",async () => {
  const s = setup();await s.sync.queue(s.proposal);
  vi.mocked(s.transport.apply).mockResolvedValue({receipt:s.receipt});
  expect((await s.sync.drain()).acknowledged).toEqual([]);expect((await s.store.listOperations()).length).toBe(1);
});
it("preserves both conflict versions and keep-remote archives the local proposal",async () => {
  const s = setup();const row = await s.sync.queue(s.proposal);
  vi.mocked(s.transport.apply).mockImplementation(async command => ({receipt:{...s.receipt,operationId:command.operationId,request:command,outcome:"conflict"}}));
  expect((await s.sync.drain()).conflicts).toEqual([row.operationId]);
  expect((await s.store.listOperations())[0]?.conflict).toMatchObject({local:s.proposal,remote:s.snapshot,remoteVersion:1});
  await expect(s.sync.queue(s.proposal)).rejects.toThrow();
  const archived = await s.sync.keepRemote(row.operationId);expect(archived.payload).toEqual(s.proposal);
  expect((await s.store.listOperations()).length).toBe(0);
});
it("explicit turn resolution uses a new operation while keeping the original until acknowledged",async () => {
  const s = setup();const command = {sessionId:s.c.sessionId,expectedVersion:1,kind:"line" as const,payload:{text:"Thỏ viết."}};
  const row = await s.sync.queue(command);
  await s.store.preserveConflict(row.operationId,s.snapshot as unknown as JsonValue,1);
  const replacement = await s.sync.resolveConflict(row.operationId,command);expect(replacement.operationId).not.toBe(row.operationId);
  const final = {...s.snapshot,version:2,turn:{number:2,userId:gameActors[1],phase:"line" as const},events:[{kind:"line" as const,payload:command.payload,sequence:1,actorId:context.accountId,operationId:replacement.operationId,createdAt:new Date().toISOString()}]};
  vi.mocked(s.transport.apply).mockImplementation(async cmd => ({receipt:{...s.receipt,operationId:cmd.operationId,request:cmd,snapshot:final}}));
  expect((await s.sync.drain()).acknowledged).toEqual([replacement.operationId]);expect(await s.store.listOperations()).toEqual([]);
});
it("a late reply after logout cannot repopulate caches or acknowledge an old account",async () => {
  const s = setup();await s.sync.queue(s.proposal);
  let release!: (value: {receipt:GameReceipt}) => void;
  let started!: () => void;const waiting = new Promise<void>(resolve => {started = resolve;});
  vi.mocked(s.transport.apply).mockImplementation(command => new Promise(resolve => {release = resolve;started();s.receipt.operationId = command.operationId;s.receipt.request = command;}));
  const drain = s.sync.drain();await waiting;await clearAccountOfflineData(context.accountId);release({receipt:s.receipt});
  expect((await drain).acknowledged).toEqual([]);
  const next = new AccountOfflineStore(context.accountId);expect(await next.listRecent()).toEqual([]);expect(await next.listOperations()).toEqual([]);
});
it("stale retry does not roll the cache back and premature answers are not cached for the guesser",async () => {
  const s = setup();await s.sync.read(s.c.sessionId);
  const newer = {...s.snapshot,version:2,turn:{number:2,userId:gameActors[1],phase:"line" as const},events:[{kind:"line" as const,payload:{text:"Thỏ"},sequence:1,actorId:context.accountId,operationId:crypto.randomUUID(),createdAt:new Date().toISOString()}]};
  await s.store.cacheRecent({id:gameLocalId(s.c.sessionId),houseId:gameHouse,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload:newer as unknown as JsonValue,serverVersion:2});
  await s.sync.queue(s.proposal);await s.sync.drain();expect((await s.sync.cached(s.c.sessionId))?.version).toBe(2);
  const draw = initialGame(createGame("draw-guess"));draw.createdBy = gameActors[1];draw.players = [{userId:gameActors[1],seat:0},{userId:gameActors[0],seat:1}];
  vi.mocked(s.transport.read).mockResolvedValue({context,snapshot:draw});expect(await s.sync.read(draw.id)).toBeNull();expect(await s.sync.cached(draw.id)).toBeNull();
});
it("account/House mismatch and malformed queued operations never invoke transport",async () => {
  const s = setup();expect(() => new GameSyncSession({...context,accountId:gameActors[1]},s.store,s.transport)).toThrow();
  await s.store.enqueue({houseId:gameHouse,entity:"game",entityId:gameLocalId(s.c.sessionId),schemaVersion:0,mutation:"update",baseVersion:0,payload:s.proposal as unknown as JsonValue});
  expect((await s.sync.drain()).blocked.length).toBe(1);expect(s.transport.apply).not.toHaveBeenCalled();
});
it("two local tabs atomically queue only one proposal for a session",async () => {
  const s = setup();const second = new GameSyncSession(context,new AccountOfflineStore(context.accountId),s.transport);
  const results = await Promise.allSettled([s.sync.queue(s.proposal),second.queue(s.proposal)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await s.store.listOperations()).toHaveLength(1);
});
