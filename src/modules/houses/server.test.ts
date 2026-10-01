import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireUser: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.requireUser }));
import { getMyHouse, HouseLoadError } from "./server";

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  chain.in.mockResolvedValue(result); chain.maybeSingle.mockResolvedValue(result);
  return Object.assign(chain, { then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) });
}
const member = { user_id: "actor", role: "creator", status: "active", joined_at: "2026-10-01T00:00:00Z" };
const house = { id: "house", name: "Nhà Mình", state: "active", created_at: "2026-10-01T00:00:00Z" };
beforeEach(() => { mocks.requireUser.mockResolvedValue({ id: "actor" }); mocks.createClient.mockResolvedValue({ from: mocks.from }); });

describe("House server reads", () => {
  it("fetches profiles through their own RLS instead of a nonexistent relational embed", async () => {
    const membership = query({ house_id: "house" });
    const details = query(house);
    const members = query([member, { ...member, user_id: "partner" }]);
    const profiles = query([{ id: "actor", display_name: "Lan", avatar_url: null }, { id: "partner", display_name: "Minh", avatar_url: null }]);
    mocks.from.mockReturnValueOnce(membership).mockReturnValueOnce(details).mockReturnValueOnce(members).mockReturnValueOnce(profiles);
    const result = await getMyHouse();
    expect(result?.members.map((row) => row.profile?.display_name)).toEqual(["Lan", "Minh"]);
    expect(result?.identityReady).toBe(true);
    expect(membership.eq).toHaveBeenCalledWith("user_id", "actor");
    expect(profiles.in).toHaveBeenCalledWith("id", ["actor", "partner"]);
    expect(members.select).toHaveBeenCalledWith("user_id, role, status, joined_at, mascot");
  });
  it.each([
    { code: "42703", message: "column house_members.mascot does not exist" },
    { code: "PGRST204", message: "Could not find the 'mascot' column of 'house_members' in the schema cache" },
  ])("opens an authorized baseline House when only the identity column is missing", async (error) => {
    const baseline = query([member, { ...member, user_id: "partner" }]);
    mocks.from.mockReturnValueOnce(query({ house_id: "house" })).mockReturnValueOnce(query(house))
      .mockReturnValueOnce(query(null, error)).mockReturnValueOnce(baseline)
      .mockReturnValueOnce(query([{ id: "actor", display_name: "Tên đã lưu", avatar_url: null }]));
    const result = await getMyHouse();
    expect(result?.identityReady).toBe(false);
    expect(result?.members.map((row) => row.mascot)).toEqual([null, null]);
    expect(result?.members[0]?.profile?.display_name).toBe("Tên đã lưu");
    expect(baseline.select).toHaveBeenCalledWith("user_id, role, status, joined_at");
    expect(baseline.eq).toHaveBeenCalledWith("house_id", "house");
    expect(baseline.eq).toHaveBeenCalledWith("status", "active");
  });
  it.each([
    { code: "42501", message: "permission denied for table house_members" },
    { code: "42703", message: "column house_members.status does not exist" },
    { code: "PGRST204", message: "Could not find the 'mascot' column of 'another_table' in the schema cache" },
    { code: "", message: "Failed to fetch" },
  ])("does not downgrade a failed or unauthorized membership read", async (error) => {
    mocks.from.mockReturnValueOnce(query({ house_id: "house" })).mockReturnValueOnce(query(house))
      .mockReturnValueOnce(query(null, error));
    await expect(getMyHouse()).rejects.toThrow(HouseLoadError);
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
  it.each([
    { data: null, error: { code: "42501", message: "denied" } },
    { data: [], error: null },
    { data: [{ ...member, user_id: "other" }], error: null },
    { data: [member, { ...member, user_id: "partner" }, { ...member, user_id: "third" }], error: null },
  ])("keeps authorization and capacity checks on the baseline retry", async ({ data, error }) => {
    mocks.from.mockReturnValueOnce(query({ house_id: "house" })).mockReturnValueOnce(query(house))
      .mockReturnValueOnce(query(null, { code: "42703", message: "column house_members.mascot does not exist" }))
      .mockReturnValueOnce(query(data, error));
    await expect(getMyHouse()).rejects.toThrow(HouseLoadError);
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  });
  it("preserves assigned identities when the migration is installed", async () => {
    mocks.from.mockReturnValueOnce(query({ house_id: "house" })).mockReturnValueOnce(query(house))
      .mockReturnValueOnce(query([{ ...member, mascot: "rabbit" }, { ...member, user_id: "partner", mascot: "owl" }]))
      .mockReturnValueOnce(query([]));
    expect((await getMyHouse())?.members.map((row) => row.mascot)).toEqual(["rabbit", "owl"]);
    expect(mocks.from).toHaveBeenCalledTimes(4);
  });
  it("returns no House only for a successful empty membership lookup", async () => {
    mocks.from.mockReturnValue(query(null));
    expect(await getMyHouse()).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("does not mistake a database failure for permission to create another House", async () => {
    mocks.from.mockReturnValue(query(null, { message: "private policy detail" }));
    await expect(getMyHouse()).rejects.toThrow(HouseLoadError);
    await expect(getMyHouse()).rejects.not.toThrow("private policy detail");
  });
  it.each([{ members: [member, { ...member, user_id: "partner" }, { ...member, user_id: "third" }] }, { members: [{ ...member, user_id: "other" }] }])("fails closed for invalid active membership records", async ({ members }) => {
    mocks.from.mockReturnValueOnce(query({ house_id: "house" })).mockReturnValueOnce(query(house)).mockReturnValueOnce(query(members));
    await expect(getMyHouse()).rejects.toThrow(HouseLoadError);
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  });
  it("requires verified identity before reading any House tables", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Authentication required"));
    await expect(getMyHouse()).rejects.toThrow("Authentication required");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
