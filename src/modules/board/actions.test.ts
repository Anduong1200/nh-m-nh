import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), user: vi.fn(), house: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.house }));
vi.mock("./server", () => ({ readBoardItems: mocks.read }));
import { appendBoardObjectAction, updateBoardObjectAction, getBoardSnapshotAction } from "./actions";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", operationId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context={houseId:"11111111-1111-4111-8111-111111111111",accountId:"22222222-2222-4222-8222-222222222222"};
const row={id,house_id:context.houseId,created_by:context.accountId,type:"note",payload:{text:"Ghi chú"},media_id:null,x:"0",y:"0",rotation:"0",z_index:0,version:1,created_at:"2026-10-02T00:00:00Z",updated_at:"2026-10-02T00:00:00Z",deleted_at:null};
const input={id,operationId,type:"note",payload:row.payload};
const envelope=(item:unknown=row,outcome="applied")=>({operation_id:operationId,house_id:context.houseId,actor_id:context.accountId,item,outcome});
beforeEach(()=> {
 mocks.user.mockResolvedValue({id:context.accountId});
 mocks.house.mockResolvedValue({id:context.houseId,members:[{user_id:context.accountId}]});
 mocks.client.mockResolvedValue({rpc:mocks.rpc}); mocks.rpc.mockResolvedValue({data:envelope(),error:null});
 mocks.read.mockResolvedValue({items:[]});
});
describe("Board server boundary",()=> {
 it("binds every mutation to verified account and House and returns the exact operation receipt",async()=>{
  const result=await appendBoardObjectAction(input,context);
  expect(result.receipt).toMatchObject({operationId,actorId:context.accountId,houseId:context.houseId,outcome:"applied"});
  expect(mocks.rpc).toHaveBeenCalledWith("apply_board_operation",expect.objectContaining({p_operation_id:operationId,p_house_id:context.houseId,p_expected_version:0}));
 });
 it.each([undefined,{...context,accountId:id},{...context,houseId:id}])("holds a draft with stale or missing context",async(stale)=>{
  expect((await appendBoardObjectAction(input,stale)).blocked).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("fails closed when authentication cannot be verified",async()=>{
  mocks.user.mockRejectedValue(new Error("private auth detail"));
  const result=await appendBoardObjectAction(input,context);
  expect(result.error).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("private"); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([null,{},envelope({...row,id:context.houseId}),envelope({...row,house_id:id}),envelope({...row,payload:{text:"another draft"}}),{...envelope(),operation_id:id},{...envelope(),actor_id:id},envelope({...row,version:2})])("refuses an unconfirmed or mismatched receipt",async(data)=>{
  mocks.rpc.mockResolvedValue({data,error:null});
  const result=await appendBoardObjectAction(input,context); expect(result.item).toBeUndefined(); expect(result.receipt).toBeUndefined();
 });
 it("returns an authoritative conflict snapshot without claiming the local edit saved",async()=>{
  mocks.rpc.mockResolvedValue({data:envelope({...row,version:3,payload:{text:"Partner"}},"conflict"),error:null});
  const result=await updateBoardObjectAction({id,operationId,expectedVersion:1,payload:{text:"Local"}},context);
  expect(result.conflict).toBe(true); expect(result.receipt?.item.version).toBe(3); expect(result.item).toBeUndefined();
 });
 it("keeps update receipts tied to the committed version and patch",async()=>{
  mocks.rpc.mockResolvedValue({data:envelope({...row,version:2,x:100}),error:null});
  expect((await updateBoardObjectAction({id,operationId,expectedVersion:1,x:100},context)).item?.version).toBe(2);
 });
 it("uses an explicit trash operation without combining edits",async()=>{
  mocks.rpc.mockResolvedValue({data:envelope({...row,version:2,deleted_at:"2026-10-02T01:00:00Z"}),error:null});
  expect((await updateBoardObjectAction({id,operationId,expectedVersion:1,deleted:true},context)).item?.deletedAt).toBeTruthy();
  expect(mocks.rpc).toHaveBeenCalledWith("apply_board_operation",expect.objectContaining({p_mutation:"trash",p_data:{}}));
  expect((await updateBoardObjectAction({id,operationId,expectedVersion:1,deleted:true,x:2},context)).error).toBeTruthy();
 });
 it("keeps SQL diagnostics private and does not acknowledge failures",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"private SQL contents"}});
  const result=await appendBoardObjectAction(input,context); expect(result.blocked).toBe(true); expect(JSON.stringify(result)).not.toContain("SQL");
 });
 it("authorizes snapshots against the expected actor and House",async()=>{
  expect((await getBoardSnapshotAction(context)).items).toEqual([]);
  expect((await getBoardSnapshotAction({...context,accountId:id})).blocked).toBe(true);
  expect(mocks.read).toHaveBeenCalledTimes(1);
 });
});
