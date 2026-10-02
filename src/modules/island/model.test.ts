import { expect, it } from "vitest";
import { activityWeek, deriveIslandState, parseIslandEvent, parseIslandState, type IslandEvent } from "./model";
const house = "11111111-1111-4111-8111-111111111111";
const source = "22222222-2222-4222-8222-222222222222";
const game: IslandEvent = { id: crypto.randomUUID(), houseId: house, type: "GAME_COMPLETED", sourceType: "game-artifact", sourceId: source, createdAt: "2026-10-04T23:59:00Z" };
const mission: IslandEvent = { ...game, id: crypto.randomUUID(), type: "MISSION_COMPLETED" };
const week: IslandEvent = { ...game, id: crypto.randomUUID(), type: "WEEKLY_ACTIVITY", sourceType: "activity-week", sourceId: "2026-09-28" };
it("has an empty private world without a fabricated level", () => {
  const state = deriveIslandState(house, []);
  expect(state).toMatchObject({ version: 0, historyItems: 0, updatedAt: null, world: { sharedHistory: false, memories: false, missions: false, milestones: false, weeklyHistory: false } });
  expect(parseIslandState(state)).toEqual(state);
  expect(state).not.toHaveProperty("islandLevel");
});
it("is order-independent, retry-idempotent and counts Photo Mission once", () => {
  const state = deriveIslandState(house, [game, mission, week]);
  expect(deriveIslandState(house, [week, mission, game, game])).toEqual(state);
  expect(state).toMatchObject({ version: 3, historyItems: 1, contributions: { GAME_COMPLETED: 1, MISSION_COMPLETED: 1, WEEKLY_ACTIVITY: 1 }, world: { missions: true, sharedHistory: true } });
  expect(parseIslandState(state)).toEqual(state);
});
it("confirmed Memory and Milestone contracts add history without changing game counts", () => {
  const memory: IslandEvent = { ...game, id: crypto.randomUUID(), type: "MEMORY_CREATED", sourceType: "confirmed-memory" };
  const milestone: IslandEvent = { ...game, id: crypto.randomUUID(), type: "MILESTONE_CREATED", sourceType: "milestone" };
  const state = deriveIslandState(house, [game, memory, milestone]);
  expect(state).toMatchObject({ historyItems: 3, world: { memories: true, milestones: true }, contributions: { GAME_COMPLETED: 1 } });
  expect(parseIslandState(state)).toEqual(state);
});
it("does not decay or use the current clock; appended history only grows flags", () => {
  const before = deriveIslandState(house, [game, week]);
  const after = deriveIslandState(house, [game, week, { ...game, id: crypto.randomUUID(), sourceId: crypto.randomUUID(), createdAt: "2030-01-01T00:00:00Z" }]);
  expect(after.historyItems).toBeGreaterThan(before.historyItems);
  expect(after.world).toEqual(before.world);
  expect(deriveIslandState(house, [game, week])).toEqual(before);
});
it.each(["2026-10-04T23:59:59Z", "2026-10-05T06:59:59+07:00"])("uses UTC Monday weeks for %s", date => expect(activityWeek(date)).toBe("2026-09-28"));
it("changes week exactly on Monday UTC, including ISO year boundary", () => {
  expect(activityWeek("2026-10-05T00:00:00Z")).toBe("2026-10-05");
  expect(activityWeek("2027-01-01T00:00:00Z")).toBe("2026-12-28");
  expect(() => activityWeek("tomorrow")).toThrow();
});
it("rejects cross-House, conflicting identities, unknown types and unbacked mission", () => {
  expect(() => deriveIslandState(house, [{ ...game, houseId: crypto.randomUUID() }])).toThrow();
  expect(() => deriveIslandState(house, [game, { ...game, id: crypto.randomUUID() }])).toThrow();
  expect(() => deriveIslandState(house, [game, { ...game, sourceId: crypto.randomUUID() }])).toThrow();
  expect(() => deriveIslandState(house, [mission])).toThrow();
  expect(parseIslandEvent({ ...game, type: "LOGIN" })).toBeNull();
  expect(parseIslandEvent({ ...game, payload: "private story" })).toBeNull();
  expect(parseIslandEvent({ ...week, sourceId: "2026-10-05" })).toBeNull();
});
it("rejects fabricated counters, level fields, future rules and inconsistent world flags", () => {
  const state = deriveIslandState(house, [game, week]);
  for (const changed of [{ ...state, islandLevel: 999 }, { ...state, version: 99 }, { ...state, rulesVersion: 2 }, { ...state, historyItems: 99 }, { ...state, world: { ...state.world, memories: true } }, { ...state, contributions: { ...state.contributions, MISSION_COMPLETED: 2 } }]) expect(parseIslandState(changed)).toBeNull();
});
