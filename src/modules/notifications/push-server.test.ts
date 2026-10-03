import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/media-admin", () => ({ createMediaAdminClient: m.admin }));
import { dispatchBackgroundNotifications, getBackgroundNotificationConfiguration } from "./push-server";
const key = Buffer.from([4, ...Array<number>(64).fill(2)]).toString("base64url");
const preferences = { quiet_enabled: false, start_minute: 1320, end_minute: 420, timezone: "UTC", preview: "detail", knocks_enabled: true };
function delivery(extra: Record<string, unknown> = {}) { return { outbox_id: crypto.randomUUID(), lease_token: crypto.randomUUID(), device_token: crypto.randomUUID(), event_id: crypto.randomUUID(), kind: "knock", subscription: { endpoint: "https://fcm.googleapis.com/send/test", keys: { p256dh: key, auth: Buffer.alloc(16, 3).toString("base64url") } }, preferences, db_now: "2026-10-03T12:00:00Z", ...extra }; }
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", key); vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "a".repeat(43)); vi.stubEnv("WEB_PUSH_SUBJECT", "https://nha-minh.example/contact"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only"); vi.stubEnv("PUSH_DISPATCH_SECRET", "test-dispatch-only-".repeat(3));
  m.admin.mockReturnValue({ rpc: m.rpc }); m.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_push_deliveries" ? [] : true, error: null }));
});
afterEach(() => vi.unstubAllEnvs());
it("never exposes private server configuration and disables delivery when configuration is incomplete", async () => {
  expect(getBackgroundNotificationConfiguration()).toEqual({ enabled: true, publicKey: key });
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", ""); const send = vi.fn();
  expect(await dispatchBackgroundNotifications(send)).toEqual({ configured: false, processed: 0 }); expect(send).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled();
});
it("rechecks the leased source and sends generic payload even when detail preview is selected", async () => {
  const row = delivery(); m.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_push_deliveries" ? [row] : true, error: null }));
  const send = vi.fn().mockResolvedValue({}); expect(await dispatchBackgroundNotifications(send)).toEqual({ configured: true, processed: 1 });
  expect(m.rpc).toHaveBeenCalledWith("push_delivery_ready", { p_id: row.outbox_id, p_lease_token: row.lease_token });
  expect(JSON.parse(send.mock.calls[0]![1])).toEqual({ kind: "nha-minh", deviceToken: row.device_token, eventId: row.event_id, title: "Nhà Mình", body: "Có điều mới trong Nhà." });
  expect(m.rpc).toHaveBeenCalledWith("finish_push_delivery", { p_id: row.outbox_id, p_lease_token: row.lease_token, p_result: "sent" });
});
it("honors DB time quiet hours, disabled knocks, stale sources and unsafe endpoints without sending", async () => {
  const rows = [delivery({ preferences: { ...preferences, quiet_enabled: true }, db_now: "2026-10-03T23:00:00Z" }), delivery({ preferences: { ...preferences, knocks_enabled: false } }), delivery(), delivery({ subscription: { endpoint: "https://127.0.0.1/a", keys: {} } })];
  m.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_push_deliveries" ? rows : false, error: null }));
  const send = vi.fn(); await dispatchBackgroundNotifications(send); expect(send).not.toHaveBeenCalled();
});
it.each([[410, "expired"], [500, "retry"]])("classifies transport %s without exposing its error", async (statusCode, result) => {
  const row = delivery(); m.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_push_deliveries" ? [row] : true, error: null }));
  await dispatchBackgroundNotifications(vi.fn().mockRejectedValue({ statusCode, body: "private provider details" }));
  expect(m.rpc).toHaveBeenCalledWith("finish_push_delivery", { p_id: row.outbox_id, p_lease_token: row.lease_token, p_result: result });
});
