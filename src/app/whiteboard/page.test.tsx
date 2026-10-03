import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configuration: vi.fn(), user: vi.fn(), house: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfiguration: mocks.configuration }));
vi.mock("@/modules/auth/server", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.house, HouseLoadError: class extends Error {} }));
vi.mock("./room", () => ({ WhiteboardRoom: () => null }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
import WhiteboardPage from "./page";
beforeEach(() => { vi.clearAllMocks(); mocks.configuration.mockReturnValue({}); mocks.user.mockResolvedValue({ id: "actor" }); mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }, { user_id: "partner" }] }); });
it("never loads a private canvas for an unconfigured or anonymous visitor", async () => {
  mocks.configuration.mockReturnValue(null); await expect(WhiteboardPage()).rejects.toThrow("REDIRECT:/auth/sign-in"); expect(mocks.user).not.toHaveBeenCalled();
  mocks.configuration.mockReturnValue({}); mocks.user.mockResolvedValue(null); await expect(WhiteboardPage()).rejects.toThrow("REDIRECT:/auth/sign-in"); expect(mocks.house).not.toHaveBeenCalled();
});
it("requires a paired House before mounting the account-bound canvas", async () => {
  mocks.house.mockResolvedValue(null); await expect(WhiteboardPage()).rejects.toThrow("REDIRECT:/house/setup");
  mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }] }); await expect(WhiteboardPage()).rejects.toThrow("REDIRECT:/house");
  mocks.house.mockResolvedValue({ id: "house", members: [{ user_id: "actor" }, { user_id: "partner" }] });
  expect((await WhiteboardPage()).props).toEqual({ accountId: "actor", houseId: "house" });
});
