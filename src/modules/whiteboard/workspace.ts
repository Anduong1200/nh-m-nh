import { AccountOfflineStore, type JsonValue, type QueuedOperation } from "@/lib/offline/store";
import { sameBoardJson } from "@/modules/board/model";
import { emptyWhiteboardScene, parseWhiteboardContext, parseWhiteboardScene, WHITEBOARD_SCHEMA_VERSION, whiteboardLocalId, whiteboardSnapshot, type WhiteboardContext, type WhiteboardScene, type WhiteboardSnapshot } from "./model";
import { WhiteboardSyncSession, type WhiteboardTransport } from "./sync";
const json = (v: unknown): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;
export type WhiteboardWorkspaceState = {
  scene: WhiteboardScene; baseVersion: number; ready: boolean; dirty: boolean;
  localSaved: boolean; operations: QueuedOperation[]; error?: string | undefined; remote: WhiteboardSnapshot | null;
};
function draftValue(v: JsonValue) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const scene = parseWhiteboardScene(v.scene);
  return scene && Number.isInteger(v.baseVersion) && typeof v.baseVersion === "number" && v.baseVersion >= 0 && typeof v.dirty === "boolean"
    ? { scene, baseVersion: v.baseVersion, dirty: v.dirty } : null;
}
/** Account-bound adapter for UI; no auto-merge and no canvas/editor engine. */
export class WhiteboardWorkspace {
  private readonly sync: WhiteboardSyncSession;
  private readonly listeners = new Set<() => void>();
  private state: WhiteboardWorkspaceState = { scene: emptyWhiteboardScene(), baseVersion: 0, ready: false, dirty: false, localSaved: true, operations: [], remote: null };
  private draftVersion: number | null = null;
  private revision = 0;
  private persistedRevision = 0;
  private writing: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;
  private localBlocked = false;
  private closed = false;
  private saving = false;
  private invalidScene = false;
  private readonly context: WhiteboardContext;
  constructor(context: WhiteboardContext, private readonly store: AccountOfflineStore, transport: WhiteboardTransport, private readonly online: () => boolean = () => true) {
    const binding = parseWhiteboardContext(context);
    if (!binding || binding.accountId !== store.accountScope) throw new Error("Verified account/House and matching account store required");
    this.context = Object.freeze(binding);
    this.sync = new WhiteboardSyncSession(this.context,store,transport,online);
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<WhiteboardWorkspaceState>) {
    this.state = { ...this.state, ...patch };
    if (!this.closed) for (const listener of this.listeners) listener();
  }
  private async operations() {
    return (await this.store.listOperations()).filter(o => o.houseId === this.context.houseId && o.entity === "whiteboard");
  }
  async open() {
    try {
      const local = await this.store.getDraft(whiteboardLocalId(this.context.houseId));
      let draft = null;
      if (local) {
        if (local.houseId !== this.context.houseId || local.schemaVersion !== WHITEBOARD_SCHEMA_VERSION || local.kind !== "whiteboard" || !(draft = draftValue(local.payload))) throw new Error("Draft requires recovery");
        this.draftVersion = local.version;
      }
      const cached = (await this.store.listRecent()).find(c => c.id === whiteboardLocalId(this.context.houseId) && c.houseId === this.context.houseId && c.kind === "whiteboard" && c.schemaVersion === WHITEBOARD_SCHEMA_VERSION);
      let remote = cached ? whiteboardSnapshot(cached.payload) : null;
      if (this.online()) {
        try { remote = await this.sync.read() ?? remote; } catch { /* Keep this account's local state. */ }
      }
      const operations = await this.operations();
      if (draft?.dirty) this.publish({ ...draft, operations, remote, ready: true });
      else if (remote) this.publish({ scene: remote.scene, baseVersion: remote.version, operations, remote, ready: true });
      else if (draft) this.publish({ ...draft, operations, ready: true });
      else this.publish({ ready: true, operations, error: this.online() ? "Chưa tải được bản của Nhà. Có thể viết bản nháp trên máy và thử kết nối lại." : undefined });
      await this.refresh();
    } catch { this.localBlocked = true; this.publish({ error: "Chưa mở được bản nháp. Nội dung cũ được giữ; xuất bản nháp trước khi xử lý.", ready: false }); }
  }
  edit(scene: unknown): boolean {
    if (this.closed || !this.state.ready || this.localBlocked) return false;
    const parsed = parseWhiteboardScene(scene);
    if (!parsed) { this.invalidScene = true; this.publish({ error: "Bản vẽ có nội dung chưa hỗ trợ hoặc vượt giới hạn. Hãy hoàn tác trước khi lưu." }); return false; }
    this.invalidScene = false;
    if (sameBoardJson(this.state.scene,parsed)) return true;
    this.revision++;
    this.publish({ scene: parsed, dirty: true, localSaved: false, error: undefined });
    void this.flush().catch(() => {});
    return true;
  }
  flush(): Promise<void> {
    if (this.writing) return this.writing;
    this.writing = this.persist().finally(() => { this.writing = null; });
    return this.writing;
  }
  private async persist() {
    if (this.localBlocked) throw new Error("Local draft held");
    while (this.persistedRevision < this.revision) {
      const revision = this.revision;
      const result = await this.store.saveDraft({ id: whiteboardLocalId(this.context.houseId), houseId: this.context.houseId, schemaVersion: WHITEBOARD_SCHEMA_VERSION, kind: "whiteboard", expectedVersion: this.draftVersion,
        payload: json({ scene: this.state.scene, baseVersion: this.state.baseVersion, dirty: this.state.dirty }) });
      if (result.status !== "saved") {
        this.localBlocked = true;
        this.publish({ error: "Bản nháp đã đổi ở tab khác. Nội dung trên màn hình được giữ; xuất bản nháp rồi mở lại.", localSaved: false });
        throw new Error("Local draft conflict");
      }
      this.draftVersion = result.draft.version;
      this.persistedRevision = revision;
    }
    this.publish({ localSaved: true });
  }
  async save() {
    if (this.saving || this.closed || !this.state.ready || this.localBlocked || this.invalidScene) return;
    this.saving = true;
    try {
      await this.flush();
      if ((await this.operations()).length) { this.publish({ error: "Một lần lưu đang chờ xác nhận. Bản đang vẽ tiếp vẫn được giữ trên máy." }); return; }
      const input = { houseId: this.context.houseId, schemaVersion: WHITEBOARD_SCHEMA_VERSION, entityId: whiteboardLocalId(this.context.houseId), entity: "whiteboard" as const, payload: json(this.state.scene) };
      await this.store.enqueue(this.state.baseVersion === 0 ? { ...input, mutation: "append" } : { ...input, mutation: "update", baseVersion: this.state.baseVersion });
      this.publish({ operations: await this.operations() });
      if (this.refreshing) await this.refreshing;
      await this.refresh();
    } catch { this.publish({ error: "Chưa xác nhận được lần lưu. Bản nháp và hàng đợi vẫn được giữ." }); }
    finally { this.saving = false; }
  }
  refresh(): Promise<void> {
    if (this.refreshing) {
      // Reconnect may arrive after the running pass already checked the offline state.
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        await this.reconcile();
      } while (this.refreshAgain && !this.closed && !this.localBlocked);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  private async reconcile() {
    if (this.closed || this.localBlocked || !this.state.ready) return;
    try {
      await this.flush();
      const before = await this.operations();
      let remote = this.state.remote;
      if (this.online()) {
        const result = await this.sync.drain();
        for (const applied of result.applied) {
          const op = before.find(o => o.operationId === applied.operationId);
          const version = op?.mutation === "append" ? 0 : op?.baseVersion;
          if (op && this.state.baseVersion === version) {
            const clean = sameBoardJson(this.state.scene,op.payload);
            this.publish({ baseVersion: applied.snapshot.version, dirty: !clean, remote: applied.snapshot });
            this.revision++;
            await this.flush();
          }
        }
        remote = await this.sync.read() ?? remote;
        if (result.error) this.publish({ error: result.error });
      }
      const operations = await this.operations();
      // Lost-response replay can return an older receipt. Only a clean editor may adopt the latest remote.
      if (!this.state.dirty && !operations.length && remote && remote.version >= this.state.baseVersion) this.publish({ scene: remote.scene, baseVersion: remote.version, remote });
      else this.publish({ remote });
      this.publish({ operations });
    } catch { this.publish({ error: "Đồng bộ đang tạm dừng. Bản nháp và hàng đợi vẫn được giữ." }); }
  }
  async replaceConflict(operationId: string) {
    const op = (await this.operations()).find(o => o.operationId === operationId);
    if (!op?.conflict || this.localBlocked || this.invalidScene || this.closed) return;
    await this.flush();
    await this.store.queueConflictReplacement(operationId,json(this.state.scene),op.conflict.remoteVersion);
    this.publish({ baseVersion: op.conflict.remoteVersion, dirty: true, operations: await this.operations(), error: undefined });
    this.revision++; await this.flush();
    if (this.refreshing) await this.refreshing;
    await this.refresh();
  }
  async keepRemote(operationId: string) {
    const op = (await this.operations()).find(o => o.operationId === operationId);
    const remote = op?.conflict ? whiteboardSnapshot(op.conflict.remote) : null;
    if (!op || !remote || this.localBlocked) return;
    await this.flush();
    // Retain edits made after enqueueing as well as the immutable queued proposal.
    const archived = await this.store.saveDraft({ id: "recovery:" + crypto.randomUUID(), houseId: this.context.houseId, kind: "whiteboard", schemaVersion: WHITEBOARD_SCHEMA_VERSION, expectedVersion: null,
      payload: json({ scene: this.state.scene, baseVersion: this.state.baseVersion, dirty: true, recovery: true }) });
    if (archived.status !== "saved") throw new Error("Archive unavailable");
    await this.store.keepRemoteConflict(operationId);
    this.publish({ scene: remote.scene, baseVersion: remote.version, dirty: false, remote, operations: await this.operations(), error: undefined });
    this.revision++; await this.flush();
    if (this.refreshing) await this.refreshing;
    await this.refresh();
  }
  async exportLocal() {
    await this.flush().catch(() => {});
    return json({ houseId: this.context.houseId, scene: this.state.scene, baseVersion: this.state.baseVersion, drafts: (await this.store.listDrafts()).filter(d => d.houseId === this.context.houseId && d.kind === "whiteboard"), operations: await this.operations() });
  }
  async close() {
    this.closed = true; this.sync.stop();
    await this.flush().catch(() => {});
    this.listeners.clear(); this.store.close();
  }
}
