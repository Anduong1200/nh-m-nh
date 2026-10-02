import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { GAME_SCHEMA_VERSION, gameLocalId, gameReceipt, parseGameCommand, parseGameContext, parseGameSession, type GameCommand, type GameContext, type GameSession } from "./model";
import type { GameReadResult, GameWriteResult } from "./actions";
export type GameTransport = {
  read(sessionId: string,context: GameContext): Promise<GameReadResult>;
  apply(command: GameCommand,context: GameContext): Promise<GameWriteResult>;
};
export type GameSyncReport = {acknowledged:string[];conflicts:string[];blocked:string[];error?:string};
export type GameProposal = GameCommand extends infer C ? C extends GameCommand ? Omit<C,"operationId"> : never : never;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
/** Account/House-bound append queue. Stale turns require a new explicit proposal. */
export class GameSyncSession {
  private active = true;
  private running: Promise<GameSyncReport> | null = null;
  private readonly context: GameContext;
  constructor(context: GameContext,private readonly store: AccountOfflineStore,private readonly transport: GameTransport,private readonly online: () => boolean = () => true) {
    const parsed = parseGameContext(context);
    if (!parsed || parsed.accountId !== store.accountScope) throw new Error("Verified account/House and matching store required");
    this.context = Object.freeze(parsed);
  }
  stop() { this.active = false; }
  private async check() {
    if (!this.active) throw new Error("Sync stopped");
    await this.store.assertCurrent();
    if (!this.active) throw new Error("Sync stopped");
  }
  private visible(snapshot: GameSession) {
    return snapshot.houseId === this.context.houseId && snapshot.players.some(p => p.userId === this.context.accountId)
      && !(snapshot.gameType === "draw-guess" && snapshot.status === "active" && snapshot.createdBy !== this.context.accountId && snapshot.answer !== null);
  }
  async read(sessionId: string): Promise<GameSession | null> {
    await this.check();
    if (!this.online()) return this.cached(sessionId);
    const result = await this.transport.read(sessionId,this.context);
    await this.check();
    const snapshot = parseGameSession(result.snapshot);
    if (result.blocked || result.context?.accountId !== this.context.accountId || result.context.houseId !== this.context.houseId || !snapshot || snapshot.id !== sessionId || !this.visible(snapshot)) return null;
    await this.cache(snapshot);
    return snapshot;
  }
  async cached(sessionId: string) {
    await this.check();
    const row = (await this.store.listRecent()).find(r => r.id === gameLocalId(sessionId) && r.kind === "game" && r.houseId === this.context.houseId && r.schemaVersion === GAME_SCHEMA_VERSION);
    const snapshot = parseGameSession(row?.payload);
    return snapshot && snapshot.id === sessionId && this.visible(snapshot) ? snapshot : null;
  }
  private async cache(snapshot: GameSession) {
    const current = await this.cached(snapshot.id);
    // An exact retry may return an older receipt after a partner's newer turn.
    if (!current || current.version <= snapshot.version) await this.store.cacheRecent({id:gameLocalId(snapshot.id),houseId:this.context.houseId,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload:json(snapshot),serverVersion:snapshot.version});
  }
  async saveDraft(sessionId: string,payload: JsonValue,expectedVersion: number | null) {
    await this.check();
    return this.store.saveDraft({id:gameLocalId(sessionId),houseId:this.context.houseId,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload,expectedVersion});
  }
  async queue(input: GameProposal) {
    await this.check();
    if (!parseGameCommand({...input,operationId:crypto.randomUUID()})) throw new Error("Invalid game proposal");
    const pending = (await this.store.listOperations()).filter(o => o.entity === "game" && o.houseId === this.context.houseId && o.entityId === gameLocalId(input.sessionId));
    if (pending.length) throw new Error("Confirm or resolve the pending turn before another contribution");
    return this.store.enqueue({houseId:this.context.houseId,schemaVersion:GAME_SCHEMA_VERSION,entity:"game",entityId:gameLocalId(input.sessionId),mutation:"update",baseVersion:input.expectedVersion,payload:json(input)},true);
  }
  async resolveConflict(operationId: string,proposal: GameProposal) {
    await this.check();
    const original = (await this.store.listOperations()).find(o => o.operationId === operationId && o.entity === "game" && o.houseId === this.context.houseId);
    const snapshot = parseGameSession(original?.conflict?.remote);
    if (!original || !snapshot || proposal.kind === "create" || proposal.sessionId !== snapshot.id || proposal.expectedVersion !== snapshot.version || snapshot.turn?.userId !== this.context.accountId || !parseGameCommand({...proposal,operationId:crypto.randomUUID()})) throw new Error("Review the authoritative turn before proposing a resolution");
    return this.store.queueConflictReplacement(operationId,json(proposal),proposal.expectedVersion);
  }
  async keepRemote(operationId: string) {
    await this.check();
    const row = (await this.store.listOperations()).find(o => o.operationId === operationId && o.entity === "game" && o.houseId === this.context.houseId);
    if (!row?.conflict) throw new Error("Matching preserved conflict required");
    // The shared store archives every proposal as a recovery draft; it never discards the text/doodle.
    return this.store.keepRemoteConflict(operationId);
  }
  async exportLocal() {
    await this.check();
    return json({context:this.context,drafts:(await this.store.listDrafts()).filter(d => d.kind === "game" && d.houseId === this.context.houseId),operations:(await this.store.listOperations()).filter(o => o.entity === "game" && o.houseId === this.context.houseId)});
  }
  watchReconnect(sessionId: string,listener: (snapshot: GameSession | null,report: GameSyncReport) => void) {
    let closed = false; let again = false; let running = false;
    const refresh = async () => {
      if (closed || !this.active) return;
      if (running) {again = true; return;}
      running = true;
      try {
        do {
          again = false;
          const report = await this.drain();
          const snapshot = await this.read(sessionId);
          if (!closed && this.active) listener(snapshot,report);
        } while (again && !closed && this.active);
      } catch {if (!closed && this.active) listener(null,{acknowledged:[],conflicts:[],blocked:[],error:"Bản nháp vẫn được giữ. Có thể thử đồng bộ lại."});}
      finally {running = false;}
    };
    const visible = () => {if (document.visibilityState === "visible") void refresh();};
    window.addEventListener("online",refresh); window.addEventListener("focus",visible); document.addEventListener("visibilitychange",visible);
    void refresh();
    return () => {closed = true; window.removeEventListener("online",refresh); window.removeEventListener("focus",visible); document.removeEventListener("visibilitychange",visible);};
  }
  drain(): Promise<GameSyncReport> {
    this.running ??= this.run().finally(() => {this.running = null;});
    return this.running;
  }
  private async run(): Promise<GameSyncReport> {
    const report: GameSyncReport = {acknowledged:[],conflicts:[],blocked:[]};
    const held = new Set<string>();
    try {
      await this.check();
      if (!this.online()) return report;
      const queue = (await this.store.listOperations()).filter(o => o.entity === "game" && o.houseId === this.context.houseId).sort((a,b) => (a.sequence ?? 0)-(b.sequence ?? 0));
      for (const row of queue) {
        const payload = typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload) ? row.payload : {};
        const command = parseGameCommand({...payload,operationId:row.operationId});
        const ancestor = row.resolutionOf ? queue.find(o => o.operationId === row.resolutionOf && o.state === "conflict" && o.entityId === row.entityId && o.resolutionOperationId === row.operationId) : null;
        if (!command || row.accountId !== this.context.accountId || row.schemaVersion !== GAME_SCHEMA_VERSION || row.mutation !== "update" || row.baseVersion !== command.expectedVersion || row.entityId !== gameLocalId(command.sessionId) || row.state === "conflict" || held.has(row.entityId) && !ancestor || row.resolutionOf && !ancestor) {
          report.blocked.push(row.operationId); held.add(row.entityId); continue;
        }
        await this.check();
        if (!this.online()) break;
        // The authenticated action and transactional RPC re-authorize even creations and retries.
        const result = await this.transport.apply(command,this.context);
        await this.check();
        const receipt = result.blocked ? null : gameReceipt(result.receipt,this.context,command);
        if (!receipt) {report.error = "Chưa xác nhận được lượt chơi. Hàng đợi vẫn được giữ."; break;}
        await this.cache(receipt.snapshot);
        if (receipt.outcome === "conflict") {
          await this.store.preserveConflict(row.operationId,json(receipt.snapshot),receipt.snapshot.version);
          report.conflicts.push(row.operationId); held.add(row.entityId); continue;
        }
        await this.check();
        await this.store.acknowledgeOperation(row.operationId);
        report.acknowledged.push(row.operationId);
      }
    } catch {report.error = "Đồng bộ đang tạm dừng. Bản nháp và hàng đợi vẫn được giữ.";}
    return report;
  }
}
