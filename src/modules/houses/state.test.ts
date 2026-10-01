import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ phase2: vi.fn(), board: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/presence/server", () => ({ loadPhase2State: mocks.phase2 }));
vi.mock("@/modules/board/server", () => ({ getActiveBoardItems: mocks.board }));
import { loadHomeState } from "./state";
const core = { statuses: [], knocks: [], preferences: { preview: "generic" } };
beforeEach(() => { mocks.phase2.mockResolvedValue(core); mocks.board.mockResolvedValue({ items: [] }); });

describe("Home composition isolates optional domain failures", () => {
  it("loads an authorized core before enriching it with scoped Board data", async () => {
    expect(await loadHomeState("house")).toEqual({ ...core, boardItems: [] });
    expect(mocks.phase2).toHaveBeenCalledWith("house");
    expect(mocks.board).toHaveBeenCalledWith("house");
  });
  it("does not read optional content when identity or House authorization fails", async () => {
    mocks.phase2.mockRejectedValue(new Error("Unauthorized"));
    await expect(loadHomeState("other-house")).rejects.toThrow("Unauthorized");
    expect(mocks.board).not.toHaveBeenCalled();
  });
  it.each(["query", "throw", "invalid-house"])("keeps Presence/Knock available on %s failure, with no invalid Board data", async (mode) => {
    if (mode === "throw") mocks.board.mockRejectedValue(new Error("private database diagnostic"));
    else mocks.board.mockResolvedValue(mode === "query" ? { error: "private data" } : { items: [{ houseId: "other-house", payload: "private" }] });
    const state = await loadHomeState("house");
    expect(state.statuses).toEqual(core.statuses);
    expect(state.knocks).toEqual(core.knocks);
    expect(state.boardItems).toBeUndefined();
    expect(state.boardError).toContain("Chưa tải được");
    expect(JSON.stringify(state)).not.toContain("private");
  });
});
