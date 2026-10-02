import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), house: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: m.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: m.house }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.client }));
import { readIslandStateAction } from "./actions";
import { deriveIslandState } from "./model";
const context = { accountId: "11111111-1111-4111-8111-111111111111", houseId: "22222222-2222-4222-8222-222222222222" };
const state = deriveIslandState(context.houseId, []);
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: context.accountId });
  m.house.mockResolvedValue({ id: context.houseId, members: [{ user_id: context.accountId }] });
  m.client.mockResolvedValue({ rpc: m.rpc }); m.rpc.mockResolvedValue({ data: state, error: null });
});
it("verifies current account and House before returning authoritative state", async () => {
  expect(await readIslandStateAction(context)).toEqual({ context, state });
  expect(m.rpc).toHaveBeenCalledWith("get_island_state", { p_house_id: context.houseId });
});
it.each([null, { ...context, accountId: crypto.randomUUID() }, { ...context, houseId: crypto.randomUUID() }])("blocks stale identity %j without database access", async input => {
  expect((await readIslandStateAction(input)).blocked).toBe(true);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("blocks missing active membership", async () => {
  m.house.mockResolvedValue({ id: context.houseId, members: [] });
  expect((await readIslandStateAction(context)).blocked).toBe(true);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects malformed and cross-House replies", async () => {
  for (const data of [{ ...state, version: 99 }, { ...state, houseId: crypto.randomUUID() }]) {
    m.rpc.mockResolvedValue({ data, error: null });
    expect((await readIslandStateAction(context)).state).toBeUndefined();
  }
});
it("fails closed and keeps internal errors private", async () => {
  m.rpc.mockResolvedValue({ data: state, error: { code: "42501", message: "private token" } });
  const result = await readIslandStateAction(context);
  expect(result.blocked).toBe(true); expect(result.state).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("token");
  m.user.mockRejectedValue(new Error("secret"));
  expect(JSON.stringify(await readIslandStateAction(context))).not.toContain("secret");
});
