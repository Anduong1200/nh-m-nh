import { afterEach, expect, it, vi } from "vitest";
const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@/modules/notifications/push-server", () => ({ dispatchBackgroundNotifications: dispatch }));
import { POST } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("rejects unsigned/mismatched invocations before any privileged work", async () => {
  vi.stubEnv("PUSH_DISPATCH_SECRET", "dispatch-test-only-".repeat(3));
  for (const authorization of ["", "Bearer wrong"]) { const response = await POST(new Request("https://nha-minh.example/api/notifications/dispatch", { method: "POST", headers: { authorization } })); expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store"); }
  expect(dispatch).not.toHaveBeenCalled();
});
it("handles configured and failed dispatches without private errors", async () => {
  const secret = "dispatch-test-only-".repeat(3); vi.stubEnv("PUSH_DISPATCH_SECRET", secret);
  const request = () => new Request("https://nha-minh.example/api/notifications/dispatch", { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  dispatch.mockResolvedValue({ configured: true, processed: 1 }); expect((await POST(request())).status).toBe(200);
  dispatch.mockRejectedValue(new Error("private")); const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).toBe("");
});
