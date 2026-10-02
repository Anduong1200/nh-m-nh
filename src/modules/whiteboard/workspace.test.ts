import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline/store";
import { emptyWhiteboardScene, whiteboardLocalId, type WhiteboardSnapshot, type WhiteboardOperation, type WhiteboardReceipt } from "./model";
import { WhiteboardSyncSession, type WhiteboardTransport } from "./sync";
import { WhiteboardWorkspace } from "./workspace";
import { textScene } from "./test-fixtures";
const accounts: string[] = [];
afterEach(async () => { for (const id of accounts.splice(0)) await clearAccountOfflineData(id); });
function setup() {
  const context = { accountId: crypto.randomUUID(), houseId: crypto.randomUUID() };
  accounts.push(context.accountId);
  const store = new AccountOfflineStore(context.accountId);
  let remote: WhiteboardSnapshot = { houseId: context.houseId, version: 0, scene: emptyWhiteboardScene(), updatedBy: null, updatedAt: null };
  const ledger = new Map<string,WhiteboardReceipt>();
  let online = true, lose = false, forged = false, calls = 0;
  const transport: WhiteboardTransport = {
    snapshot: async () => ({ context, snapshot: structuredClone(remote) }),
    save: async (op) => {
      calls++;
      let receipt = ledger.get(op.operationId);
      if (!receipt) {
        if (op.expectedVersion === remote.version) remote = { ...remote, version: remote.version + 1, scene: structuredClone(op.scene), updatedBy: context.accountId, updatedAt: new Date().toISOString() };
        receipt = { operationId: op.operationId, actorId: context.accountId, houseId: context.houseId, outcome: remote.version === op.expectedVersion + 1 && remote.updatedBy === context.accountId ? "applied" : "conflict", snapshot: structuredClone(remote) };
        ledger.set(op.operationId,receipt);
      }
      if (lose) { lose = false; throw new Error("Lost reply"); }
      return { receipt: forged ? { ...receipt,actorId:crypto.randomUUID() } : structuredClone(receipt) };
    }
  };
  const make = () => new WhiteboardWorkspace(context,new AccountOfflineStore(context.accountId),transport,()=>online);
  return { context,store,transport,make, remote:()=>remote, calls:()=>calls, offline:()=>{online=false;},online:()=>{online=true;},lose:()=>{lose=true;},forge:()=>{forged=true;},
    partner: (scene = textScene("Bản của Cú")) => { remote = { ...remote, version: remote.version + 1, scene, updatedBy: crypto.randomUUID(), updatedAt: new Date().toISOString() }; } };
}
describe("Whiteboard durable workspace and retry boundaries", () => {
  it("freezes context and rejects a store scoped to another account before reading private content", async () => {
    const s=setup(),binding={...s.context};
    const w=new WhiteboardWorkspace(binding,s.store,s.transport);
    binding.houseId=crypto.randomUUID();await w.open();w.edit(textScene());await w.save();
    expect(s.remote().houseId).toBe(s.context.houseId);
    expect(()=>new WhiteboardSyncSession({...s.context,accountId:crypto.randomUUID()},s.store,s.transport)).toThrow();
    expect(()=>new WhiteboardWorkspace({...s.context,accountId:crypto.randomUUID()},s.store,s.transport)).toThrow();
    await w.close();
  });
  it("two tabs replay one immutable operation and create only one server version", async () => {
    const s=setup();
    await s.store.enqueue({houseId:s.context.houseId,schemaVersion:1,entity:"whiteboard",entityId:whiteboardLocalId(s.context.houseId),mutation:"append",payload:textScene()});
    const a=new WhiteboardSyncSession(s.context,s.store,s.transport),other=new AccountOfflineStore(s.context.accountId),b=new WhiteboardSyncSession(s.context,other,s.transport);
    const results=await Promise.all([a.drain(),b.drain()]);
    expect(results.every(r=>!r.error)).toBe(true);
    expect(s.remote().version).toBe(1);expect(s.calls()).toBe(2);expect(await s.store.listOperations()).toEqual([]);
    a.stop();b.stop();other.close();
  });
  it("IDB quota errors do not enqueue or claim a local draft was saved", async () => {
    const s=setup(),w=new WhiteboardWorkspace(s.context,s.store,s.transport);await w.open();
    const original=s.store.saveDraft.bind(s.store);
    s.store.saveDraft=async()=>{throw new Error("QuotaExceededError");};
    w.edit(textScene());await expect(w.flush()).rejects.toThrow();await w.save();
    expect(w.getState().localSaved).toBe(false);expect(s.calls()).toBe(0);expect(await s.store.listOperations()).toEqual([]);
    s.store.saveDraft=original;await w.flush();expect(w.getState().localSaved).toBe(true);await w.close();
  });
  it("restores drafts offline, reconnects, and retries a lost commit with the same ID once", async () => {
    const s=setup(); let w=s.make(); await w.open(); s.offline();
    expect(w.edit(textScene())).toBe(true); await w.save(); const op=(await s.store.listOperations())[0]!;
    expect(s.remote().version).toBe(0); await w.close();
    w=s.make(); await w.open(); expect(w.getState().scene).toEqual(textScene());
    s.online(); s.lose(); await w.refresh(); expect(s.remote().version).toBe(1);
    expect((await s.store.listOperations())[0]!.operationId).toBe(op.operationId);
    await w.refresh(); expect(s.remote().version).toBe(1); expect(await s.store.listOperations()).toEqual([]);
    expect(w.getState()).toMatchObject({baseVersion:1,dirty:false,localSaved:true}); await w.close();
  });
  it("keeps subsequent local edits after a queued snapshot is acknowledged", async () => {
    const s=setup(),w=s.make(); await w.open(); s.offline();
    w.edit(textScene("Bản gửi")); await w.save();
    w.edit(textScene("Đang viết tiếp")); await w.flush(); s.online(); await w.refresh();
    expect(w.getState()).toMatchObject({baseVersion:1,dirty:true,scene:textScene("Đang viết tiếp")});
    expect(s.remote().scene).toEqual(textScene("Bản gửi")); await w.save(); expect(s.remote().scene).toEqual(textScene("Đang viết tiếp")); await w.close();
  });
  it("reruns a reconnect received while an offline refresh is finishing", async () => {
    const s=setup(); let online=true;
    const w=new WhiteboardWorkspace(s.context,s.store,s.transport,()=>online);
    await w.open(); online=false; w.edit(textScene()); await w.flush();
    const list=s.store.listOperations.bind(s.store);
    let calls=0,release!:()=>void,started!:()=>void;
    const gate=new Promise<void>(r=>{release=r;}),begin=new Promise<void>(r=>{started=r;});
    s.store.listOperations=async()=>{
      const operations=await list();
      // save's two reads, reconcile's initial read, then its final offline read.
      if (++calls===4) { started(); await gate; }
      return operations;
    };
    const save=w.save();await begin;
    online=true;const reconnect=w.refresh();release();
    await Promise.all([save,reconnect]);
    expect(s.remote().version).toBe(1);expect(await list()).toEqual([]);
    expect(w.getState()).toMatchObject({baseVersion:1,dirty:false});await w.close();
  });
  it("retains both versions, replacement conflicts again with unseen changes, and keep-remote archives latest local work", async () => {
    const s=setup(),w=s.make(); await w.open(); w.edit(textScene("Bản đầu")); await w.save();
    s.offline(); w.edit(textScene("Bản Thỏ")); await w.save(); s.partner(); s.online(); await w.refresh();
    const first=w.getState().operations[0]!; expect(first.state).toBe("conflict");
    expect(w.getState().scene).toEqual(textScene("Bản Thỏ"));
    s.partner(textScene("Cú đổi tiếp")); await w.replaceConflict(first.operationId);
    const second=w.getState().operations.find(o=>o.state==="conflict"&&!o.resolutionOperationId)!;
    expect(second.conflict?.remoteVersion).toBe(3);
    w.edit(textScene("Thỏ đang viết tiếp")); await w.flush(); await w.keepRemote(second.operationId);
    expect(w.getState().scene).toEqual(textScene("Cú đổi tiếp"));
    expect(await s.store.listOperations()).toEqual([]);
    expect((await s.store.listDrafts()).some(d=>JSON.stringify(d.payload).includes("Thỏ đang viết tiếp"))).toBe(true); await w.close();
  });
  it("holds a changed local draft from another tab instead of overwriting it", async () => {
    const s=setup(),a=s.make(),b=s.make(); await a.open(); await b.open();
    a.edit(textScene("Tab A")); await a.flush(); b.edit(textScene("Tab B")); await expect(b.flush()).rejects.toThrow();
    expect(b.getState().scene).toEqual(textScene("Tab B")); await b.save();
    expect(await s.store.listOperations()).toEqual([]);
    expect((await s.store.getDraft(whiteboardLocalId(s.context.houseId)))!.payload).toMatchObject({scene:textScene("Tab A")});
    expect(await b.exportLocal()).toMatchObject({scene:textScene("Tab B")}); await a.close(); await b.close();
  });
  it("does not acknowledge forged receipts or cross-account auth changes", async () => {
    const s=setup(),w=s.make(); await w.open(); s.forge(); w.edit(textScene()); await w.save();
    expect((await s.store.listOperations()).length).toBe(1);
    const blocked: WhiteboardTransport = { ...s.transport, snapshot: async()=>({context:{...s.context,accountId:crypto.randomUUID()},snapshot:s.remote()}) };
    const session=new WhiteboardSyncSession(s.context,s.store,blocked);
    await session.drain(); expect(s.calls()).toBe(1);
    expect((await s.store.listOperations()).length).toBe(1); session.stop(); await w.close();
  });
  it("ignores other entities and Houses; account cleanup invalidates old handles", async () => {
    const s=setup(); await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entity:"note",entityId:crypto.randomUUID(),mutation:"append",payload:{type:"note",payload:{text:"Board"}}});
    await s.store.enqueue({houseId:crypto.randomUUID(),schemaVersion:1,entity:"whiteboard",entityId:crypto.randomUUID(),mutation:"append",payload:emptyWhiteboardScene()});
    const sync=new WhiteboardSyncSession(s.context,s.store,s.transport); expect((await sync.drain()).acknowledged).toEqual([]); expect(s.calls()).toBe(0);
    await clearAccountOfflineData(s.context.accountId); await expect(s.store.cacheRecent({id:whiteboardLocalId(s.context.houseId),houseId:s.context.houseId,schemaVersion:1,kind:"whiteboard",serverVersion:0,payload:emptyWhiteboardScene()})).rejects.toThrow();
    sync.stop();
  });
  it("does not acknowledge a late in-flight receipt after stop", async () => {
    const s=setup(); const op=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:1,entity:"whiteboard",entityId:whiteboardLocalId(s.context.houseId),mutation:"append",payload:textScene()});
    let release!:()=>void; let started!:()=>void;
    const pending=new Promise<void>(r=>{release=r;}); const begin=new Promise<void>(r=>{started=r;});
    const transport:WhiteboardTransport={...s.transport,save:async(o:WhiteboardOperation,c)=>{started();await pending;return s.transport.save(o,c);}};
    const sync=new WhiteboardSyncSession(s.context,s.store,transport); const run=sync.drain(); await begin; sync.stop();release();await run;
    expect((await s.store.listOperations())[0]!.operationId).toBe(op.operationId);
  });
});
