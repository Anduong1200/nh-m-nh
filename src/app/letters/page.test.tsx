import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ config: vi.fn(), user: vi.fn(), house: vi.fn(), list: vi.fn(), redirect: vi.fn((target: string) => { throw new Error(`redirect:${target}`); }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfiguration: mocks.config }));
vi.mock("@/modules/auth/server", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/modules/houses/server", async original => ({ ...await original<typeof import("@/modules/houses/server")>(), getMyHouse: mocks.house }));
vi.mock("@/modules/letters/actions", () => ({ listLettersAction: mocks.list }));
vi.mock("@/components/phase4/letters", () => ({ LettersScreen: () => null }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { HouseLoadError } from "@/modules/houses/server";
import { LettersScreen } from "@/components/phase4/letters";
import LettersPage from "./page";
beforeEach(() => {
  vi.clearAllMocks(); mocks.config.mockReturnValue({ url: "https://example.supabase.co", publishableKey: "public" });
  mocks.user.mockResolvedValue({ id: "actor" });
  mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor", profile: { display_name: "Thỏ" } }, { user_id: "partner", profile: { display_name: "Cú" } }] });
  mocks.list.mockResolvedValue({ context: { accountId: "actor", houseId: "house" }, letters: [] });
});
describe("Letters private route", () => {
  it("redirects without configured auth or verified identity before requesting private data", async () => {
    mocks.config.mockReturnValue(null);
    await expect(LettersPage()).rejects.toThrow("redirect:/auth/sign-in"); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
    mocks.config.mockReturnValue({}); mocks.user.mockResolvedValue(null);
    await expect(LettersPage()).rejects.toThrow("redirect:/auth/sign-in"); expect(mocks.house).not.toHaveBeenCalled();
  });
  it("redirects a verified user without a House and never swallows unexpected redirects", async () => {
    mocks.house.mockResolvedValue(null);
    await expect(LettersPage()).rejects.toThrow("redirect:/house/setup"); expect(mocks.list).not.toHaveBeenCalled();
    const unexpected = new Error("NEXT_REDIRECT"); mocks.house.mockRejectedValue(unexpected);
    await expect(LettersPage()).rejects.toBe(unexpected);
  });
  it("stays closed for unavailable House authorization or blocked letter bootstrap", async () => {
    mocks.house.mockRejectedValue(new HouseLoadError()); expect((await LettersPage()).type).not.toBe(LettersScreen); expect(mocks.list).not.toHaveBeenCalled();
    mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }, { user_id: "partner" }] }); mocks.list.mockResolvedValue({ blocked: true });
    expect((await LettersPage()).type).not.toBe(LettersScreen);
  });
  it("does not initialize a composer before pairing and binds the ready UI to the verified actor/House", async () => {
    mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }] }); expect((await LettersPage()).type).not.toBe(LettersScreen); expect(mocks.list).not.toHaveBeenCalled();
    mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }, { user_id: "partner" }] });
    const view = await LettersPage(); expect(view.type).toBe(LettersScreen); expect(view.props.context).toEqual({ accountId: "actor", houseId: "house" }); expect(mocks.list).toHaveBeenCalledWith(view.props.context);
  });
});
