import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { WHITEBOARD_SCHEMA_VERSION, parseWhiteboardContext, parseWhiteboardOperation, whiteboardLocalId, whiteboardReceipt, whiteboardSnapshot, type WhiteboardContext, type WhiteboardOperation, type WhiteboardReceipt, type WhiteboardSnapshot } from "./model";
export type WhiteboardTransport = {
  snapshot(context: WhiteboardContext): Promise<{ context?: WhiteboardContext; snapshot?: WhiteboardSnapshot; error?: string; blocked?: boolean }>;
  save(operation: WhiteboardOperation, context: WhiteboardContext): Promise<{ receipt?: WhiteboardReceipt; error?: string; blocked?: boolean }>;
};
export type WhiteboardSyncReport = { acknowledged: string[]; applied: { operationId: string; snapshot: WhiteboardSnapshot }[]; conflicts: string[]; blocked: string[]; error?: string };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
export class WhiteboardSyncSession {
  private active = true;
  private running: Promise<WhiteboardSyncReport> | null = null;
  private readonly context: WhiteboardContext;
  constructor(context: WhiteboardContext, private readonly store: AccountOfflineStore, private readonly transport: WhiteboardTransport, private readonly canProceed: () => boolean = () => true) {
    const binding = parseWhiteboardContext(context);
    if (!binding || binding.accountId !== store.accountScope) throw new Error("Verified account/House and matching account store required");
    this.context = Object.freeze(binding);
  }
  stop() { this.active = false; }
  private async check() {
    if (!this.active || !this.canProceed()) throw new Error("Sync paused");
    await this.store.assertCurrent();
    if (!this.active || !this.canProceed()) throw new Error("Sync paused");
  }
  async read(): Promise<WhiteboardSnapshot | null> {
    await this.check();
    const result = await this.transport.snapshot(this.context);
    await this.check();
    const snapshot = whiteboardSnapshot(result.snapshot);
    if (result.blocked || result.context?.accountId !== this.context.accountId || result.context.houseId !== this.context.houseId || !snapshot || snapshot.houseId !== this.context.houseId) return null;
    await this.store.cacheRecent({ id: whiteboardLocalId(this.context.houseId), houseId: this.context.houseId, schemaVersion: WHITEBOARD_SCHEMA_VERSION, kind: "whiteboard", payload: json(snapshot), serverVersion: snapshot.version });
    return snapshot;
  }
  drain() {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<WhiteboardSyncReport> {
    const report: WhiteboardSyncReport = { acknowledged: [], applied: [], conflicts: [], blocked: [] };
    try {
      await this.check();
      const operations = (await this.store.listOperations()).filter(o => o.entity === "whiteboard" && o.houseId === this.context.houseId)
        .sort((a,b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt));
      let held = false;
      for (const queued of operations) {
        if (queued.schemaVersion !== WHITEBOARD_SCHEMA_VERSION || queued.state === "conflict" || held && !queued.resolutionOf || queued.entityId !== whiteboardLocalId(this.context.houseId) || queued.accountId !== this.context.accountId) {
          report.blocked.push(queued.operationId); held = true; continue;
        }
        const operation = parseWhiteboardOperation({ operationId: queued.operationId, expectedVersion: queued.mutation === "append" ? 0 : queued.baseVersion, scene: queued.payload });
        if (!operation) { report.blocked.push(queued.operationId); held = true; continue; }
        await this.check();
        if (!await this.read()) { report.error = "Chưa xác nhận được phiên đăng nhập và Nhà. Hàng đợi vẫn được giữ."; break; }
        const result = await this.transport.save(operation,this.context);
        await this.check();
        const receipt = result.blocked ? null : whiteboardReceipt(result.receipt,this.context,operation);
        if (!receipt) { report.error = "Chưa xác nhận được lần lưu. Hàng đợi vẫn được giữ."; break; }
        if (receipt.outcome === "conflict") {
          await this.store.preserveConflict(queued.operationId,json(receipt.snapshot),receipt.snapshot.version);
          report.conflicts.push(queued.operationId); held = true; continue;
        }
        await this.store.cacheRecent({ id: whiteboardLocalId(this.context.houseId), houseId: this.context.houseId, schemaVersion: WHITEBOARD_SCHEMA_VERSION, kind: "whiteboard", payload: json(receipt.snapshot), serverVersion: receipt.snapshot.version });
        await this.check();
        await this.store.acknowledgeOperation(queued.operationId);
        report.acknowledged.push(queued.operationId);
        report.applied.push({ operationId: queued.operationId, snapshot: receipt.snapshot });
      }
    } catch { report.error = "Đồng bộ đang tạm dừng. Bản nháp và hàng đợi vẫn được giữ."; }
    return report;
  }
}
