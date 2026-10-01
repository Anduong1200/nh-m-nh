import type { Knock, KnockSticker } from "@/modules/knocks/model";
import { KNOCK_STICKER_LABELS } from "@/modules/knocks/model";
import type { ValidationResult } from "@/modules/presence/model";
import { isValidTimeZone, minutesInTimeZone } from "@/modules/presence/time";

export type NotificationPreferences = {
  quietEnabled: boolean;
  startMinute: number;
  endMinute: number;
  timeZone: string;
  preview: "generic" | "detail";
  knocksEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  quietEnabled: false,
  startMinute: 22 * 60,
  endMinute: 7 * 60,
  timeZone: "Asia/Ho_Chi_Minh",
  preview: "generic",
  knocksEnabled: true,
};

export function parseNotificationPreferences(input: unknown): ValidationResult<NotificationPreferences> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Tùy chọn thông báo chưa hợp lệ." };
  const row = input as Record<string, unknown>;
  if (typeof row.quietEnabled !== "boolean" || typeof row.knocksEnabled !== "boolean" ||
    typeof row.startMinute !== "number" || !Number.isInteger(row.startMinute) || row.startMinute < 0 || row.startMinute > 1439 ||
    typeof row.endMinute !== "number" || !Number.isInteger(row.endMinute) || row.endMinute < 0 || row.endMinute > 1439 ||
    !isValidTimeZone(row.timeZone) || (row.preview !== "generic" && row.preview !== "detail")) {
    return { error: "Chọn giờ và múi giờ hợp lệ nhé." };
  }
  if (row.quietEnabled && row.startMinute === row.endMinute) return { error: "Giờ bắt đầu và kết thúc yên tĩnh cần khác nhau." };
  return { value: { quietEnabled: row.quietEnabled, startMinute: row.startMinute, endMinute: row.endMinute, timeZone: row.timeZone, preview: row.preview, knocksEnabled: row.knocksEnabled } };
}

export function notificationPreferencesFromRow(row: Record<string, unknown>): NotificationPreferences | null {
  const parsed = parseNotificationPreferences({ quietEnabled: row.quiet_enabled, startMinute: row.start_minute, endMinute: row.end_minute, timeZone: row.timezone, preview: row.preview, knocksEnabled: row.knocks_enabled });
  return parsed.value ?? null;
}

/** Local clock comparisons also cover DST repeated and skipped hours. End is exclusive. */
export function isQuietTime(preferences: NotificationPreferences, now: Date = new Date()): boolean {
  if (!preferences.quietEnabled) return false;
  if (!isValidTimeZone(preferences.timeZone) || !Number.isFinite(now.getTime())) return true;
  const minute = minutesInTimeZone(now, preferences.timeZone);
  const { startMinute: start, endMinute: end } = preferences;
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function canNotifyKnock(preferences: NotificationPreferences, now: Date = new Date()): boolean {
  return preferences.knocksEnabled && !isQuietTime(preferences, now);
}

export function formatKnockNotification(knock: Pick<Knock, "kind" | "content">, preferences: NotificationPreferences): { title: string; body: string } {
  const generic = { title: "Nhà Mình", body: "Có một cú gõ cửa trong Nhà." };
  if (preferences.preview !== "detail") return generic;
  const content = knock.kind === "sticker" ? KNOCK_STICKER_LABELS[knock.content as KnockSticker] : knock.content;
  return { title: "Nhà Mình", body: content || generic.body };
}
