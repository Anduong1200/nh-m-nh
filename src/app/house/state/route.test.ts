import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getHouse: vi.fn(), loadState: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/auth/server")>(), requireVerifiedUser: mocks.requireUser,
}));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.getHouse }));
vi.mock("@/modules/houses/state", () => ({ loadHomeState: mocks.loadState }));

import { AuthenticationRequiredError } from "@/modules/auth/server";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/model";
import { GET } from "./route";

const house = { id: "our-house", name: "Nhà", members: [{ user_id: "actor" }] };
const state = { statuses: [], knocks: [], preferences: DEFAULT_NOTIFICATION_PREFERENCES };

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: "actor" });
  mocks.getHouse.mockResolvedValue(house);
  mocks.loadState.mockResolvedValue(state);
});

describe("private foreground refresh", () => {
  it("derives the House from verified membership and disables response caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ currentUserId: "actor", house, state });
    expect(mocks.loadState).toHaveBeenCalledWith("our-house");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it("returns a generic unauthorized error without any private state", async () => {
    mocks.requireUser.mockRejectedValue(new AuthenticationRequiredError());
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Đăng nhập lại để vào Nhà nhé." });
    expect(mocks.getHouse).not.toHaveBeenCalled();
    expect(mocks.loadState).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("denies an authenticated outsider with no active House", async () => {
    mocks.getHouse.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.loadState).not.toHaveBeenCalled();
  });
  it("does not leak database diagnostics on transient refresh failure", async () => {
    mocks.loadState.mockRejectedValue(new Error("private host and relationship note"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("relationship");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
