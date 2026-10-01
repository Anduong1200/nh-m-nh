import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getHouse: vi.fn(), loadState: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.requireUser }));
vi.mock("@/modules/houses/server", async (original) => ({ ...await original<typeof import("@/modules/houses/server")>(), getMyHouse: mocks.getHouse }));
vi.mock("@/modules/houses/state", () => ({ loadHomeState: mocks.loadState }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./house-dashboard", () => ({ HouseDashboard: () => null }));
import { HouseLoadError } from "@/modules/houses/server";
import HousePage from "./page";
import { HouseUnavailable } from "./house-unavailable";

beforeEach(() => { mocks.requireUser.mockResolvedValue({ id: "actor" }); });
describe("House entry failure", () => {
  it("renders a private retry state for an expected load failure instead of inviting another House", async () => {
    mocks.getHouse.mockRejectedValue(new HouseLoadError());
    expect((await HousePage()).type).toBe(HouseUnavailable);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.loadState).not.toHaveBeenCalled();
  });
  it("does not swallow an auth redirect or unexpected exception", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mocks.getHouse.mockRejectedValue(redirect);
    await expect(HousePage()).rejects.toBe(redirect);
  });
});
