import { describe, expect, it } from "vitest";
import { canNotifyKnock, DEFAULT_NOTIFICATION_PREFERENCES, formatKnockNotification, isQuietTime, parseNotificationPreferences } from "./model";

describe("notification privacy", () => {
  it("uses generic content even when the Knock includes a sensitive note", () => {
    const notification = formatKnockNotification({ kind: "note", content: "Private relationship details" }, DEFAULT_NOTIFICATION_PREFERENCES);
    expect(notification).toEqual({ title: "Nhà Mình", body: "Có một cú gõ cửa trong Nhà." });
    expect(JSON.stringify(notification)).not.toContain("Private");
  });
  it("uses detail only after explicit opt-in", () => {
    expect(formatKnockNotification({ kind: "note", content: "Nhớ cậu" }, { ...DEFAULT_NOTIFICATION_PREFERENCES, preview: "detail" }).body).toBe("Nhớ cậu");
    expect(formatKnockNotification({ kind: "sticker", content: "tea" }, { ...DEFAULT_NOTIFICATION_PREFERENCES, preview: "detail" }).body).toContain("tách trà");
  });
  it("does not notify when the user disabled Knock notifications", () => {
    expect(canNotifyKnock({ ...DEFAULT_NOTIFICATION_PREFERENCES, knocksEnabled: false })).toBe(false);
  });
});

describe("per-user quiet hours", () => {
  const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, quietEnabled: true };
  it.each([
    ["2026-10-01T14:59:00Z", false], ["2026-10-01T15:00:00Z", true],
    ["2026-10-01T20:00:00Z", true], ["2026-10-02T00:00:00Z", false],
  ])("respects crossing-midnight boundaries at %s", (now, quiet) => {
    expect(isQuietTime(preferences, new Date(now))).toBe(quiet);
  });
  it("checks same-day quiet intervals with exclusive end", () => {
    const daytime = { ...preferences, startMinute: 12 * 60, endMinute: 13 * 60 };
    expect(isQuietTime(daytime, new Date("2026-10-01T05:30:00Z"))).toBe(true);
    expect(isQuietTime(daytime, new Date("2026-10-01T06:00:00Z"))).toBe(false);
  });
  it("covers both occurrences of a repeated DST quiet hour", () => {
    const repeatedHour = { ...preferences, timeZone: "America/New_York", startMinute: 60, endMinute: 120 };
    expect(isQuietTime(repeatedHour, new Date("2026-11-01T05:30:00Z"))).toBe(true);
    expect(isQuietTime(repeatedHour, new Date("2026-11-01T06:30:00Z"))).toBe(true);
    expect(isQuietTime(repeatedHour, new Date("2026-11-01T07:00:00Z"))).toBe(false);
  });
  it("ends a skipped-hour interval when local clock jumps forward", () => {
    const skippedHour = { ...preferences, timeZone: "America/New_York", startMinute: 120, endMinute: 180 };
    expect(isQuietTime(skippedHour, new Date("2026-03-08T07:00:00Z"))).toBe(false);
  });
  it("rejects invalid ranges and timezone instead of guessing", () => {
    expect(parseNotificationPreferences({ ...preferences, startMinute: -1 }).error).toBeTruthy();
    expect(parseNotificationPreferences({ ...preferences, endMinute: 1440 }).error).toBeTruthy();
    expect(parseNotificationPreferences({ ...preferences, endMinute: preferences.startMinute }).error).toBeTruthy();
    expect(parseNotificationPreferences({ ...preferences, timeZone: "+07:00" }).error).toBeTruthy();
    expect(isQuietTime({ ...preferences, timeZone: "Wrong/Zone" })).toBe(true);
  });
});
