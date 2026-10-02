import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),house:vi.fn(),client:vi.fn(),rpc:vi.fn(),single:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/modules/auth/server",()=>({requireVerifiedUser:m.user}));
vi.mock("@/modules/houses/server",()=>({getMyHouse:m.house}));
vi.mock("@/lib/supabase/server",()=>({createSupabaseServerClient:m.client}));
import { getWhiteboardSnapshotAction, saveWhiteboardSnapshotAction } from "./actions";
import { textScene } from "./test-fixtures";
const context={accountId:"11111111-1111-4111-8111-111111111111",houseId:"33333333-3333-4333-8333-333333333333"};
const op={operationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",expectedVersion:0,scene:textScene()};
const snapshot={houseId:context.houseId,version:1,scene:op.scene,updatedBy:context.accountId,updatedAt:new Date().toISOString()};
beforeEach(()=>{
 m.user.mockResolvedValue({id:context.accountId});m.house.mockResolvedValue({id:context.houseId});
 m.single.mockResolvedValue({data:null,error:null});
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:m.single};
 m.client.mockResolvedValue({rpc:m.rpc,from:()=>chain});
 m.rpc.mockResolvedValue({data:{...context,actorId:context.accountId,operationId:op.operationId,outcome:"applied",snapshot},error:null});
});
it("binds validated operation to authenticated account and House",async()=>{
 // RPC envelopes contain only the specified fields.
 m.rpc.mockResolvedValue({data:{houseId:context.houseId,actorId:context.accountId,operationId:op.operationId,outcome:"applied",snapshot},error:null});
 expect((await saveWhiteboardSnapshotAction(op,context)).receipt?.snapshot).toEqual(snapshot);
 expect(m.rpc).toHaveBeenCalledWith("save_whiteboard_snapshot",{p_house_id:context.houseId,p_operation_id:op.operationId,p_expected_version:0,p_scene:op.scene});
});
it.each([undefined,{...context,accountId:op.operationId},{...context,houseId:op.operationId}])("blocks stale/missing context for read and save",async(stale)=>{
 expect((await saveWhiteboardSnapshotAction(op,stale)).blocked).toBe(true);
 expect((await getWhiteboardSnapshotAction(stale)).blocked).toBe(true);expect(m.rpc).not.toHaveBeenCalled();
});
it("reads virtual version zero without creating a row",async()=>{
 expect((await getWhiteboardSnapshotAction(context)).snapshot).toMatchObject({houseId:context.houseId,version:0,updatedBy:null});
 expect(m.rpc).not.toHaveBeenCalled();
});
it("fails closed on malformed database rows and mismatched receipts",async()=>{
 m.single.mockResolvedValue({data:{house_id:context.houseId,version:"1",scene:op.scene,updated_by:context.accountId,updated_at:snapshot.updatedAt},error:null});
 expect((await getWhiteboardSnapshotAction(context)).snapshot).toBeUndefined();
 expect((await saveWhiteboardSnapshotAction(op,context)).receipt).toBeUndefined();
});
it("validates content before invoking RPC and hides private exception details",async()=>{
 expect((await saveWhiteboardSnapshotAction({...op,scene:{...op.scene,files:{private:"content"}}},context)).error).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
 m.user.mockRejectedValue(new Error("private token"));expect(JSON.stringify(await getWhiteboardSnapshotAction(context))).not.toContain("token");
});
