import { expect, it } from "vitest";
import { genericPushPayload, parsePrivatePushSubscription, validPushEndpoint } from "./push-model";
const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64url");
const keys = { p256dh: b64([4, ...Array<number>(64).fill(2)]), auth: b64(Array<number>(16).fill(3)) };
it("accepts only supported secure push hosts and exact key sizes", () => {
  for (const endpoint of ["https://fcm.googleapis.com/send/device", "https://web.push.apple.com/device"]) expect(parsePrivatePushSubscription({ endpoint, keys, expirationTime: null })).toEqual({ endpoint, keys });
  for (const endpoint of ["http://fcm.googleapis.com/send/a", "https://localhost/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.attacker.test/a", "https://user@fcm.googleapis.com/a", "https://fcm.googleapis.com:8080/a", "https://fcm.googleapis.com/a#secret", "file:///a"]) expect(validPushEndpoint(endpoint)).toBe(false);
  expect(parsePrivatePushSubscription({ endpoint: "https://fcm.googleapis.com/a", keys: { ...keys, auth: "bad" } })).toBeNull();
  expect(parsePrivatePushSubscription({ endpoint: "https://fcm.googleapis.com/a", keys: { ...keys, p256dh: b64(Array<number>(65).fill(2)) } })).toBeNull();
});
it("payload contains generic text and opaque binding only", () => {
  const token = crypto.randomUUID(), event = crypto.randomUUID();
  expect(genericPushPayload(token, event)).toEqual({ kind: "nha-minh", deviceToken: token, eventId: event, title: "Nhà Mình", body: "Có điều mới trong Nhà." });
  expect(() => genericPushPayload("not-a-device", event)).toThrow();
});
