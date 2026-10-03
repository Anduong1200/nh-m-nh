import { isUuid } from "@/modules/knocks/model";

export type PrivatePushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type BackgroundNotificationConfiguration = { enabled: boolean; publicKey: string | null };
const pushHosts = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && pushHosts.has(url.hostname) && (!url.port || url.port === "443") && !url.username && !url.password && !url.hash && url.pathname.length > 1;
  } catch { return false; }
}
function keyBytes(value: unknown, length: number): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    if (decoded.length !== length || value.length !== Math.ceil(length * 8 / 6)) return null;
    return Uint8Array.from(decoded, c => c.charCodeAt(0));
  } catch { return null; }
}
export function parsePrivatePushSubscription(value: unknown): PrivatePushSubscription | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>, keys = row.keys;
  if (!validPushEndpoint(row.endpoint) || !keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const pair = keys as Record<string, unknown>, p256dh = keyBytes(pair.p256dh, 65), auth = keyBytes(pair.auth, 16);
  if (!p256dh || p256dh[0] !== 4 || !auth) return null;
  return { endpoint: row.endpoint, keys: { p256dh: pair.p256dh as string, auth: pair.auth as string } };
}
export function validVapidPublicKey(value: unknown): value is string { return keyBytes(value, 65)?.[0] === 4; }
export function genericPushPayload(deviceToken: string, eventId: string) {
  if (!isUuid(deviceToken) || !isUuid(eventId)) throw new Error("Invalid notification binding");
  return { kind: "nha-minh", deviceToken, eventId, title: "Nhà Mình", body: "Có điều mới trong Nhà." };
}
