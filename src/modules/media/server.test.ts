import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), house: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.house }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
import { getMediaReference } from "./server";
const actor = crypto.randomUUID(), houseId = crypto.randomUUID(), id = crypto.randomUUID();
const row = { id, house_id: houseId, owner_id: actor, media_type: "photo", bucket_id: "nha-minh-private", storage_path: `${houseId}/${id}`, state: "ready", mime_type: "image/webp", size_bytes: 1024, duration_seconds: null };
const single = vi.fn();
const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: single };
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({id:actor}); mocks.house.mockResolvedValue({id:houseId,members:[{user_id:actor}]});
  mocks.client.mockResolvedValue({from:vi.fn(()=>query)}); single.mockResolvedValue({data:row,error:null});
});
it("authenticates and scopes ready media to the current House",async()=> {
  expect(await getMediaReference(id,houseId)).toMatchObject({id,houseId,path:row.storage_path});
  expect(query.eq.mock.calls).toEqual([["id",id],["house_id",houseId],["state","ready"]]);
});
it.each([null,{id:crypto.randomUUID(),members:[{user_id:actor}]},{id:houseId,members:[{user_id:crypto.randomUUID()}]}])("does not query when House authorization fails (%j)",async(house)=>{
  mocks.house.mockResolvedValue(house); expect(await getMediaReference(id,houseId)).toBeNull(); expect(mocks.client).not.toHaveBeenCalled();
});
it("requires verified auth and rejects cross-House or unsafe decoded rows",async()=> {
  mocks.user.mockRejectedValue(new Error("Signed out")); await expect(getMediaReference(id,houseId)).rejects.toThrow("Signed out"); expect(mocks.client).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({id:actor});
  for(const data of [{...row,house_id:crypto.randomUUID()},{...row,state:"pending"},{...row,bucket_id:"public"}]) {
    single.mockResolvedValue({data,error:null}); expect(await getMediaReference(id,houseId)).toBeNull();
  }
});
