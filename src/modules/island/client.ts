import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { parseGameContext, parseGameSession, type GameContext, type GameSession } from "@/modules/games/model";
import { parseIslandState, type IslandState } from "./model";

export type IslandView = { state: IslandState; artifacts: GameSession[] };
export type IslandTransport = {
  read(context: GameContext): Promise<{ context?: GameContext; state?: IslandState; error?: string; blocked?: boolean }>;
  list(context: GameContext): Promise<{ context?: GameContext; sessions?: GameSession[]; error?: string; blocked?: boolean }>;
};
export type IslandRefresh = { view?: IslandView; cached: boolean; error?: string; blocked?: boolean };
const cacheId = (houseId: string) => `island:${houseId}`;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

/** A read projection only. Neither artifacts nor cached counters authorize an event. */
export function parseIslandView(value: unknown, context: GameContext): IslandView | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join() !== "artifacts,state") return null;
  const state = parseIslandState(input.state);
  if (!state || state.houseId !== context.houseId || !Array.isArray(input.artifacts) || input.artifacts.length > 20 || input.artifacts.length > state.contributions.GAME_COMPLETED) return null;
  const artifacts: GameSession[] = [];
  for (const item of input.artifacts) {
    const session = parseGameSession(item);
    if (!session || session.houseId !== context.houseId || session.status !== "completed" || !session.players.some(player => player.userId === context.accountId) || artifacts.some(previous => previous.id === session.id)) return null;
    artifacts.push(session);
  }
  return { state, artifacts };
}

/** Same account/House, bounded recent reads; offline never invents world growth. */
export class IslandClient {
  private active = true;
  private readonly context: GameContext;
  constructor(context: GameContext, private readonly store: AccountOfflineStore, private readonly transport: IslandTransport, private readonly online: () => boolean = () => true) {
    const parsed = parseGameContext(context);
    if (!parsed || parsed.accountId !== store.accountScope) throw new Error("Matching account and House required");
    this.context = Object.freeze(parsed);
  }
  stop() { this.active = false; }
  private async check() {
    if (!this.active) throw new Error("Island stopped");
    await this.store.assertCurrent();
    if (!this.active) throw new Error("Island stopped");
  }
  async cached(): Promise<IslandView | null> {
    await this.check();
    const row = (await this.store.listRecent()).find(item => item.id === cacheId(this.context.houseId) && item.kind === "island" && item.houseId === this.context.houseId && item.schemaVersion === 1);
    return parseIslandView(row?.payload, this.context);
  }
  async remember(value: IslandView): Promise<IslandView> {
    await this.check();
    const view = parseIslandView(value, this.context);
    if (!view) throw new Error("Invalid authorized Island snapshot");
    await this.store.cacheRecent({ id: cacheId(this.context.houseId), kind: "island", houseId: this.context.houseId, schemaVersion: 1, serverVersion: view.state.version, payload: json(view) });
    await this.check();
    return (await this.cached()) ?? view;
  }
  async refresh(): Promise<IslandRefresh> {
    await this.check();
    if (!this.online()) {
      const view = await this.cached();
      return { ...(view ? { view } : {}), cached: true, ...(!view ? { error: "Chưa có bản Đảo được lưu trên thiết bị này." } : {}) };
    }
    const [projection, games] = await Promise.all([this.transport.read(this.context), this.transport.list(this.context)]);
    await this.check();
    const changedContext = [projection.context, games.context].some(context => context && (context.accountId !== this.context.accountId || context.houseId !== this.context.houseId));
    if (projection.blocked || games.blocked || changedContext) { this.stop(); return { cached: false, blocked: true, error: "Cần xác nhận lại quyền vào Nhà." }; }
    if (projection.context?.accountId !== this.context.accountId || projection.context.houseId !== this.context.houseId || games.context?.accountId !== this.context.accountId || games.context.houseId !== this.context.houseId) {
      const view = await this.cached();
      return { ...(view ? { view } : {}), cached: !!view, error: "Chưa xác nhận được Đảo. Bạn có thể thử lại." };
    }
    const sessions = games.sessions?.map(parseGameSession);
    const validSessions = sessions && sessions.length <= 20 && sessions.every(session => session !== null && session.houseId === this.context.houseId && session.players.some(player => player.userId === this.context.accountId));
    const view = validSessions ? parseIslandView({ state: projection.state, artifacts: sessions.filter(session => session?.status === "completed") }, this.context) : null;
    if (!view) {
      const previous = await this.cached();
      return { ...(previous ? { view: previous } : {}), cached: !!previous, error: "Chưa tải được lịch sử Đảo. Bạn có thể thử lại." };
    }
    return { view: await this.remember(view), cached: false };
  }
}
