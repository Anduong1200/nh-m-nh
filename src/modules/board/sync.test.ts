import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline/store";
import { BoardSyncSession, type BoardSyncTransport } from "./sync";
import { type BoardContext, type BoardItem, type BoardMutation, type BoardReceipt } from "./model";
const accounts=new Set<string>();
afterEach(async()=>{ for(const id of accounts) await clearAccountOfflineData(id); accounts.clear(); vi.restoreAllMocks(); });
function setup() {
  const context:BoardContext={accountId:crypto.randomUUID(),houseId:crypto.randomUUID()}; accounts.add(context.accountId);
  const store=new AccountOfflineStore(context.accountId), items=new Map<string,BoardItem>(), receipts=new Map<string,BoardReceipt>();
  let lose=false;
  const transport:BoardSyncTransport={
    snapshot:vi.fn(async()=>({context,items:[...items.values()]})),
    apply:vi.fn(async(op:BoardMutation)=> {
      let receipt=receipts.get(op.operationId);
      if(!receipt) {
        const previous=items.get(op.id), conflict=op.mutation!=="append" && previous?.version!==op.expectedVersion;
        const item=conflict ? previous! : {id:op.id,houseId:context.houseId,createdBy:previous?.createdBy??context.accountId,type:previous?.type??op.data.type,
          payload:op.data.payload??previous?.payload,mediaId:op.data.mediaId??previous?.mediaId??null,x:op.data.x??previous?.x??0,y:op.data.y??previous?.y??0,rotation:op.data.rotation??previous?.rotation??0,zIndex:op.data.zIndex??previous?.zIndex??0,
          version:(previous?.version??0)+1,createdAt:previous?.createdAt??"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z",deletedAt:null} as BoardItem;
        receipt={operationId:op.operationId,actorId:context.accountId,houseId:context.houseId,outcome:conflict?"conflict":"applied",item};
        receipts.set(op.operationId,receipt); if(!conflict) items.set(op.id,item);
      }
      if(lose){lose=false;return {error:"Lost response"};} return {receipt};
    }),
  };
  const enqueue=(id=crypto.randomUUID())=>store.enqueue({houseId:context.houseId,schemaVersion:2,entityId:id,entity:"note",mutation:"append",payload:{type:"note",payload:{text:"Nháp"}}});
  const session=()=>new BoardSyncSession(context,store,transport);
  return {context,store,items,receipts,transport,enqueue,session,lose:()=>{lose=true;}};
}
describe("durable Board sync",()=> {
  it.each(["link","photo","voice"] as const)("holds the exact %s operation after lost response and preserves media references",async type=>{
    const s=setup(),mediaId=type==="link"?null:crypto.randomUUID();
    const op=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:crypto.randomUUID(),entity:"board",mutation:"append",payload:{type,mediaId,payload:type==="link"?{url:"https://example.com",title:"Link"}:{caption:"Riêng tư"}}});
    s.lose();expect((await s.session().drain()).acknowledged).toEqual([]);
    expect((await s.store.listOperations())[0]?.operationId).toBe(op.operationId);
    expect((await s.session().drain()).acknowledged).toEqual([op.operationId]);expect(s.items.size).toBe(1);
    expect([...s.items.values()][0]?.mediaId).toBe(mediaId);expect((await s.store.listRecent())[0]?.kind).toBe("board");
  });
  it("does not allow a generic board queue to impersonate a note/doodle entity",async()=>{
    const s=setup();await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:crypto.randomUUID(),entity:"board",mutation:"append",payload:{type:"note",payload:{text:"Wrong queue"}}});
    expect((await s.session().drain()).acknowledged).toEqual([]);expect(s.transport.apply).not.toHaveBeenCalled();
  });
  it("rejects an update receipt changing a media object's persisted type",async()=>{
    const s=setup(),mediaId=crypto.randomUUID(),id=crypto.randomUUID();
    await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:id,entity:"board",mutation:"append",payload:{type:"photo",mediaId,payload:{caption:"Photo"}}});await s.session().drain();
    const op=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:id,entity:"board",mutation:"update",baseVersion:1,payload:{boardType:"photo",mediaId,payload:{caption:"Updated"}}});
    const real=s.transport.apply;s.transport.apply=async(...args)=>{const result=await real(...args);return {receipt:{...result.receipt!,item:{...result.receipt!.item,type:"voice"}}};};
    expect((await s.session().drain()).acknowledged).toEqual([]);expect((await s.store.listOperations())[0]?.operationId).toBe(op.operationId);
  });
  it("freezes its original account/House binding across external context mutations",async()=> {
    const s=setup(), operation=await s.enqueue();
    const session=s.session(), original={...s.context};
    s.transport.snapshot=vi.fn(async()=>({context:original,items:[]}));
    s.context.houseId=crypto.randomUUID();
    await session.drain();
    expect(s.transport.snapshot).toHaveBeenCalledWith(original);
    expect(s.transport.apply).toHaveBeenCalledWith(expect.objectContaining({operationId:operation.operationId}),original);
    // The injected reply is now bound to the changed House and must not acknowledge.
    expect((await s.store.listOperations())[0]?.operationId).toBe(operation.operationId);
  });
  it("archives all proposals when a replacement conflicts again and the user chooses remote",async()=> {
    const s=setup(), create=await s.enqueue(); await s.session().drain();
    s.items.set(create.entityId,{...s.items.get(create.entityId)!,version:2,payload:{text:"Partner"}});
    const local=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:create.entityId,entity:"note",mutation:"update",baseVersion:1,payload:{payload:{text:"Local"}}});
    await s.session().drain();
    const replacement=await s.store.queueConflictReplacement(local.operationId,{payload:{text:"First choice"}},2);
    s.items.set(create.entityId,{...s.items.get(create.entityId)!,version:3,payload:{text:"Partner again"}});
    expect((await s.session().drain()).conflicts).toEqual([replacement.operationId]);
    await s.store.keepRemoteConflict(replacement.operationId);
    expect(await s.store.listOperations()).toEqual([]);
    expect((await s.store.listDrafts()).map((d)=>d.payload)).toEqual(expect.arrayContaining([{payload:{text:"Local"}},{payload:{text:"First choice"}}]));
    expect(s.items.get(create.entityId)?.payload).toEqual({text:"Partner again"});
  });
  it("survives a committed append with no response and retries the same operation after reopen",async()=> {
    const s=setup(), op=await s.enqueue(); s.lose();
    expect((await s.session().drain()).acknowledged).toEqual([]); expect(s.items.size).toBe(1);
    s.store.close(); const reopened=new AccountOfflineStore(s.context.accountId);
    expect((await new BoardSyncSession(s.context,reopened,s.transport).drain()).acknowledged).toEqual([op.operationId]);
    expect(s.items.size).toBe(1); expect(await reopened.listOperations()).toEqual([]);
  });
  it("replays a committed update before stale-version conflict and never downgrades the recent cache",async()=> {
    const s=setup(), create=await s.enqueue(); await s.session().drain();
    const update=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:create.entityId,entity:"note",mutation:"update",baseVersion:1,payload:{payload:{text:"Mine"}}});
    s.lose(); await s.session().drain();
    s.items.set(create.entityId,{...s.items.get(create.entityId)!,version:3,payload:{text:"Partner later"}});
    expect((await s.session().drain()).acknowledged).toEqual([update.operationId]);
    expect((await s.store.listRecent())[0]?.serverVersion).toBe(3); expect(s.items.get(create.entityId)?.payload).toEqual({text:"Partner later"});
  });
  it("keeps both conflict versions and original operation until an explicit replacement is confirmed",async()=> {
    const s=setup(), create=await s.enqueue(); await s.session().drain();
    s.items.set(create.entityId,{...s.items.get(create.entityId)!,version:2,payload:{text:"Partner"}});
    const local=await s.store.enqueue({houseId:s.context.houseId,schemaVersion:2,entityId:create.entityId,entity:"note",mutation:"update",baseVersion:1,payload:{payload:{text:"Local"}}});
    expect((await s.session().drain()).conflicts).toEqual([local.operationId]);
    expect((await s.store.listOperations())[0]?.conflict?.local).toEqual({payload:{text:"Local"}});
    const resolution=await s.store.queueConflictReplacement(local.operationId,{payload:{text:"Chosen"}},2);
    s.lose(); await s.session().drain(); expect((await s.store.listOperations()).length).toBe(2);
    expect((await s.session().drain()).acknowledged).toEqual([resolution.operationId]);
    expect(await s.store.listOperations()).toEqual([]); expect(s.items.get(create.entityId)?.payload).toEqual({text:"Chosen"});
  });
  it("archives the local proposal on an explicit keep-remote choice",async()=> {
    const s=setup(), op=await s.enqueue(); await s.store.preserveConflict(op.operationId,{text:"Remote"},2);
    const draft=await s.store.keepRemoteConflict(op.operationId);
    expect(draft.payload).toEqual(op.payload); expect(await s.store.listOperations()).toEqual([]);
    expect((await s.store.getDraft(draft.id))?.payload).toEqual(op.payload); expect(s.transport.apply).not.toHaveBeenCalled();
  });
  it("holds legacy, wrong-House and mismatched-account work instead of rebinding it",async()=> {
    const s=setup(); await s.store.enqueue({houseId:s.context.houseId,schemaVersion:1,entityId:crypto.randomUUID(),entity:"note",mutation:"append",payload:{text:"Legacy"}});
    await s.store.enqueue({houseId:crypto.randomUUID(),schemaVersion:2,entityId:crypto.randomUUID(),entity:"note",mutation:"append",payload:{type:"note",payload:{text:"Other House"}}});
    expect((await s.session().drain()).acknowledged).toEqual([]); expect((await s.store.listOperations()).length).toBe(2); expect(s.transport.apply).not.toHaveBeenCalled();
  });
  it("stops before writing when the verified snapshot belongs to another actor",async()=> {
    const s=setup(); await s.enqueue(); vi.mocked(s.transport.snapshot).mockResolvedValue({context:{...s.context,accountId:crypto.randomUUID()},items:[]});
    expect((await s.session().drain()).error).toBeTruthy(); expect(s.transport.apply).not.toHaveBeenCalled(); expect((await s.store.listOperations()).length).toBe(1);
  });
  it("does not acknowledge a receipt for another operation or another committed patch",async()=> {
    const s=setup(), op=await s.enqueue();
    const real=s.transport.apply; s.transport.apply=async(...args)=>{const res=await real(...args); return {receipt:{...res.receipt!,operationId:crypto.randomUUID()}};};
    await s.session().drain(); expect((await s.store.listOperations())[0]?.operationId).toBe(op.operationId);
  });
  it("ignores a response that arrives after stop and preserves the uncertain operation",async()=> {
    const s=setup(); await s.enqueue(); let release!:()=>void;
    const real=s.transport.apply; let started!:()=>void; const pending=new Promise<void>(r=>{started=r;});
    s.transport.apply=async(...args)=>{started();await new Promise<void>(r=>{release=r;});return real(...args);};
    const session=s.session(), drain=session.drain(); await pending; session.stop(); release();
    expect((await drain).acknowledged).toEqual([]); expect((await s.store.listOperations()).length).toBe(1); expect(await s.store.listRecent()).toEqual([]);
  });
  it("retains queue work if persisting the authoritative cache fails",async()=> {
    const s=setup(); await s.enqueue(); vi.spyOn(s.store,"cacheRecent").mockRejectedValue(new Error("QuotaExceededError"));
    expect((await s.session().drain()).error).toBeTruthy(); expect((await s.store.listOperations()).length).toBe(1);
  });
  it("shares an in-flight drain and has no busy polling when the queue is empty",async()=> {
    const s=setup(), session=s.session(); const a=session.drain(), b=session.drain(); expect(a).toBe(b); await a;
    expect(s.transport.snapshot).not.toHaveBeenCalled(); expect(s.transport.apply).not.toHaveBeenCalled();
  });
  it("revokes old handles across separately loaded tab modules using a persisted epoch",async()=> {
    const s=setup(); await s.enqueue(); await s.store.assertCurrent();
    vi.resetModules(); const otherTab=await import("@/lib/offline/store"); await otherTab.clearAccountOfflineData(s.context.accountId);
    await expect(s.store.assertCurrent()).rejects.toThrow("cleared"); await expect(s.store.cacheRecent({id:crypto.randomUUID(),houseId:s.context.houseId,schemaVersion:2,kind:"note",payload:"Late",serverVersion:1})).rejects.toThrow("cleared");
    const fresh=new AccountOfflineStore(s.context.accountId); expect(await fresh.listRecent()).toEqual([]); expect(await fresh.listOperations()).toEqual([]);
  });
});
