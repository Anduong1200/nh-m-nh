import { parseGameSession, type GameSession } from "@/modules/games/model";
import { parseLetter, type Letter } from "@/modules/letters/model";
import { parseIslandEntry, type IslandEntry } from "@/modules/island/journal";
import type { OfflineRecoveryContext, RecentContent } from "./store";
import { RECENT_CONTENT_MAX_AGE_MS } from "./store";

/** Validate each cached actor projection again; the local clock never reveals a letter. */
export function recoverRecentContent(rows: RecentContent[], context: OfflineRecoveryContext, now = Date.now()) {
  const letters: Letter[] = [], games: GameSession[] = [], entries: IslandEntry[] = [];
  for (const row of rows) {
    const age = now - Date.parse(row.cachedAt);
    if (row.accountId !== context.accountId || row.houseId !== context.houseId || !Number.isFinite(age) || age < -300_000 || age > RECENT_CONTENT_MAX_AGE_MS || row.schemaVersion !== 1) continue;
    if (row.kind === "letter") {
      const letter = parseLetter(row.payload, context);
      if (letter && row.id === `letter:${letter.id}` && row.serverVersion === letter.version) letters.push(letter);
    } else if (row.kind === "game") {
      const game = parseGameSession(row.payload);
      if (game && game.houseId === context.houseId && game.players.some(player => player.userId === context.accountId) && row.id === `game:${game.id}` && row.serverVersion === game.version) games.push(game);
    } else if (row.kind === "island") {
      const entry = parseIslandEntry(row.payload);
      if (entry && entry.houseId === context.houseId && !entry.trashedAt && row.id === `island-entry:${entry.id}` && row.serverVersion === entry.version) entries.push(entry);
    }
  }
  return { letters, games, entries };
}
