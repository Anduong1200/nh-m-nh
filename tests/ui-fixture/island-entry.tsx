import React from "react";
import { createRoot } from "react-dom/client";
import { IslandWorkspace } from "../../src/app/island/workspace";
import { clearAccountOfflineData } from "../../src/lib/offline/store";
import { deriveIslandState, type IslandEvent } from "../../src/modules/island/model";
import type { IslandTransport } from "../../src/modules/island/client";
import { gameActors, gameHouse, initialGame } from "../../src/modules/games/test-fixtures";
import type { GameSession } from "../../src/modules/games/model";
import { parseIslandEntryCommand, type IslandEntry, type IslandEntryReceipt } from "../../src/modules/island/journal";
import type { IslandJournalTransport } from "../../src/modules/island/journal-client";

const query = new URLSearchParams(location.search);
const actor = gameActors[Number(query.get("actor") ?? 0)]!;
const context = { accountId: actor, houseId: gameHouse };
const time = "2026-10-02T09:00:00.000Z";
let blocked = false;
let fail = false;
const sessions: GameSession[] = [];
const events: IslandEvent[] = [];
const entries: IslandEntry[] = [];
const receipts = new Map<string, { command: string; receipt: IslandEntryReceipt }>();
let loseWriteReply = false;
function complete(prompt = "Một chuyến đi nhỏ") {
  const base = initialGame();
  const gameEvents = gameActors.map((actorId, index) => ({ sequence: index + 1, actorId, operationId: crypto.randomUUID(), createdAt: time, kind: "line" as const, payload: { text: index === 0 ? "Thỏ đi tìm lá." : "Cú tìm thấy Nhà." } }));
  sessions.push({ ...base, prompt, status: "completed", version: 3, turn: null, events: gameEvents, artifact: { sessionId: base.id, gameType: base.gameType, events: gameEvents, answer: null } });
  events.push({ id: crypto.randomUUID(), houseId: gameHouse, createdAt: time, type: "GAME_COMPLETED", sourceType: "game-artifact", sourceId: base.id });
}
if (query.get("empty") !== "1") complete();
const transport: IslandTransport = {
  read: async () => blocked ? { blocked: true } : fail ? { error: "Fixture network failure" } : { context, state: deriveIslandState(gameHouse, events) },
  list: async () => blocked ? { blocked: true } : fail ? { error: "Fixture network failure" } : { context, sessions },
};
const journalTransport: IslandJournalTransport = {
  read: async (_context, cursor) => blocked ? { blocked: true } : fail ? { error: "Fixture network failure" } : { context, page: { entries: [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).filter(e => !cursor || e.createdAt < cursor.createdAt || e.createdAt === cursor.createdAt && e.id < cursor.id).slice(0, 20), next: null } },
  entry: async id => { const entry = entries.find(entry => entry.id === id); return blocked ? { blocked: true } : { context, ...(entry ? { entry } : {}) }; },
  write: async input => {
    if (blocked) return { blocked: true }; if (fail) return { error: "Fixture network failure" };
    const command = parseIslandEntryCommand(input); if (!command) return { rejected: true, error: "Invalid command" };
    const previous = receipts.get(command.operationId);
    if (previous) return previous.command === JSON.stringify(command) ? { receipt: previous.receipt } : { error: "Immutable retry", rejected: true };
    let entry = entries.find(entry => entry.id === command.entryId); let outcome: "applied" | "conflict" = "applied";
    if (command.kind === "create") {
      if (entry || command.payload.sourceSessionId && entries.some(e => e.sourceSessionId === command.payload.sourceSessionId)) return { error: "Tác phẩm này đã có kỷ niệm.", rejected: true };
      entry = { id: command.entryId, houseId: gameHouse, createdBy: actor, ...command.payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), trashedAt: null, version: 1 };
      // `confirmed` is command input, never part of an authorized row DTO.
      delete (entry as IslandEntry & { confirmed?: boolean }).confirmed;
      entries.push(entry);
      events.push({ id: crypto.randomUUID(), houseId: gameHouse, createdAt: entry.createdAt, type: entry.entryType === "memory" ? "MEMORY_CREATED" : "MILESTONE_CREATED", sourceType: entry.entryType === "memory" ? "confirmed-memory" : "milestone", sourceId: entry.id } as IslandEvent);
    } else {
      if (!entry) return { error: "Missing page", rejected: true };
      if (command.kind !== "update" && entry.createdBy !== actor) return { blocked: true };
      if (entry.version !== command.expectedVersion || (command.kind === "restore" ? !entry.trashedAt : !!entry.trashedAt)) outcome = "conflict";
      else {
        if (command.kind === "update") Object.assign(entry, command.payload);
        else entry.trashedAt = command.kind === "trash" ? new Date().toISOString() : null;
        entry.version++; entry.updatedAt = new Date().toISOString();
      }
    }
    const receipt: IslandEntryReceipt = { operationId: command.operationId, entryId: command.entryId, outcome, entry: structuredClone(entry) };
    receipts.set(command.operationId, { command: JSON.stringify(command), receipt });
    if (loseWriteReply) { loseWriteReply = false; return { error: "Không nhận được phản hồi." }; }
    return { receipt };
  },
};
Object.assign(window, { islandHarness: {
  complete: () => complete("Một chiếc lá mới"),
  block: () => { blocked = true; },
  fail: (value: boolean) => { fail = value; },
  logout: () => clearAccountOfflineData(actor),
  loseWriteReply: () => { loseWriteReply = true; },
  entries: () => structuredClone(entries),
  partnerEdit: (id: string) => { const entry = entries.find(e => e.id === id); if (entry) { entry.title = "Bản mới từ người kia"; entry.body = "Giữ nội dung của cả hai."; entry.version++; entry.updatedAt = new Date().toISOString(); } },
} });
createRoot(document.getElementById("root")!).render(<IslandWorkspace context={context} initialView={null} transport={transport} journalTransport={journalTransport} />);
