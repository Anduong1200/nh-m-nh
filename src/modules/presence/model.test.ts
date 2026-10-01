import { describe, expect, it } from "vitest";
import { isPresenceVisible, parsePresenceInput, presenceExpiresAt, presenceFromRow, type PresenceInput, type PresenceStatus } from "./model";
import { endOfLocalDay, isValidTimeZone } from "./time";

const input: PresenceInput = { mood: "calm", energy: "medium", availability: "later", note: "  Nghỉ một chút  ", need: "  Một tách trà  ", expiry: "1h", timeZone: "Asia/Ho_Chi_Minh", expectedVersion: 0 };
const status: PresenceStatus = { userId: "a", mood: "calm", energy: "low", availability: "quiet", note: "", need: "", expiresAt: null, version: 1, cleared: false };

describe("explicit presence validation", () => {
  it("parses allowed fields and never forwards a supplied actor or House", () => {
    const result = parsePresenceInput({ ...input, userId: "victim", houseId: "outsider" });
    expect(result.value).toEqual({ ...input, note: "Nghỉ một chút", need: "Một tách trà" });
    expect(result.value).not.toHaveProperty("userId");
  });

  it.each([
    { mood: "online" }, { energy: 99 }, { availability: "last_seen" }, { expiry: "never" },
    { timeZone: "Wrong/Zone" }, { timeZone: "+07:00" }, { expectedVersion: -1 }, { expectedVersion: 0.5 },
    { note: "a".repeat(161) }, { need: "a".repeat(101) }, { note: "two\nlines" }, { need: "\u0000" },
  ])("rejects invalid explicit fields %j", (patch) => {
    expect(parsePresenceInput({ ...input, ...patch }).error).toBeTruthy();
  });

  it("counts Unicode characters consistently with database character bounds", () => {
    expect(parsePresenceInput({ ...input, note: "🍃".repeat(160) }).value?.note).toHaveLength(320);
    expect(parsePresenceInput({ ...input, note: "🍃".repeat(161) }).error).toBeTruthy();
  });
});

describe("presence expiry", () => {
  const now = new Date("2026-10-01T12:15:00.000Z");
  it("uses UTC instants for presets and manual expiry", () => {
    expect(presenceExpiresAt({ ...input, expiry: "manual" }, now)).toBeNull();
    expect(presenceExpiresAt({ ...input, expiry: "1h" }, now)).toBe("2026-10-01T13:15:00.000Z");
    expect(presenceExpiresAt({ ...input, expiry: "4h" }, now)).toBe("2026-10-01T16:15:00.000Z");
    expect(presenceExpiresAt({ ...input, expiry: "end_of_day" }, now)).toBe("2026-10-01T17:00:00.000Z");
  });

  it.each([
    ["2026-03-08T05:30:00.000Z", "2026-03-09T04:00:00.000Z"],
    ["2026-11-01T04:30:00.000Z", "2026-11-02T05:00:00.000Z"],
    ["2026-11-01T06:30:00.000Z", "2026-11-02T05:00:00.000Z"],
  ])("expires at the next local midnight across DST (%s)", (start, expected) => {
    expect(endOfLocalDay(new Date(start), "America/New_York")).toBe(expected);
  });

  it("hides expired and cleared status without inferring availability", () => {
    expect(isPresenceVisible(status, now)).toBe(true);
    expect(isPresenceVisible({ ...status, cleared: true }, now)).toBe(false);
    expect(isPresenceVisible({ ...status, expiresAt: now.toISOString() }, now)).toBe(false);
    expect(isPresenceVisible({ ...status, expiresAt: "bad timestamp" }, now)).toBe(false);
    expect(isPresenceVisible(null, now)).toBe(false);
  });

  it("accepts real named IANA zones and rejects invalid dates/zones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Wrong/Zone")).toBe(false);
    expect(() => endOfLocalDay(new Date(NaN), "UTC")).toThrow();
  });
});

it("maps database energy without exposing activity timestamps", () => {
  const row = { user_id: "a", mood: "calm", energy: 1, availability: "quiet", note: "", need: "", expires_at: null, version: 3, cleared: false, updated_at: "private activity time" };
  expect(presenceFromRow(row)).toEqual({ ...status, version: 3 });
  expect(presenceFromRow({ ...row, energy: 4 })).toBeNull();
});
