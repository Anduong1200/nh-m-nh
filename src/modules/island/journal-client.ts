import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { parseGameContext, type GameContext } from "@/modules/games/model";
import type { IslandJournalRead, IslandJournalWrite } from "./journal-actions";
import { parseIslandEntry, parseIslandEntryCommand, parseIslandEntryReceipt, parseIslandJournalPage, type IslandEntry, type IslandEntryCommand, type IslandJournalPage } from "./journal";

export type IslandJournalTransport = {
  read(context: GameContext, cursor?: IslandJournalPage["next"]): Promise<IslandJournalRead>;
  entry(id: string, context: GameContext): Promise<IslandJournalRead>;
  write(command: IslandEntryCommand, context: GameContext): Promise<IslandJournalWrite>;
};
export class IslandJournalClient {
  private active = true;
  readonly context: GameContext;
  constructor(context: GameContext, private readonly store: AccountOfflineStore, private readonly transport: IslandJournalTransport, private readonly online: () => boolean = () => true) {
    const parsed = parseGameContext(context);
    if (!parsed || parsed.accountId !== store.accountScope) throw new Error("Matching account and House required");
    this.context = Object.freeze(parsed);
  }
  stop() { this.active = false; }
  private async check() { if (!this.active) throw new Error("Journal stopped"); await this.store.assertCurrent(); if (!this.active) throw new Error("Journal stopped"); }
  private validContext(input?: GameContext) { return input?.accountId === this.context.accountId && input.houseId === this.context.houseId; }
  async cached(): Promise<IslandEntry[]> {
    await this.check();
    return (await this.store.listRecent()).filter(row => row.kind === "island" && row.schemaVersion === 1 && row.houseId === this.context.houseId && row.id.startsWith("island-entry:")).map(row => parseIslandEntry(row.payload)).filter((entry): entry is IslandEntry => !!entry && entry.houseId === this.context.houseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 20);
  }
  async remember(entry: IslandEntry) {
    await this.check(); const parsed = parseIslandEntry(entry);
    if (!parsed || parsed.houseId !== this.context.houseId) throw new Error("Invalid journal page");
    await this.store.cacheRecent({ id: `island-entry:${parsed.id}`, kind: "island", houseId: this.context.houseId, schemaVersion: 1, serverVersion: parsed.version, payload: JSON.parse(JSON.stringify(parsed)) as JsonValue });
    await this.check();
    const row = (await this.store.listRecent()).find(item => item.id === `island-entry:${parsed.id}` && item.houseId === this.context.houseId);
    return parseIslandEntry(row?.payload) ?? parsed;
  }
  async read(cursor: IslandJournalPage["next"] = null): Promise<IslandJournalRead & { cached: boolean }> {
    await this.check();
    if (!this.online()) return { context: this.context, page: { entries: await this.cached(), next: null }, cached: true, ...(cursor ? { error: "Kết nối lại để mở những trang cũ hơn." } : {}) };
    const result = await this.transport.read(this.context, cursor); await this.check();
    if (result.blocked || result.context && !this.validContext(result.context)) { this.stop(); return { blocked: true, cached: false, error: "Cần xác nhận lại quyền vào Nhà." }; }
    const page = this.validContext(result.context) ? parseIslandJournalPage(result.page, this.context.houseId) : null;
    if (!page) return { context: this.context, page: { entries: await this.cached(), next: null }, cached: true, error: result.error ?? "Chưa mở được sổ kỷ niệm." };
    const entries: IslandEntry[] = [];
    for (const entry of page.entries) entries.push(await this.remember(entry));
    if (!cursor) {
      // Entries cannot be deleted by app roles. Keep later acknowledged rows
      // when an older list request arrives after create/edit/restore.
      const merged = new Map((await this.cached()).map(entry => [entry.id, entry]));
      for (const entry of entries) merged.set(entry.id, entry);
      return { context: this.context, page: { entries: [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 20), next: page.next }, cached: false };
    }
    return { context: this.context, page: { entries, next: page.next }, cached: false };
  }
  async entry(id: string): Promise<IslandJournalRead> {
    await this.check();
    if (!this.online()) { const entry = (await this.cached()).find(entry => entry.id === id); return { context: this.context, ...(entry ? { entry } : {}), error: "Đang xem những trang đã lưu trên thiết bị." }; }
    const result = await this.transport.entry(id, this.context); await this.check();
    if (result.blocked || result.context && !this.validContext(result.context)) { this.stop(); return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." }; }
    const entry = parseIslandEntry(result.entry);
    return this.validContext(result.context) && entry?.id === id && entry.houseId === this.context.houseId ? { context: this.context, entry: await this.remember(entry) } : { error: result.error ?? "Chưa mở được trang sổ." };
  }
  async write(input: IslandEntryCommand): Promise<IslandJournalWrite> {
    await this.check(); const command = parseIslandEntryCommand(input);
    if (!command) return { rejected: true, error: "Trang sổ chưa hợp lệ." };
    if (!this.online()) return { error: "Kết nối lại để xác nhận lưu. Bản nháp vẫn ở thiết bị này." };
    const result = await this.transport.write(command, this.context); await this.check();
    if (result.blocked) { this.stop(); return result; }
    const receipt = parseIslandEntryReceipt(result.receipt, command, this.context.houseId, this.context.accountId);
    if (!receipt) return { error: result.error ?? "Chưa xác nhận được việc lưu. Giữ nguyên bản nháp để thử lại.", ...(result.blocked ? { blocked: true } : {}), ...(result.rejected ? { rejected: true } : {}) };
    await this.remember(receipt.entry);
    return { receipt };
  }
  async drafts() {
    await this.check(); return (await this.store.listDrafts()).filter(row => row.kind === "island" && row.houseId === this.context.houseId && row.schemaVersion === 1 && row.id.startsWith("island-journal-draft:"));
  }
  async saveDraft(id: string, payload: JsonValue, expectedVersion: number | null) {
    await this.check();
    return this.store.saveDraft({ id, payload, expectedVersion, houseId: this.context.houseId, kind: "island", schemaVersion: 1 });
  }
}
