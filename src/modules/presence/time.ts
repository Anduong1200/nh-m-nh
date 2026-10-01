/** Accept named IANA zones rather than ambiguous UTC offsets. */
export function isValidTimeZone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(value)
  ) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function localDateNumber(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === name)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

/** The first instant after today's local date, including 23/25-hour DST days. */
export function endOfLocalDay(now: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid date or time zone.");
  }
  const currentDate = localDateNumber(now.getTime(), timeZone);
  let left = now.getTime();
  let right = left + 48 * 60 * 60 * 1000;
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    if (localDateNumber(middle, timeZone) > currentDate) right = middle;
    else left = middle;
  }
  return new Date(right).toISOString();
}

export function minutesInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}
