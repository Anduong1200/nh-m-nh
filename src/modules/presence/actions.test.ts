import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/modules/auth/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/auth/server")>(), requireVerifiedUser: mocks.requireUser,
}));

import { AuthenticationRequiredError } from "@/modules/auth/server";
import { dismissKnockAction, sendKnockAction } from "@/modules/knocks/actions";
import { saveNotificationPreferencesAction } from "@/modules/notifications/actions";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/model";
import { clearPresenceAction, setPresenceAction } from "./actions";

const input = { mood: "calm", energy: "medium", availability: "later", note: "Một chút trà", need: "", expiry: "manual", timeZone: "UTC", expectedVersion: 0 };
const presenceRow = { user_id: "actor", mood: "calm", energy: 2, availability: "later", note: "Một chút trà", need: "", expires_at: null, version: 1, cleared: false };
const knockId = "11111111-1111-4111-8111-111111111111";
const knockRow = { id: knockId, sender_id: "actor", recipient_id: "partner", kind: "note", content: "Nghĩ đến cậu", created_at: "2026-10-01T12:00:00Z" };

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: "actor" });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: presenceRow, error: null });
});

describe("presence mutation authorization boundary", () => {
  it("verifies identity and sends only domain fields to the membership-resolving RPC", async () => {
    const result = await setPresenceAction({ ...input, actorId: "victim", houseId: "other-house" }, "actor");
    expect(result.status?.userId).toBe("actor");
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith("read-write");
    expect(mocks.rpc).toHaveBeenCalledWith("set_presence", {
      p_mood: "calm", p_energy: 2, p_availability: "later", p_note: "Một chút trà", p_need: "", p_expires_at: null, p_expected_version: 0,
    });
  });
  it("fails closed for unauthenticated callers before creating a mutation client", async () => {
    mocks.requireUser.mockRejectedValue(new AuthenticationRequiredError());
    expect((await setPresenceAction(input, "actor")).error).toContain("Đăng nhập");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not pass invalid status input to the database", async () => {
    expect((await setPresenceAction({ ...input, mood: "online" }, "actor")).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a conflict that requires deliberate user resolution", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Presence version conflict" } });
    const result = await setPresenceAction(input, "actor");
    expect(result.conflict).toBe(true);
    expect(result.error).toContain("thiết bị khác");
  });
  it("does not reveal policy errors or confidential DB diagnostic values", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private house ID xyz leaked diagnostic" } });
    const result = await setPresenceAction(input, "actor");
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("xyz");
    expect(result.status).toBeUndefined();
  });
  it("clears via optimistic version while retaining a tombstone version", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...presenceRow, cleared: true, version: 2 }, error: null });
    expect((await clearPresenceAction(1, "actor")).status?.version).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith("clear_presence", { p_expected_version: 1 });
  });
  it("requires a real current version for clearing", async () => {
    expect((await clearPresenceAction("1", "actor")).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sanitizes transport failures", async () => {
    mocks.rpc.mockRejectedValue(new Error("private postgres host secret"));
    expect((await setPresenceAction(input, "actor")).error).not.toContain("secret");
  });
});

describe("Knock authorization and retry contract", () => {
  it("forwards the same operation UUID for safe retries without accepting sender/recipient overrides", async () => {
    mocks.rpc.mockResolvedValue({ data: knockRow, error: null });
    const input = { operationId: knockId, kind: "note", content: "Nghĩ đến cậu", senderId: "victim", recipientId: "outsider", houseId: "other" };
    expect((await sendKnockAction(input, "actor")).knock?.id).toBe(knockId);
    expect((await sendKnockAction(input, "actor")).knock?.id).toBe(knockId);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "send_knock", { p_operation_id: knockId, p_kind: "note", p_content: "Nghĩ đến cậu" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "send_knock", { p_operation_id: knockId, p_kind: "note", p_content: "Nghĩ đến cậu" });
  });
  it("does not send a Knock from an unauthenticated caller", async () => {
    mocks.requireUser.mockRejectedValue(new AuthenticationRequiredError());
    expect((await sendKnockAction({ operationId: knockId, kind: "note", content: "hi" }, "actor")).error).toContain("Đăng nhập");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("explains a missing partner without guessing availability", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "House is not paired" } });
    expect((await sendKnockAction({ operationId: knockId, kind: "note", content: "hi" }, "actor")).error).toContain("ghép đôi");
  });
  it("passes dismissal only to the recipient-authorized RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await dismissKnockAction(knockId, "actor")).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("dismiss_knock", { p_knock_id: knockId });
  });
  it("denies outsider dismissal without disclosing the recipient", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "42501 recipient is private-user" } });
    const result = await dismissKnockAction(knockId, "actor");
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("private-user");
  });
});

