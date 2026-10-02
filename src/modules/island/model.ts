import { isUuid } from "@/modules/knocks/model";

export const ISLAND_RULES_VERSION = 1;
export const ISLAND_EVENT_TYPES = ["GAME_COMPLETED", "MEMORY_CREATED", "MISSION_COMPLETED", "MILESTONE_CREATED", "WEEKLY_ACTIVITY"] as const;
export type IslandEventType = typeof ISLAND_EVENT_TYPES[number];
type EventIdentity = { readonly id: string; readonly houseId: string; readonly createdAt: string };
export type IslandEvent = EventIdentity & (
  | { readonly type: "GAME_COMPLETED" | "MISSION_COMPLETED"; readonly sourceType: "game-artifact"; readonly sourceId: string }
  | { readonly type: "MEMORY_CREATED"; readonly sourceType: "confirmed-memory"; readonly sourceId: string }
  | { readonly type: "MILESTONE_CREATED"; readonly sourceType: "milestone"; readonly sourceId: string }
  | { readonly type: "WEEKLY_ACTIVITY"; readonly sourceType: "activity-week"; readonly sourceId: string }
);
export type IslandState = {
  readonly houseId: string;
  readonly rulesVersion: typeof ISLAND_RULES_VERSION;
  /** Number of unique persisted events, not a level or score. */
  readonly version: number;
  readonly updatedAt: string | null;
  readonly historyItems: number;
  readonly contributions: Readonly<Record<IslandEventType, number>>;
  readonly world: {
    readonly sharedHistory: boolean;
    readonly memories: boolean;
    readonly missions: boolean;
    readonly milestones: boolean;
    readonly weeklyHistory: boolean;
  };
};
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) && Number.isFinite(Date.parse(value));
export function activityWeek(instant: string): string {
  if (!timestamp(instant)) throw new Error("Invalid activity timestamp");
  const date = new Date(instant);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function parseIslandEvent(value: unknown): IslandEvent | null {
  if (!object(value) || Object.keys(value).sort().join() !== "createdAt,houseId,id,sourceId,sourceType,type" || !isUuid(value.id) || !isUuid(value.houseId) || !timestamp(value.createdAt)) return null;
  const source = value.type === "GAME_COMPLETED" || value.type === "MISSION_COMPLETED" ? "game-artifact" : value.type === "MEMORY_CREATED" ? "confirmed-memory" : value.type === "MILESTONE_CREATED" ? "milestone" : value.type === "WEEKLY_ACTIVITY" ? "activity-week" : null;
  if (source === null || value.sourceType !== source) return null;
  if (source === "activity-week") {
    if (typeof value.sourceId !== "string" || value.sourceId !== activityWeek(value.createdAt)) return null;
  } else if (!isUuid(value.sourceId)) return null;
  return value as IslandEvent;
}
/** Deterministic reference projection for trusted events. This does not authorize writes. */
export function deriveIslandState(houseId: string, input: readonly IslandEvent[]): IslandState {
  if (!isUuid(houseId)) throw new Error("Invalid House");
  const events = new Map<string, IslandEvent>();
  const ids = new Map<string, string>();
  for (const value of input) {
    const event = parseIslandEvent(value);
    if (!event || event.houseId !== houseId) throw new Error("Invalid or cross-House event");
    const key = `${event.type}:${event.sourceType}:${event.sourceId.toLowerCase()}`;
    if (ids.has(event.id.toLowerCase()) && ids.get(event.id.toLowerCase()) !== key) throw new Error("Conflicting event identity");
    ids.set(event.id.toLowerCase(), key);
    const previous = events.get(key);
    if (previous && (previous.id !== event.id || Date.parse(previous.createdAt) !== Date.parse(event.createdAt))) throw new Error("Conflicting event identity");
    events.set(key, event);
  }
  const contributions = Object.fromEntries(ISLAND_EVENT_TYPES.map(type => [type, 0])) as Record<IslandEventType, number>;
  const history = new Set<string>();
  let latest: number | null = null;
  for (const event of events.values()) {
    if (event.type === "MISSION_COMPLETED" && !events.has(`GAME_COMPLETED:game-artifact:${event.sourceId.toLowerCase()}`)) throw new Error("Missing game completion");
    contributions[event.type]++;
    if (event.type !== "WEEKLY_ACTIVITY") history.add(`${event.sourceType}:${event.sourceId.toLowerCase()}`);
    latest = Math.max(latest ?? -Infinity, Date.parse(event.createdAt));
  }
  return {
    houseId, rulesVersion: ISLAND_RULES_VERSION, version: events.size,
    updatedAt: latest === null ? null : new Date(latest).toISOString(), historyItems: history.size, contributions,
    world: {
      sharedHistory: history.size > 0, memories: contributions.MEMORY_CREATED > 0,
      missions: contributions.MISSION_COMPLETED > 0, milestones: contributions.MILESTONE_CREATED > 0,
      weeklyHistory: contributions.WEEKLY_ACTIVITY > 0,
    },
  };
}
export function parseIslandState(value: unknown): IslandState | null {
  if (!object(value) || Object.keys(value).sort().join() !== "contributions,historyItems,houseId,rulesVersion,updatedAt,version,world" || !isUuid(value.houseId) || value.rulesVersion !== ISLAND_RULES_VERSION || !count(value.version) || !count(value.historyItems) || (value.updatedAt !== null && !timestamp(value.updatedAt)) || !object(value.contributions) || !object(value.world)) return null;
  if (Object.keys(value.contributions).sort().join() !== [...ISLAND_EVENT_TYPES].sort().join() || !ISLAND_EVENT_TYPES.every(type => count((value.contributions as Record<string, unknown>)[type]))) return null;
  const c = value.contributions as Record<IslandEventType, number>;
  const total = ISLAND_EVENT_TYPES.reduce((sum, type) => sum + c[type], 0);
  const historyItems = c.GAME_COMPLETED + c.MEMORY_CREATED + c.MILESTONE_CREATED;
  // V1 missions are a subset of completed Photo Mission games.
  if (!count(total) || total !== value.version || c.MISSION_COMPLETED > c.GAME_COMPLETED || c.WEEKLY_ACTIVITY > historyItems || value.historyItems !== historyItems || (total === 0) !== (value.updatedAt === null)) return null;
  const world = { sharedHistory: historyItems > 0, memories: c.MEMORY_CREATED > 0, missions: c.MISSION_COMPLETED > 0, milestones: c.MILESTONE_CREATED > 0, weeklyHistory: c.WEEKLY_ACTIVITY > 0 };
  if (Object.keys(value.world).sort().join() !== Object.keys(world).sort().join() || !Object.entries(world).every(([key, flag]) => (value.world as Record<string, unknown>)[key] === flag)) return null;
  return { houseId: value.houseId, rulesVersion: ISLAND_RULES_VERSION, version: total, historyItems, contributions: { ...c }, world, updatedAt: value.updatedAt === null ? null : new Date(value.updatedAt as string).toISOString() };
}
