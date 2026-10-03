import { isUuid } from "@/modules/knocks/model";

export type IslandEntryType = "memory" | "milestone";
export type IslandEntry = {
  id: string; houseId: string; createdBy: string; entryType: IslandEntryType;
  title: string; body: string; occurredOn: string; sourceSessionId: string | null;
  version: number; createdAt: string; updatedAt: string; trashedAt: string | null;
};
export type IslandEntryContent = Pick<IslandEntry, "title" | "body" | "occurredOn">;
export type IslandEntryCommand = {
  operationId: string; entryId: string; expectedVersion: number;
} & (
  | { kind: "create"; payload: IslandEntryContent & { entryType: IslandEntryType; sourceSessionId: string | null; confirmed: boolean } }
  | { kind: "update"; payload: IslandEntryContent }
  | { kind: "trash" | "restore"; payload: Record<string, never> }
);
export type IslandEntryReceipt = { operationId: string; entryId: string; outcome: "applied" | "conflict"; entry: IslandEntry };
export type IslandJournalPage = { entries: IslandEntry[]; next: { createdAt: string; id: string } | null };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const keys = (input: Record<string, unknown>, expected: string[]) => Object.keys(input).sort().join() === expected.sort().join();
const instant = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) && Number.isFinite(Date.parse(value));
export const islandCalendarDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\d$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function content(value: unknown): boolean {
  return object(value) && typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 120 && typeof value.body === "string" && value.body.length <= 4000 && islandCalendarDate(value.occurredOn);
}
export function parseIslandEntry(value: unknown): IslandEntry | null {
  if (!object(value) || !keys(value, ["id", "houseId", "createdBy", "entryType", "title", "body", "occurredOn", "sourceSessionId", "version", "createdAt", "updatedAt", "trashedAt"]) || !isUuid(value.id) || !isUuid(value.houseId) || !isUuid(value.createdBy) || !["memory", "milestone"].includes(String(value.entryType)) || !content(value) || (value.sourceSessionId !== null && (!isUuid(value.sourceSessionId) || value.entryType !== "memory")) || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !instant(value.createdAt) || !instant(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt) || (value.trashedAt !== null && !instant(value.trashedAt))) return null;
  return { ...value, createdAt: new Date(value.createdAt).toISOString(), updatedAt: new Date(value.updatedAt).toISOString(), trashedAt: value.trashedAt === null ? null : new Date(value.trashedAt as string).toISOString() } as IslandEntry;
}
export function parseIslandEntryCommand(value: unknown): IslandEntryCommand | null {
  if (!object(value) || !keys(value, ["operationId", "entryId", "expectedVersion", "kind", "payload"]) || !isUuid(value.operationId) || !isUuid(value.entryId) || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0 || !object(value.payload)) return null;
  if (value.kind === "create") {
    if (value.expectedVersion !== 0 || !keys(value.payload, ["title", "body", "occurredOn", "entryType", "sourceSessionId", "confirmed"]) || !content(value.payload) || !["memory", "milestone"].includes(String(value.payload.entryType)) || typeof value.payload.confirmed !== "boolean" || (value.payload.entryType === "memory" && !value.payload.confirmed) || (value.payload.sourceSessionId !== null && (!isUuid(value.payload.sourceSessionId) || value.payload.entryType !== "memory"))) return null;
  } else if (value.kind === "update") {
    if (Number(value.expectedVersion) < 1 || !keys(value.payload, ["title", "body", "occurredOn"]) || !content(value.payload)) return null;
  } else if (value.kind === "trash" || value.kind === "restore") {
    if (Number(value.expectedVersion) < 1 || Object.keys(value.payload).length > 0) return null;
  } else return null;
  return structuredClone(value) as IslandEntryCommand;
}
export function parseIslandEntryReceipt(value: unknown, command: IslandEntryCommand, houseId: string, actorId?: string): IslandEntryReceipt | null {
  if (!object(value) || !keys(value, ["operationId", "entryId", "outcome", "entry"]) || value.operationId !== command.operationId || value.entryId !== command.entryId || !["applied", "conflict"].includes(String(value.outcome))) return null;
  const entry = parseIslandEntry(value.entry);
  if (!entry || entry.id !== command.entryId || entry.houseId !== houseId || (value.outcome === "applied" && entry.version !== command.expectedVersion + 1)) return null;
  if (value.outcome === "applied") {
    if ((command.kind === "create" || command.kind === "update") && (entry.title !== command.payload.title || entry.body !== command.payload.body || entry.occurredOn !== command.payload.occurredOn || entry.trashedAt !== null)) return null;
    if (command.kind === "create" && (entry.entryType !== command.payload.entryType || entry.sourceSessionId !== command.payload.sourceSessionId || actorId && entry.createdBy !== actorId)) return null;
    if (command.kind === "trash" && entry.trashedAt === null || command.kind === "restore" && entry.trashedAt !== null) return null;
  }
  return { operationId: command.operationId, entryId: command.entryId, outcome: value.outcome as "applied" | "conflict", entry };
}
export function parseIslandJournalPage(value: unknown, houseId: string): IslandJournalPage | null {
  if (!object(value) || !keys(value, ["entries", "next"]) || !Array.isArray(value.entries) || value.entries.length > 20) return null;
  const entries: IslandEntry[] = [];
  for (const item of value.entries) { const entry = parseIslandEntry(item); if (!entry || entry.houseId !== houseId || entries.some(previous => previous.id === entry.id)) return null; entries.push(entry); }
  if (value.next !== null && (!object(value.next) || !keys(value.next, ["createdAt", "id"]) || !instant(value.next.createdAt) || !isUuid(value.next.id))) return null;
  return { entries, next: value.next as IslandJournalPage["next"] };
}
