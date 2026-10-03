import React from "react";
import { createRoot } from "react-dom/client";
import { IslandWorkspace } from "../../src/app/island/workspace";
import { clearAccountOfflineData } from "../../src/lib/offline/store";
import { deriveIslandState, type IslandEvent } from "../../src/modules/island/model";
import type { IslandTransport } from "../../src/modules/island/client";
import { gameActors, gameHouse, initialGame } from "../../src/modules/games/test-fixtures";
import type { GameSession } from "../../src/modules/games/model";

const query = new URLSearchParams(location.search);
const actor = gameActors[Number(query.get("actor") ?? 0)]!;
const context = { accountId: actor, houseId: gameHouse };
const time = "2026-10-02T09:00:00.000Z";
let blocked = false;
let fail = false;
const sessions: GameSession[] = [];
const events: IslandEvent[] = [];
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
Object.assign(window, { islandHarness: {
  complete: () => complete("Một chiếc lá mới"),
  block: () => { blocked = true; },
  fail: (value: boolean) => { fail = value; },
  logout: () => clearAccountOfflineData(actor),
} });
createRoot(document.getElementById("root")!).render(<IslandWorkspace context={context} initialView={null} transport={transport} />);
