import { expect, it } from "vitest";
import { gameActors, gameHouse } from "@/modules/games/test-fixtures";
import { islandCalendarDate, parseIslandEntry, parseIslandEntryCommand, parseIslandEntryReceipt, parseIslandJournalPage, type IslandEntry, type IslandEntryCommand } from "./journal";
export const journalEntry = (): IslandEntry => ({ id: crypto.randomUUID(), houseId: gameHouse, createdBy: gameActors[0], entryType: "memory", title: "Một chiếc lá", body: "Thỏ và Cú cùng giữ.", occurredOn: "2020-02-29", sourceSessionId: null, version: 1, createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z", trashedAt: null });
export const journalCommand = (entry = journalEntry()): IslandEntryCommand => ({ operationId: crypto.randomUUID(), entryId: entry.id, expectedVersion: 0, kind: "create", payload: { entryType: entry.entryType, title: entry.title, body: entry.body, occurredOn: entry.occurredOn, sourceSessionId: entry.sourceSessionId, confirmed: true } });
it("preserves calendar dates without timezone conversion and rejects impossible dates", () => {
  expect(islandCalendarDate("2020-02-29")).toBe(true); for (const date of ["2025-02-29", "2026-13-01", "2026-10-03T00:00:00Z", "2026-1-1"]) expect(islandCalendarDate(date)).toBe(false);
  expect(parseIslandEntry(journalEntry())?.occurredOn).toBe("2020-02-29");
});
it("validates explicit promotion and immutable source content at the boundary", () => {
  const command = journalCommand(); expect(parseIslandEntryCommand(command)).toEqual(command);
  if (command.kind !== "create") throw new Error("fixture");
  for (const input of [{ ...command, expectedVersion: 1 }, { ...command, level: 99 }, { ...command, payload: { ...command.payload, confirmed: false } }, { ...command, payload: { ...command.payload, title: " " } }, { ...command, payload: { ...command.payload, body: "x".repeat(4001) } }, { ...command, payload: { ...command.payload, entryType: "milestone", sourceSessionId: crypto.randomUUID() } }]) expect(parseIslandEntryCommand(input)).toBeNull();
  expect(parseIslandEntryCommand({ operationId: crypto.randomUUID(), entryId: command.entryId, expectedVersion: 1, kind: "update", payload: { title: "Changed", body: "", occurredOn: "2020-02-29", sourceSessionId: crypto.randomUUID() } })).toBeNull();
});
it("accepts exact receipts only for the bound operation, actor and requested content", () => {
  const entry = journalEntry(); const command = journalCommand(entry); const receipt = { entryId: entry.id, operationId: command.operationId, outcome: "applied", entry };
  expect(parseIslandEntryReceipt(receipt, command, gameHouse, gameActors[0])).not.toBeNull();
  for (const input of [{ ...receipt, operationId: crypto.randomUUID() }, { ...receipt, entry: { ...entry, houseId: crypto.randomUUID() } }, { ...receipt, entry: { ...entry, title: "Other title" } }, { ...receipt, entry: { ...entry, createdBy: gameActors[1] } }, { ...receipt, entry: { ...entry, version: 2 } }]) expect(parseIslandEntryReceipt(input, command, gameHouse, gameActors[0])).toBeNull();
});
it("rejects duplicate/cross-House journal pages and malformed progress-like row fields", () => {
  const entry = journalEntry(); expect(parseIslandJournalPage({ entries: [entry], next: null }, gameHouse)?.entries).toEqual([entry]);
  for (const page of [{ entries: [entry, entry], next: null }, { entries: [{ ...entry, houseId: crypto.randomUUID() }], next: null }, { entries: [{ ...entry, islandLevel: 999 }], next: null }, { entries: [entry], next: { id: "forged", createdAt: entry.createdAt } }]) expect(parseIslandJournalPage(page, gameHouse)).toBeNull();
});
