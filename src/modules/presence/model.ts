import { endOfLocalDay, isValidTimeZone } from "./time";

export const MOODS = ["calm", "happy", "tired", "overwhelmed", "missing_you"] as const;
export const ENERGIES = ["low", "medium", "high"] as const;
export const AVAILABILITIES = ["available", "later", "quiet"] as const;
export const EXPIRIES = ["manual", "1h", "4h", "end_of_day"] as const;
export type Mood = (typeof MOODS)[number];
export type Energy = (typeof ENERGIES)[number];
export type Availability = (typeof AVAILABILITIES)[number];
export type PresenceExpiry = (typeof EXPIRIES)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  calm: "Bình yên", happy: "Vui vui", tired: "Hơi mệt",
  overwhelmed: "Nhiều điều quá", missing_you: "Nhớ cậu",
};
export const ENERGY_LABELS: Record<Energy, string> = {
  low: "Ít năng lượng", medium: "Vừa đủ", high: "Đầy năng lượng",
};
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Có thể cùng cậu một chút", later: "Hẹn lúc khác nhé", quiet: "Cần yên tĩnh",
};
export const EXPIRY_LABELS: Record<PresenceExpiry, string> = {
  manual: "Đến khi mình đổi", "1h": "Trong 1 giờ", "4h": "Trong 4 giờ", end_of_day: "Hết ngày hôm nay",
};

export type PresenceInput = {
  mood: Mood;
  energy: Energy;
  availability: Availability;
  note: string;
  need: string;
  expiry: PresenceExpiry;
  timeZone: string;
  expectedVersion: number;
};

export type PresenceStatus = {
  userId: string;
  mood: Mood;
  energy: Energy;
  availability: Availability;
  note: string;
  need: string;
  expiresAt: string | null;
  version: number;
  cleared: boolean;
};

export type ValidationResult<T> = { value: T; error?: never } | { error: string; value?: never };

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isExpectedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_147_483_646;
}

export function parsePresenceInput(input: unknown): ValidationResult<PresenceInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Trạng thái chưa hợp lệ." };
  const row = input as Record<string, unknown>;
  if (
    !includes(MOODS, row.mood) || !includes(ENERGIES, row.energy) ||
    !includes(AVAILABILITIES, row.availability) || !includes(EXPIRIES, row.expiry) ||
    !isValidTimeZone(row.timeZone) || !isExpectedVersion(row.expectedVersion)
  ) return { error: "Trạng thái hoặc múi giờ chưa hợp lệ." };
  if (typeof row.note !== "string" || typeof row.need !== "string") return { error: "Lời nhắn chưa hợp lệ." };
  const note = row.note.trim();
  const need = row.need.trim();
  if (Array.from(note).length > 160 || Array.from(need).length > 100 || /[\u0000-\u001f\u007f]/.test(note + need)) {
    return { error: "Viết một dòng ngắn nhé: lời nhắn tối đa 160 ký tự, điều cần tối đa 100 ký tự." };
  }
  return { value: { mood: row.mood, energy: row.energy, availability: row.availability, note, need, expiry: row.expiry, timeZone: row.timeZone, expectedVersion: row.expectedVersion } };
}

export function presenceExpiresAt(input: Pick<PresenceInput, "expiry" | "timeZone">, now: Date): string | null {
  if (input.expiry === "manual") return null;
  if (input.expiry === "end_of_day") return endOfLocalDay(now, input.timeZone);
  return new Date(now.getTime() + (input.expiry === "1h" ? 1 : 4) * 60 * 60 * 1000).toISOString();
}

export function isPresenceVisible(status: PresenceStatus | null | undefined, now: Date = new Date()): status is PresenceStatus {
  return Boolean(status && !status.cleared && (status.expiresAt === null || Date.parse(status.expiresAt) > now.getTime()));
}

export function energyToDatabase(energy: Energy): number {
  return ENERGIES.indexOf(energy) + 1;
}

/** Explicit fields only: do not forward actor/House IDs or server activity timestamps. */
export function presenceFromRow(row: Record<string, unknown>): PresenceStatus | null {
  if (
    typeof row.user_id !== "string" || !includes(MOODS, row.mood) ||
    typeof row.energy !== "number" || row.energy < 1 || row.energy > 3 || !Number.isInteger(row.energy) ||
    !includes(AVAILABILITIES, row.availability) || typeof row.note !== "string" || typeof row.need !== "string" ||
    (row.expires_at !== null && (typeof row.expires_at !== "string" || !Number.isFinite(Date.parse(row.expires_at)))) ||
    typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1 || typeof row.cleared !== "boolean"
  ) return null;
  return { userId: row.user_id, mood: row.mood, energy: ENERGIES[row.energy - 1]!, availability: row.availability, note: row.note, need: row.need, expiresAt: row.expires_at as string | null, version: row.version, cleared: row.cleared };
}