describe("user-owned notification preferences", () => {
  it("persists privacy preference with no client ownership fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: "actor", quiet_enabled: false, start_minute: 1320, end_minute: 420, timezone: "Asia/Ho_Chi_Minh", preview: "generic", knocks_enabled: true }, error: null });
    expect((await saveNotificationPreferencesAction({ ...DEFAULT_NOTIFICATION_PREFERENCES, userId: "victim" }, "actor")).preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mocks.rpc).toHaveBeenCalledWith("set_notification_preferences", { p_quiet_enabled: false, p_start_minute: 1320, p_end_minute: 420, p_timezone: "Asia/Ho_Chi_Minh", p_preview: "generic", p_knocks_enabled: true });
  });
  it("fails closed for an unauthenticated preference change", async () => {
    mocks.requireUser.mockRejectedValue(new AuthenticationRequiredError());
    expect((await saveNotificationPreferencesAction(DEFAULT_NOTIFICATION_PREFERENCES, "actor")).error).toContain("Đăng nhập");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("same-request viewer binding", () => {
  const mutations = [
    ["set status", (viewer: unknown) => setPresenceAction(input, viewer)],
    ["clear status", (viewer: unknown) => clearPresenceAction(1, viewer)],
    ["send Knock", (viewer: unknown) => sendKnockAction({ operationId: knockId, kind: "note", content: "hello" }, viewer)],
    ["dismiss Knock", (viewer: unknown) => dismissKnockAction(knockId, viewer)],
    ["save preferences", (viewer: unknown) => saveNotificationPreferencesAction(DEFAULT_NOTIFICATION_PREFERENCES, viewer)],
  ] as const;

  it.each(mutations)("blocks stale-session %s before a mutation client or RPC is created", async (_, mutate) => {
    mocks.requireUser.mockResolvedValue({ id: "newly-signed-in-user" });
    const result = await mutate("actor");
    expect(result.error).toContain("Phiên đăng nhập đã đổi");
    expect(result.error).not.toContain("newly-signed-in-user");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(mutations)("fails closed when %s has no expected viewer", async (_, mutate) => {
    expect((await mutate(undefined)).error).toContain("Phiên đăng nhập đã đổi");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(mutations)("rejects nonstring viewer data for %s", async (_, mutate) => {
    expect((await mutate({ userId: "actor" })).error).toContain("Phiên đăng nhập đã đổi");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["set", () => setPresenceAction(input, "actor")],
    ["clear", () => clearPresenceAction(1, "actor")],
  ] as const)("rejects a %s presence result belonging to another actor", async (_, mutate) => {
    mocks.rpc.mockResolvedValue({ data: { ...presenceRow, user_id: "another-user" }, error: null });
    const result = await mutate();
    expect(result.error).toBeTruthy();
    expect(result.status).toBeUndefined();
    expect(result.error).not.toContain("another-user");
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rejects a returned Knock whose sender differs from verified identity", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...knockRow, sender_id: "another-user" }, error: null });
    const result = await sendKnockAction({ operationId: knockId, kind: "note", content: "hello" }, "actor");
    expect(result.error).toBeTruthy();
    expect(result.knock).toBeUndefined();
    expect(result.error).not.toContain("another-user");
  });

  it("rejects returned preferences belonging to another viewer", async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: "another-user", quiet_enabled: false, start_minute: 1320, end_minute: 420, timezone: "UTC", preview: "detail", knocks_enabled: true }, error: null });
    const result = await saveNotificationPreferencesAction(DEFAULT_NOTIFICATION_PREFERENCES, "actor");
    expect(result.error).toBeTruthy();
    expect(result.preferences).toBeUndefined();
  });
});
