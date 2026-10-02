"use client";
import { useEffect, useRef, useState } from "react";
import { AccountOfflineStore, type JsonValue, type QueuedOperation } from "@/lib/offline/store";
import { BOARD_SCHEMA_VERSION, boardItemFromRow, parseBoardItemInput, sameBoardJson, type BoardItem } from "@/modules/board/model";
import { BoardSyncSession } from "@/modules/board/sync";
import { boardActionTransport } from "@/modules/board/transport";
const json = (v: unknown): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;
const data = (i: BoardItem) => ({ payload: i.payload, x: i.x, y: i.y, rotation: i.rotation, zIndex: i.zIndex });
const draftPayload = (i: BoardItem) => json({ item: i });
function cachedItem(v: JsonValue): BoardItem | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return boardItemFromRow({ id: v.id, house_id: v.houseId, created_by: v.createdBy, type: v.type, payload: v.payload,
    media_id: v.mediaId ?? null, x: v.x, y: v.y, rotation: v.rotation, z_index: v.zIndex, version: v.version,
    created_at: v.createdAt, updated_at: v.updatedAt, deleted_at: v.deletedAt });
}
function localItem(v: JsonValue, accountId: string, houseId: string): BoardItem | null {
  if (!v || typeof v !== "object" || Array.isArray(v) || !v.item || typeof v.item !== "object" || Array.isArray(v.item)) return null;
  const i = v.item;
  if (i.houseId !== houseId || i.type !== "note" || typeof i.version !== "number" || !Number.isInteger(i.version) || i.version < 0) return null;
  const parsed = parseBoardItemInput({ operationId: crypto.randomUUID(), id: i.id, type: i.type, ...data(i as unknown as BoardItem) });
  if (!parsed.value) return null;
  const now = new Date().toISOString();
  return { ...parsed.value, houseId, createdBy: typeof i.createdBy === "string" ? i.createdBy : accountId, version: i.version, createdAt: now, updatedAt: now, deletedAt: null } as BoardItem;
}
export function useBoard(accountId: string, houseId: string, initialItems: BoardItem[]) {
  const [items, setItems] = useState(initialItems);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [message, setMessage] = useState("Đang mở bảng…");
  const [ready, setReady] = useState(false);
  const initial = useRef(initialItems);
  const state = useRef<{ store: AccountOfflineStore; sync: BoardSyncSession; versions: Map<string, number>; serial: Promise<void>; active: boolean } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const store = new AccountOfflineStore(accountId);
    const binding = { accountId, houseId };
    const s = { store, sync: new BoardSyncSession(binding, store, boardActionTransport, () => navigator.onLine), versions: new Map<string,number>(), serial: Promise.resolve(), active: true };
    state.current = s;
    const refresh = async () => {
      await s.serial;
      await s.sync.drain();
      const queued = (await store.listOperations()).filter(o => o.houseId === houseId && (o.entity === "note" || o.entity === "doodle"));
      const cached = (await store.listRecent()).filter(c => c.houseId === houseId && c.schemaVersion === BOARD_SCHEMA_VERSION);
      let remote = [...initial.current, ...cached.map(c => cachedItem(c.payload)).filter((i): i is BoardItem => !!i)];
      remote = [...new Map(remote.map(i => [i.id, i])).values()];
      if (navigator.onLine) {
        const result = await boardActionTransport.snapshot(binding);
        if (result.context?.accountId === accountId && result.context.houseId === houseId && result.items) {
          remote = result.items;
          for (const item of remote) if (item.type === "note" || item.type === "doodle") await store.cacheRecent({ id: item.id, houseId, schemaVersion: BOARD_SCHEMA_VERSION, kind: item.type, payload: json(item), serverVersion: item.version });
        }
        else if (s.active) setMessage("Chưa tải được bản mới của Nhà. Bản nháp vẫn được giữ.");
      }
      const drafts = (await store.listDrafts()).filter(d => d.houseId === houseId && d.schemaVersion === BOARD_SCHEMA_VERSION && d.kind === "note");
      const locals: BoardItem[] = [];
      for (const draft of drafts) {
        s.versions.set(draft.id, draft.version);
        const local = localItem(draft.payload, accountId, houseId);
        if (!local) continue;
        const saved = remote.find(i => i.id === local.id);
        const waiting = queued.some(o => o.entityId === local.id);
        if (saved && !waiting && saved.version > local.version && sameBoardJson(data(saved), data(local))) {
          const archived = await store.saveDraft({ ...draft, payload: { archived: true, item: json(saved) }, expectedVersion: draft.version });
          if (archived.status === "saved") s.versions.set(draft.id, archived.draft.version);
        } else if (!draft.payload || typeof draft.payload !== "object" || Array.isArray(draft.payload) || !draft.payload.archived) locals.push(local);
      }
      if (!s.active) return;
      setItems([...remote.filter(i => !i.deletedAt && !locals.some(l => l.id === i.id)), ...locals]);
      setOperations(queued);
      setReady(true);
      setMessage(queued.some(o => o.schemaVersion !== BOARD_SCHEMA_VERSION) ? "Có lần lưu cũ cần khôi phục riêng. Xuất bản nháp để giữ một bản sao." : queued.some(o => o.state === "conflict") ? "Có hai bản. Hãy chọn bản muốn giữ." : queued.length ? "Đã giữ trên máy, đang chờ đồng bộ." : "Bản đang viết được giữ trên máy. Chọn Lưu để gửi vào Nhà.");
    };
    refreshRef.current = refresh;
    const run = () => { void refresh().catch(() => { if (s.active) { setReady(true); setMessage("Chưa mở được bộ nhớ trên máy. Thử lại để lưu an toàn."); } }); };
    run(); addEventListener("online", run);
    return () => { s.active = false; s.sync.stop(); void s.serial.catch(() => {}).finally(() => store.close()); state.current = null; removeEventListener("online", run); };
  }, [accountId, houseId]);
  const persist = (item: BoardItem) => {
    const s = state.current;
    if (!s) return;
    s.serial = s.serial.then(async () => {
      const result = await s.store.saveDraft({ id: item.id, kind: "note", houseId, schemaVersion: BOARD_SCHEMA_VERSION, payload: draftPayload(item), expectedVersion: s.versions.get(item.id) ?? null });
      if (result.status !== "saved") throw new Error("Draft changed in another tab");
      s.versions.set(item.id, result.draft.version);
    }).catch(() => { if (s.active) setMessage("Bản nháp đã đổi ở tab khác hoặc chưa lưu được. Nội dung trên màn hình vẫn được giữ; tải bản nháp trước khi lưu tiếp."); throw new Error("Local save paused"); });
    void s.serial.catch(() => {});
  };
  const change = (item: BoardItem) => { setItems(prev => prev.map(i => i.id === item.id ? item : i)); persist(item); };
  const add = () => {
    if (!ready) return;
    const now = new Date().toISOString();
    const item: BoardItem = { id: crypto.randomUUID(), houseId, createdBy: accountId, type: "note", payload: { text: "" }, x: Math.max(24, Math.min(160, innerWidth - 244)), y: 160, rotation: 0, zIndex: Math.min(1000000, Math.max(0, ...items.map(i => i.zIndex)) + 1), version: 0, createdAt: now, updatedAt: now, deletedAt: null };
    setItems(prev => [...prev,item]); persist(item);
  };
  const save = async (item: BoardItem) => {
    const s = state.current;
    if (!s || operations.some(o => o.entityId === item.id)) return;
    try {
      await s.serial;
      const existing = (await s.store.listOperations()).find(o => o.houseId === houseId && o.entityId === item.id);
      if (existing) { setMessage("Ghi chú này có một lần lưu đang chờ."); return; }
      const input = { houseId, schemaVersion: BOARD_SCHEMA_VERSION, entityId: item.id, entity: "note" as const };
      const op = await s.store.enqueue(item.version === 0 ? { ...input, mutation: "append", payload: json({ type: "note", ...data(item) }) } : { ...input, mutation: "update", baseVersion: item.version, payload: json(data(item)) });
      if (s.active) setOperations(prev => [...prev,op]);
      await refreshRef.current();
    } catch { if (s.active) setMessage("Chưa xác nhận được lần lưu. Bản đang viết và hàng đợi vẫn được giữ."); }
  };
  const resolve = async (op: QueuedOperation, replace: boolean) => {
    const s = state.current;
    if (!s || !op.conflict) return;
    try {
      await s.serial;
      if (replace) {
        const local = items.find(i => i.id === op.entityId);
        if (!local) return;
        await s.store.queueConflictReplacement(op.operationId, json(data(local)), op.conflict.remoteVersion);
      } else {
        await s.store.keepRemoteConflict(op.operationId);
        const draft = await s.store.getDraft(op.entityId);
        if (draft) await s.store.saveDraft({ ...draft, expectedVersion: draft.version, payload: { archived: true, previous: draft.payload } });
      }
      await refreshRef.current();
    } catch { setMessage("Chưa xử lý được xung đột. Cả hai bản vẫn được giữ."); }
  };
  const exportLocal = async () => {
    const s = state.current;
    if (!s) return;
    try {
      await s.serial.catch(() => {});
      const payload = { schemaVersion: BOARD_SCHEMA_VERSION, houseId, drafts: (await s.store.listDrafts()).filter(d => d.houseId === houseId), operations: (await s.store.listOperations()).filter(o => o.houseId === houseId), visibleItems: items };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nha-minh-board-drafts.json"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setMessage("Chưa xuất được bản nháp. Nội dung vẫn được giữ."); }
  };
  return { items, operations, message, ready, change, add, save, resolve, exportLocal, refresh: () => refreshRef.current() };
}

