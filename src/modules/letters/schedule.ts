/** Minute-precision wall time → explicit UTC instant. Never silently fix DST gaps. */
export type LetterSchedule = { mode: "scheduled"; deliverAt: string; localDateTime: string; timeZone: string };
export type LetterDelivery = { mode: "immediate" } | LetterSchedule;
export type ScheduleResolution = { kind: "valid"; instants: string[] } | { kind: "invalid" | "gap"; instants: [] };
export function resolveLetterTime(local: string, timeZone: string): ScheduleResolution {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/u.test(local) || local.slice(0, 4) < "2000" || local.slice(0, 4) > "2100") return { kind: "invalid", instants: [] };
  const base = Date.parse(local + ":00Z");
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== local) return { kind: "invalid", instants: [] };
  try {
    if (!timeZone || timeZone.length > 100) return { kind: "invalid", instants: [] };
    const format = new Intl.DateTimeFormat("en-CA", { timeZone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const wall = (instant: number) => {
      const parts = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    };
    const offsets = new Set<number>();
    for (let hours = -36; hours <= 36; hours += 6) {
      const instant = base + hours * 3600000;
      offsets.add(Date.parse(wall(instant) + "Z") - instant);
    }
    const instants = [...offsets].map(offset => base - offset).filter(instant => wall(instant) === local + ":00").sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
    return instants.length ? { kind: "valid", instants } : { kind: "gap", instants: [] };
  } catch { return { kind: "invalid", instants: [] }; }
}
export function makeLetterSchedule(localDateTime: string, timeZone: string, choice?: "earlier" | "later"): LetterSchedule {
  const result = resolveLetterTime(localDateTime, timeZone);
  if (result.kind !== "valid") throw new Error(result.kind === "gap" ? "This local time does not exist" : "Invalid local time or timezone");
  if (result.instants.length > 1 && choice === undefined) throw new Error("Choose an explicit instant for this repeated local time");
  const deliverAt = choice === "later" ? result.instants.at(-1)! : result.instants[0]!;
  return { mode: "scheduled", deliverAt, localDateTime, timeZone };
}
export function parseLetterDelivery(input: unknown): LetterDelivery | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.mode === "immediate" && Object.keys(value).length === 1) return { mode: "immediate" };
  if (value.mode !== "scheduled" || Object.keys(value).sort().join() !== "deliverAt,localDateTime,mode,timeZone" || typeof value.deliverAt !== "string" || typeof value.localDateTime !== "string" || typeof value.timeZone !== "string") return null;
  const resolution = resolveLetterTime(value.localDateTime, value.timeZone);
  if (resolution.kind !== "valid" || !resolution.instants.includes(value.deliverAt)) return null;
  return { mode: "scheduled", deliverAt: value.deliverAt, localDateTime: value.localDateTime, timeZone: value.timeZone };
}
