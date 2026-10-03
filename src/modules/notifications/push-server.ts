import "server-only";
import webpush from "web-push";
import { createMediaAdminClient } from "@/lib/supabase/media-admin";
import { isUuid } from "@/modules/knocks/model";
import { DEFAULT_NOTIFICATION_PREFERENCES, isQuietTime, notificationPreferencesFromRow } from "./model";
import { genericPushPayload, parsePrivatePushSubscription, validVapidPublicKey, type BackgroundNotificationConfiguration, type PrivatePushSubscription } from "./push-model";

function vapidConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim(), privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim(), subject = process.env.WEB_PUSH_SUBJECT?.trim();
  let validSubject = Boolean(subject && /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject));
  if (subject && !validSubject) {
    try { const url = new URL(subject); validSubject = url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash; } catch { /* Invalid contact URL. */ }
  }
  if (!validVapidPublicKey(publicKey) || !privateKey || !/^[A-Za-z0-9_-]{43}$/.test(privateKey) || !subject || !validSubject) return null;
  return { publicKey, privateKey, subject };
}
export function getBackgroundNotificationConfiguration(): BackgroundNotificationConfiguration {
  const vapid = vapidConfiguration();
  const serverReady = /^sb_secret_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_SECRET_KEY?.trim() ?? "") && (process.env.PUSH_DISPATCH_SECRET?.trim().length ?? 0) >= 32;
  return { enabled: Boolean(vapid && serverReady), publicKey: vapid && serverReady ? vapid.publicKey : null };
}
type Delivery = { outboxId: string; leaseToken: string; deviceToken: string; eventId: string; kind: "knock" | "letter-delivered" | "game-turn"; subscription: PrivatePushSubscription; preferences: ReturnType<typeof notificationPreferencesFromRow>; now: Date };
function deliveryFromRow(value: unknown): Delivery | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>, subscription = parsePrivatePushSubscription(row.subscription);
  const preferences = row.preferences && typeof row.preferences === "object" ? notificationPreferencesFromRow(row.preferences as Record<string, unknown>) : DEFAULT_NOTIFICATION_PREFERENCES;
  const now = new Date(typeof row.db_now === "string" ? row.db_now : "");
  if (!isUuid(row.outbox_id) || !isUuid(row.lease_token) || !isUuid(row.device_token) || !isUuid(row.event_id) || !["knock", "letter-delivered", "game-turn"].includes(row.kind as string) || !subscription || !preferences || !Number.isFinite(now.getTime())) return null;
  return { outboxId: row.outbox_id, leaseToken: row.lease_token, deviceToken: row.device_token, eventId: row.event_id, kind: row.kind as Delivery["kind"], subscription, preferences, now };
}
export type PushTransport = (subscription: PrivatePushSubscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

/** Inject transport in tests. Production is called only by the secret-protected dispatch route. */
export async function dispatchBackgroundNotifications(transport: PushTransport = webpush.sendNotification): Promise<{ configured: boolean; processed: number }> {
  const vapid = vapidConfiguration();
  if (!vapid || !getBackgroundNotificationConfiguration().enabled) return { configured: false, processed: 0 };
  const admin = createMediaAdminClient();
  const { data, error } = await admin.rpc("claim_push_deliveries", { p_limit: 8 });
  if (error || !Array.isArray(data)) throw new Error("Notification dispatch unavailable");
  let processed = 0;
  for (const candidate of data) {
    const delivery = deliveryFromRow(candidate);
    if (!delivery) continue; // A malformed service-only response never sends a network request.
    const finish = (result: "sent" | "suppressed" | "retry" | "expired") => admin.rpc("finish_push_delivery", { p_id: delivery.outboxId, p_lease_token: delivery.leaseToken, p_result: result });
    if (!delivery.preferences || isQuietTime(delivery.preferences, delivery.now) || (delivery.kind === "knock" && !delivery.preferences.knocksEnabled)) {
      await finish("suppressed"); processed++; continue;
    }
    const ready = await admin.rpc("push_delivery_ready", { p_id: delivery.outboxId, p_lease_token: delivery.leaseToken });
    if (ready.error || ready.data !== true) { await finish("suppressed"); processed++; continue; }
    try {
      await transport(delivery.subscription, JSON.stringify(genericPushPayload(delivery.deviceToken, delivery.eventId)), { vapidDetails: vapid, contentEncoding: "aes128gcm", TTL: 60, urgency: "normal", timeout: 5000 });
      await finish("sent");
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error ? (error as {statusCode: unknown}).statusCode : null;
      await finish(status === 404 || status === 410 ? "expired" : "retry");
    }
    processed++;
  }
  return { configured: true, processed };
}
