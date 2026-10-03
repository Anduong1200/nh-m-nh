import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ config: vi.fn(), user: vi.fn(), house: vi.fn(), read: vi.fn(), list: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfiguration: mocks.config }));
vi.mock("@/modules/houses/server", async original => ({ ...await original<typeof import("@/modules/houses/server")>(), getMyHouse: mocks.house }));
vi.mock("@/modules/island/actions", () => ({ readIslandStateAction: mocks.read }));
vi.mock("@/modules/games/actions", () => ({ listGameSessionsAction: mocks.list }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./workspace", () => ({ IslandWorkspace: () => null }));
import { gameActors, gameHouse } from "@/modules/games/test-fixtures";
import { deriveIslandState } from "@/modules/island/model";
import { HouseLoadError } from "@/modules/houses/server";
import { HouseUnavailable } from "../house/house-unavailable";
import IslandPage from "./page";
const context = { accountId: gameActors[0], houseId: gameHouse };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue({ url: "https://example.supabase.co", publishableKey: "public-fixture" });
  mocks.user.mockResolvedValue({ id: gameActors[0] });
  mocks.house.mockResolvedValue({ id: gameHouse, members: gameActors.map(user_id => ({ user_id })) });
  mocks.read.mockResolvedValue({ context, state: deriveIslandState(gameHouse, []) });
  mocks.list.mockResolvedValue({ context, sessions: [] });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
it("requires verified identity and current House before reading any Island data", async () => {
  mocks.user.mockRejectedValue(new Error("auth redirect"));
  await expect(IslandPage()).rejects.toThrow("auth redirect");
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ id: gameActors[0] }); mocks.house.mockResolvedValue(null);
  await expect(IslandPage()).rejects.toThrow("redirect:/house/setup");
  expect(mocks.list).not.toHaveBeenCalled();
});
it("redirects unconfigured and anonymous visitors to sign-in without private reads", async () => {
  mocks.config.mockReturnValue(null);
  await expect(IslandPage()).rejects.toThrow("redirect:/auth/sign-in");
  expect(mocks.user).not.toHaveBeenCalled();
  mocks.config.mockReturnValue({ url: "https://example.supabase.co", publishableKey: "public-fixture" });
  mocks.user.mockResolvedValue(null);
  await expect(IslandPage()).rejects.toThrow("redirect:/auth/sign-in");
  expect(mocks.house).not.toHaveBeenCalled();
});
it("renders a closed retry state for House failures and awaits the second partner", async () => {
  mocks.house.mockRejectedValue(new HouseLoadError());
  expect((await IslandPage()).type).toBe(HouseUnavailable);
  mocks.house.mockResolvedValue({ id: gameHouse, members: [{ user_id: gameActors[0] }] });
  await expect(IslandPage()).rejects.toThrow("redirect:/house");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("binds bootstrap to the verified House and rejects mismatched server projections", async () => {
  const page = await IslandPage();
  expect(mocks.read).toHaveBeenCalledWith(context);
  expect(page.props).toMatchObject({ context, initialView: { artifacts: [], state: { version: 0 } } });
  mocks.read.mockResolvedValue({ context: { ...context, accountId: gameActors[1] }, state: deriveIslandState(gameHouse, []) });
  expect((await IslandPage()).type).toBe("main");
});
it("does not mount a cached Island screen after explicit authorization denial", async () => {
  mocks.read.mockResolvedValue({ blocked: true });
  expect((await IslandPage()).type).toBe("main");
});
