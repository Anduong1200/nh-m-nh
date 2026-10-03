import { AccountOfflineStore, type JsonValue, type QueuedOperation } from "@/lib/offline/store";
import { BOARD_SCHEMA_VERSION, boardItemFromRow, boardReceiptFromData, parseBoardContext, parseBoardItemInput, parseBoardItemUpdate, validBoardPayload, type BoardContext, type BoardItem, type BoardMutation, type BoardReceipt } from "./model";

export type BoardSyncTransport = {
  snapshot(context: BoardContext): Promise<{ context?: BoardContext; items?: BoardItem[]; error?: string; blocked?: boolean }>;
  apply(operation: BoardMutation, context: BoardContext): Promise<{ receipt?: BoardReceipt; error?: string; blocked?: boolean }>;
};
export type BoardSyncReport = { acknowledged: string[]; conflicts: string[]; blocked: string[]; error?: string };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
function rowOf(item: BoardItem) {
  return { id: item.id, house_id: item.houseId, created_by: item.createdBy, type: item.type, payload: item.payload,
    media_id: item.mediaId ?? null, x: item.x, y: item.y, rotation: item.rotation, z_index: item.zIndex, version: item.version,
    created_at: item.createdAt, updated_at: item.updatedAt, deleted_at: item.deletedAt };
}
function validItem(item: BoardItem): boolean { return !!boardItemFromRow(rowOf(item)); }
function mutation(operation: QueuedOperation): BoardMutation | null {
  if (!operation.payload || typeof operation.payload !== "object" || Array.isArray(operation.payload)) return null;
  const { boardType, ...payload } = operation.payload;
  const input = { ...payload, id: operation.entityId, operationId: operation.operationId };
  if (operation.mutation === "append") {
    const value = parseBoardItemInput(input).value;
    if (!value || (operation.entity === "board" ? value.type === "note" || value.type === "doodle" : value.type !== operation.entity)) return null;
    const { id, operationId, ...data } = value;
    return { id, operationId, data, mutation: "append", expectedVersion: 0 };
  }
  const value = parseBoardItemUpdate({ ...input, expectedVersion: operation.baseVersion }).value;
  if (!value || value.deleted !== undefined) return null; // Trash/restore require an online, explicit interaction.
  if (operation.entity === "board" && (!["link","photo","voice"].includes(String(boardType)) || !validBoardPayload(boardType,value.payload,value.mediaId))) return null;
  const { id, operationId, expectedVersion, ...data } = value;
  return { id, operationId, expectedVersion, data, mutation: "update" };
}

/** UI supplies authenticated server-action adapters. No polling loop or auth token is stored here. */
export class BoardSyncSession {
  private active = true;
  private running: Promise<BoardSyncReport> | null = null;
  private readonly context: BoardContext;
  constructor(context: BoardContext, private readonly store: AccountOfflineStore,
    private readonly transport: BoardSyncTransport, private readonly canProceed: () => boolean = () => true) {
    const binding = parseBoardContext(context);
    if (!binding || binding.accountId !== store.accountScope) throw new Error("A verified account/House and matching account store are required.");
    this.context = Object.freeze(binding);
  }
  stop() { this.active = false; }
  drain(): Promise<BoardSyncReport> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async check() {
    if (!this.active || !this.canProceed()) throw new Error("Sync paused");
    await this.store.assertCurrent();
    if (!this.active || !this.canProceed()) throw new Error("Sync paused");
  }
  private async run(): Promise<BoardSyncReport> {
    const report: BoardSyncReport = { acknowledged: [], conflicts: [], blocked: [] };
    try {
      await this.check();
      const operations = (await this.store.listOperations()).filter(o => o.entity === "note" || o.entity === "doodle" || o.entity === "board").sort((a,b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.operationId.localeCompare(b.operationId));
      const held = new Set(operations.filter((o) => o.houseId === this.context.houseId && (o.state === "conflict" || o.schemaVersion !== BOARD_SCHEMA_VERSION)).map((o) => o.entityId));
      for (const queued of operations) {
        if (queued.houseId !== this.context.houseId) continue; // Never rebind another House's work.
        if (queued.accountId !== this.context.accountId || queued.schemaVersion !== BOARD_SCHEMA_VERSION || queued.state === "conflict" || (held.has(queued.entityId) && !queued.resolutionOf)) {
          report.blocked.push(queued.operationId); continue;
        }
        const operation = mutation(queued);
        if (!operation) { held.add(queued.entityId); report.blocked.push(queued.operationId); continue; }
        await this.check();
        const snapshot = await this.transport.snapshot(this.context);
        await this.check();
        if (snapshot.blocked || snapshot.context?.accountId !== this.context.accountId || snapshot.context.houseId !== this.context.houseId || !snapshot.items || snapshot.items.some((i) => !validItem(i) || i.houseId !== this.context.houseId)) {
          report.error = "Chưa xác nhận được phiên đăng nhập và Nhà. Hàng đợi vẫn được giữ."; break;
        }
        for (const item of snapshot.items) {
          await this.store.cacheRecent({ id: item.id, houseId: item.houseId, schemaVersion: BOARD_SCHEMA_VERSION, kind: item.type === "note" || item.type === "doodle" ? item.type : "board", payload: json(item), serverVersion: item.version });
        }
        const result = await this.transport.apply(operation, this.context);
        await this.check();
        const raw = result.receipt;
        const receipt = raw && !result.blocked ? boardReceiptFromData({ operation_id: raw.operationId, actor_id: raw.actorId, house_id: raw.houseId, outcome: raw.outcome, item: rowOf(raw.item) }, this.context, operation) : null;
        const expectedType = queued.entity === "board" ? queued.mutation === "append" ? operation.data.type : queued.payload && typeof queued.payload === "object" && !Array.isArray(queued.payload) ? queued.payload.boardType : null : queued.entity;
        if (!receipt || receipt.operationId !== queued.operationId || receipt.actorId !== this.context.accountId || receipt.houseId !== this.context.houseId || receipt.item.id !== queued.entityId || receipt.item.houseId !== this.context.houseId || receipt.item.type !== expectedType || !validItem(receipt.item)) {
          report.error = "Chưa xác nhận được lần lưu. Hàng đợi vẫn được giữ."; break;
        }
        if (receipt.outcome === "conflict") {
          await this.store.preserveConflict(queued.operationId, json(receipt.item), receipt.item.version);
          held.add(queued.entityId); report.conflicts.push(queued.operationId); continue;
        }
        if (receipt.outcome !== "applied" || (operation.mutation === "append" && receipt.item.createdBy !== this.context.accountId)) { report.error = "Kết quả lưu không hợp lệ."; break; }
        await this.store.cacheRecent({ id: receipt.item.id, houseId: receipt.item.houseId, schemaVersion: BOARD_SCHEMA_VERSION, kind: queued.entity,
          payload: json(receipt.item), serverVersion: receipt.item.version });
        await this.check();
        await this.store.acknowledgeOperation(queued.operationId);
        report.acknowledged.push(queued.operationId);
      }
    } catch { report.error = "Đồng bộ đang tạm dừng. Bản đang viết và hàng đợi vẫn được giữ."; }
    return report;
  }
}
