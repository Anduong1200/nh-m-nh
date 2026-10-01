import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireUser: vi.fn(), getHouse: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.requireUser }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: mocks.getHouse }));

import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/model";
import { loadPhase2State, Phase2UnavailableError } from "./server";

type Result = { data: unknown; error: { message: string } | null };
const results: Record<string, Result> = {};
const filters: Record<string, Array<[string, unknown]>> = {};
const house = { id: "our-house", name: "Home", members: [{ user_id: "actor" }, { user_id: "partner" }] };
const own = { house_id: "our-house", user_id: "actor", mood: "calm", energy: 1, availability: "quiet", note: "", need: "", expires_at: "2020-01-01T00:00:00Z", version: 3, cleared: true };
const partner = { ...own, user_id: "partner", expires_at: null, cleared: false };
const knockId = "11111111-1111-4111-8111-111111111111";
const incoming = { id: knockId, house_id: "our-house", sender_id: "partner", recipient_id: "actor", kind: "note", content: "hello", created_at: "2026-10-01T12:00:00Z" };

function query(table: string) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => { (filters[table] ??= []).push([column, value]); return chain; }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(results[table])),
    then: (resolve: (value: Result | undefined) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(results[table]).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: "actor" });
  mocks.getHouse.mockResolvedValue(house);
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.from.mockImplementation(query);
  Object.keys(filters).forEach((key) => delete filters[key]);
  results.presence_entries = { data: [own, partner], error: null };
  results.knocks = { data: [incoming], error: null };
  results.notification_preferences = { data: null, error: null };
  results.knock_dismissals = { data: [], error: null };
});

describe("House-authorized Phase2 state", () => {
  it("loads only current membership and current recipient inbox, preserving own tombstone version", async () => {
    const state = await loadPhase2State("our-house");
    expect(state.statuses).toHaveLength(2);
    expect(state.statuses.find((status) => status.userId === "actor")?.version).toBe(3);
    expect(state.knocks[0]?.recipientId).toBe("actor");
    expect(state.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(filters.presence_entries).toContainEqual(["house_id", "our-house"]);
    expect(filters.knocks).toContainEqual(["recipient_id", "actor"]);
    expect(filters.notification_preferences).toContainEqual(["user_id", "actor"]);
    expect(filters.knock_dismissals).toContainEqual(["user_id", "actor"]);
  });
  it("denies client-supplied cross-House selectors before content reads", async () => {
    await expect(loadPhase2State("other-house")).rejects.toBeInstanceOf(Phase2UnavailableError);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("denies a missing or inactive membership", async () => {
    mocks.getHouse.mockResolvedValue(null);
    await expect(loadPhase2State("our-house")).rejects.toBeInstanceOf(Phase2UnavailableError);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not accept an outsider actor even with a House-shaped response", async () => {
    mocks.requireUser.mockResolvedValue({ id: "outsider" });
    await expect(loadPhase2State("our-house")).rejects.toBeInstanceOf(Phase2UnavailableError);
  });
  it("hides expired partner status and retains no last-seen timestamp", async () => {
    results.presence_entries = { data: [own, { ...partner, expires_at: "2020-01-01T00:00:00Z", updated_at: "private lastseen" }], error: null };
    const state = await loadPhase2State("our-house");
    expect(state.statuses.map((status) => status.userId)).toEqual(["actor"]);
    expect(JSON.stringify(state)).not.toContain("lastseen");
  });
  it("defensively drops cross-House, unknown-member, and nonrecipient rows", async () => {
    results.presence_entries = { data: [partner, { ...own, house_id: "other-house" }, { ...partner, user_id: "outsider" }], error: null };
    results.knocks = { data: [incoming, { ...incoming, house_id: "other-house" }, { ...incoming, recipient_id: "partner" }, { ...incoming, sender_id: "outsider" }], error: null };
    const state = await loadPhase2State("our-house");
    expect(state.statuses).toHaveLength(1);
    expect(state.knocks).toHaveLength(1);
  });
  it("keeps recipient dismissal private and filters dismissed inbox events", async () => {
    results.knock_dismissals = { data: [{ knock_id: knockId }], error: null };
    expect((await loadPhase2State("our-house")).knocks).toEqual([]);
  });
  it("fails closed on any database read failure with a sanitized message", async () => {
    results.notification_preferences = { data: null, error: { message: "private postgres host password" } };
    await expect(loadPhase2State("our-house")).rejects.toThrow("Chưa tải được");
    await expect(loadPhase2State("our-house")).rejects.not.toThrow("password");
  });
  it("does not use another user's notification privacy choices", async () => {
    results.notification_preferences = { data: { user_id: "partner", quiet_enabled: false, start_minute: 1320, end_minute: 420, timezone: "UTC", preview: "detail", knocks_enabled: true }, error: null };
    await expect(loadPhase2State("our-house")).rejects.toBeInstanceOf(Phase2UnavailableError);
  });
});
