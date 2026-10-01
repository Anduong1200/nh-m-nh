import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HouseWithMembers } from "@/modules/houses/server";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/model";

vi.mock("@/modules/houses/actions", () => ({}));
vi.mock("@/modules/presence/actions", () => ({}));
vi.mock("@/modules/knocks/actions", () => ({}));
vi.mock("@/modules/notifications/actions", () => ({}));
vi.mock("@/components/phase2/home-room", () => ({ HomeRoom: () => <div>Authorized Home</div> }));
vi.mock("@/components/phase3/identity-setup", () => ({ IdentitySetup: () => <div>Choose identity</div> }));
vi.mock("@/components/phase3/sync-coordinator", () => ({ SyncCoordinator: () => <div>Board sync</div> }));
vi.mock("@/components/sign-out-button", () => ({ SignOutButton: () => null }));
vi.mock("@/components/theme-control", () => ({ ThemeControl: () => null }));
import { HouseDashboard } from "./house-dashboard";

function house(identityReady: boolean, mascot: "rabbit" | null = null): HouseWithMembers {
  return { id: "house", name: "Nhà", state: "active", created_at: "2026-10-01T00:00:00Z", identityReady,
    members: ["actor", "partner"].map((user_id) => ({ user_id, role: "partner", status: "active", joined_at: "2026-10-01T00:00:00Z", mascot, profile: null })) };
}

describe("House identity rollout", () => {
  it("keeps a paired baseline House accessible without forcing an unavailable setup", () => {
    const html = renderToStaticMarkup(<HouseDashboard house={house(false)} currentUserId="actor" initialState={null} />);
    expect(html).toContain("Authorized Home");
    expect(html).not.toContain("Choose identity");
  });
  it("offers identity setup after the schema becomes ready", () => {
    const html = renderToStaticMarkup(<HouseDashboard house={house(true)} currentUserId="actor" initialState={null} />);
    expect(html).toContain("Choose identity");
    expect(html).not.toContain("Authorized Home");
  });
  it("opens Home for a member with a persisted identity", () => {
    const html = renderToStaticMarkup(<HouseDashboard house={house(true, "rabbit")} currentUserId="actor" initialState={null} />);
    expect(html).toContain("Authorized Home");
  });
  it("keeps the Board queue paused until its authorized state has loaded successfully", () => {
    const core = { statuses: [], knocks: [], preferences: DEFAULT_NOTIFICATION_PREFERENCES };
    for (const state of [null, core, { ...core, boardItems: [], boardError: "Unavailable" }]) {
      const html = renderToStaticMarkup(<HouseDashboard house={house(false)} currentUserId="actor" initialState={state} />);
      expect(html).toContain("Authorized Home");
      expect(html).not.toContain("Board sync");
    }
    const html = renderToStaticMarkup(<HouseDashboard house={house(false)} currentUserId="actor" initialState={{ ...core, boardItems: [] }} />);
    expect(html).toContain("Board sync");
  });
});
