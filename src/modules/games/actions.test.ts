import { beforeEach,expect,it,vi } from "vitest";
const m = vi.hoisted(() => ({user:vi.fn(),house:vi.fn(),client:vi.fn(),rpc:vi.fn(),list:vi.fn()}));
vi.mock("server-only",() => ({}));
vi.mock("@/modules/auth/server",() => ({requireVerifiedUser:m.user}));
vi.mock("@/modules/houses/server",() => ({getMyHouse:m.house}));
vi.mock("@/lib/supabase/server",() => ({createSupabaseServerClient:m.client}));
import { applyGameCommandAction,listGameSessionsAction,readGameSessionAction } from "./actions";
import { createGame,gameActors,gameHouse,initialGame } from "./test-fixtures";
const context = {accountId:gameActors[0],houseId:gameHouse};
const c = createGame(); const snapshot = initialGame(c);
beforeEach(() => {
  m.user.mockResolvedValue({id:context.accountId});
  m.house.mockResolvedValue({id:context.houseId,members:gameActors.map(user_id => ({user_id}))});
  const chain = {select:() => chain,eq:() => chain,order:() => chain,limit:m.list};
  m.client.mockResolvedValue({rpc:m.rpc,from:() => chain}); m.list.mockResolvedValue({data:[{id:c.sessionId}],error:null});
  m.rpc.mockImplementation(async name => ({data:name === "get_game_session" ? snapshot : {operationId:c.operationId,actorId:context.accountId,houseId:context.houseId,request:c,outcome:"applied",snapshot},error:null}));
});
it("derives auth and House; validates exact RPC receipt",async () => {
  expect((await applyGameCommandAction(c,context)).receipt?.snapshot).toEqual(snapshot);
  expect(m.rpc).toHaveBeenCalledWith("apply_game_command",{p_house_id:context.houseId,p_command:c});
  expect((await readGameSessionAction(c.sessionId,context)).snapshot).toEqual(snapshot);
  expect((await listGameSessionsAction(context)).sessions).toEqual([snapshot]);
});
it.each([null,{...context,accountId:crypto.randomUUID()},{...context,houseId:crypto.randomUUID()}])("blocks stale account/House %j",async stale => {
  expect((await applyGameCommandAction(c,stale)).blocked).toBe(true);
  expect((await readGameSessionAction(c.sessionId,stale)).blocked).toBe(true);
  expect((await listGameSessionsAction(stale)).blocked).toBe(true);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("does not start games before pairing",async () => {
  m.house.mockResolvedValue({id:context.houseId,members:[{user_id:context.accountId}]});
  expect((await applyGameCommandAction(c,context)).blocked).toBe(true);expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects invalid input and server replies without leaking private error details",async () => {
  expect((await applyGameCommandAction({...c,actorId:gameActors[1]},context)).receipt).toBeUndefined();expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({data:{...snapshot,houseId:crypto.randomUUID()},error:null});
  expect((await readGameSessionAction(c.sessionId,context)).snapshot).toBeUndefined();
  m.user.mockRejectedValue(new Error("private access token"));
  expect(JSON.stringify(await applyGameCommandAction(c,context))).not.toContain("token");
});
it("blocks premature answer in a guesser's projection",async () => {
  const draw = createGame("draw-guess"); const privateSnapshot = initialGame(draw);
  m.user.mockResolvedValue({id:gameActors[1]});m.rpc.mockResolvedValue({data:privateSnapshot,error:null});
  expect((await readGameSessionAction(draw.sessionId,{...context,accountId:gameActors[1]})).snapshot).toBeUndefined();
});
it("validates every listed projection and verifies request identity once",async () => {
  m.list.mockResolvedValue({data:[{id:c.sessionId},{id:crypto.randomUUID()}],error:null});
  expect((await listGameSessionsAction(context)).sessions).toBeUndefined();
  expect(m.user).toHaveBeenCalledOnce(); expect(m.house).toHaveBeenCalledOnce();
  m.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
  expect((await listGameSessionsAction(context)).blocked).toBe(true);
});
