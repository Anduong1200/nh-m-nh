import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),house:vi.fn(),client:vi.fn(),rpc:vi.fn(),config:vi.fn()}));
vi.mock("@/modules/auth/server",()=>({requireVerifiedUser:m.user}));vi.mock("@/modules/houses/server",()=>({getMyHouse:m.house}));vi.mock("@/lib/supabase/server",()=>({createSupabaseServerClient:m.client}));vi.mock("./push-server",()=>({getBackgroundNotificationConfiguration:m.config}));
import { enrollPushAction, disablePushAction } from "./push-actions";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",houseId="33333333-3333-4333-8333-333333333333",context={accountId:a,houseId};
const input={endpoint:"https://fcm.googleapis.com/send/test",keys:{p256dh:Buffer.from([4,...Array<number>(64).fill(2)]).toString("base64url"),auth:Buffer.alloc(16,3).toString("base64url")}};
beforeEach(()=>{m.user.mockResolvedValue({id:a});m.house.mockResolvedValue({id:houseId,members:[{user_id:a},{user_id:b}]});m.config.mockReturnValue({enabled:true});m.client.mockResolvedValue({rpc:m.rpc});m.rpc.mockResolvedValue({data:crypto.randomUUID(),error:null});});
it("rejects forged House/actor and unpaired enrollment before privileged work",async()=>{
  for(const bad of [null,{...context,accountId:b},{...context,houseId:crypto.randomUUID()}])expect((await enrollPushAction(input,bad)).blocked).toBe(true);
  m.house.mockResolvedValue({id:houseId,members:[{user_id:a}]});expect((await enrollPushAction(input,context)).blocked).toBe(true);expect(m.client).not.toHaveBeenCalled();
});
it("validates subscription and binds RPC parameters to the verified context",async()=>{
  expect((await enrollPushAction({...input,endpoint:"https://localhost/private"},context)).deviceToken).toBeUndefined();expect(m.rpc).not.toHaveBeenCalled();
  expect((await enrollPushAction(input,context)).deviceToken).toBeDefined();expect(m.rpc).toHaveBeenCalledWith("enroll_push_subscription",{p_house_id:houseId,p_endpoint:input.endpoint,p_p256dh:input.keys.p256dh,p_auth:input.keys.auth});
});
it("does not enroll without server config or disable a stale actor's device",async()=>{
  m.config.mockReturnValue({enabled:false});expect((await enrollPushAction(input,context)).deviceToken).toBeUndefined();
  await disablePushAction(crypto.randomUUID(),{...context,accountId:b});expect(m.rpc).not.toHaveBeenCalled();
});
