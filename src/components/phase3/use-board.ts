"use client";
import { useEffect, useRef, useState } from "react";
import { AccountOfflineStore, type QueuedOperation } from "@/lib/offline/store";
import { subscribeAccountInvalidation } from "@/lib/offline/invalidation";
import { BOARD_SCHEMA_VERSION, boardReceiptFromData, parseBoardItemInput, sameBoardJson, type BoardItem, type BoardMutation, type BoardType } from "@/modules/board/model";
import { BoardSyncSession } from "@/modules/board/sync";
import { boardActionTransport } from "@/modules/board/transport";
import { boardData as data, boardJson as json, boardKind, cachedBoardItem, localBoardItem } from "./board-local";
const boardEntity = (value: string) => value === "note" || value === "doodle" || value === "board";
export function useBoard(accountId: string, houseId: string, initialItems: BoardItem[], syncEnabled = true) {
  const [items, setItems] = useState(initialItems);
  const [trashed, setTrashed] = useState<BoardItem[]>([]);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [message, setMessage] = useState("Đang mở bảng…");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState<string | null>(null);
  const [savingItems, setSavingItems] = useState<string[]>([]);
  const [onlineRequests,setOnlineRequests]=useState<Record<string,"trash"|"restore">>({});
  const initial = useRef(initialItems);
  const state = useRef<{ store: AccountOfflineStore; sync: BoardSyncSession; versions: Map<string, number>; serial: Promise<void>; refresh: Promise<void> | null; active: boolean; pendingWrites: number; requests: Map<string, BoardMutation>; saving: Set<string> } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const syncAllowed = useRef(syncEnabled);
  useEffect(() => {
    syncAllowed.current = syncEnabled;
    // Keep one local writer while verification changes; do not reopen IDB before
    // the previous keystroke's serialized draft save has committed.
    if (syncEnabled) {
      const refresh = refreshRef.current;
      void refresh().then(() => { if (syncAllowed.current) void refresh().catch(() => {}); }).catch(() => {});
    }
  }, [syncEnabled]);
  useEffect(() => {
    const store = new AccountOfflineStore(accountId), binding = Object.freeze({ accountId, houseId });
    const s = { store, sync: new BoardSyncSession(binding, store, boardActionTransport, () => navigator.onLine && syncAllowed.current), versions: new Map<string,number>(), serial: Promise.resolve(), refresh: null as Promise<void> | null, active: true, pendingWrites:0, requests: new Map<string,BoardMutation>(), saving: new Set<string>() };
    state.current = s;
    const refresh = async () => {
      await s.serial;
      await store.assertCurrent();
      const report = syncAllowed.current && navigator.onLine ? await s.sync.drain() : { error: undefined };
      const queued = (await store.listOperations()).filter(o => o.houseId === houseId && boardEntity(o.entity));
      const cached = (await store.listRecent()).filter(c => c.houseId === houseId && c.schemaVersion === BOARD_SCHEMA_VERSION && boardEntity(c.kind));
      const remoteById = new Map<string,BoardItem>();
      for (const item of [...initial.current, ...cached.map(c => cachedBoardItem(c.payload)).filter((i): i is BoardItem => !!i)]) if (item.houseId === houseId && (!remoteById.has(item.id) || remoteById.get(item.id)!.version < item.version)) remoteById.set(item.id,item);
      let remote = [...remoteById.values()], error = report.error ?? "";
      if (navigator.onLine && syncAllowed.current) {
        const result = await boardActionTransport.snapshot(binding);
        await store.assertCurrent();
        if (result.blocked) { if (s.active) { setBlocked(true); setReady(false); setItems([]); setTrashed([]); setMessage("Phiên đăng nhập hoặc Nhà đã đổi. Bản nháp vẫn được giữ riêng trên máy."); } return; }
        if (result.context?.accountId === accountId && result.context.houseId === houseId && result.items) {
          remote = result.items;
          for (const item of remote) await store.cacheRecent({ id: item.id, houseId, schemaVersion: BOARD_SCHEMA_VERSION, kind: boardKind(item), payload: json(item), serverVersion: item.version });
        } else error = "Chưa tải được bản mới của Nhà. Bản nháp vẫn được giữ.";
      }
      // Re-read after network work: typing during refresh must not be replaced by an older draft.
      await s.serial;
      const drafts = (await store.listDrafts()).filter(d => d.houseId === houseId && d.schemaVersion === BOARD_SCHEMA_VERSION && boardEntity(d.kind));
      const locals: BoardItem[] = [];
      for (const draft of drafts) {
        s.versions.set(draft.id, draft.version);
        if (draft.id.startsWith("board-action:") && draft.payload && typeof draft.payload === "object" && !Array.isArray(draft.payload) && !draft.payload.archived && draft.payload.operation) {
          s.requests.set(draft.id.slice(13), draft.payload.operation as unknown as BoardMutation); continue;
        }
        const local = localBoardItem(draft.payload, accountId, houseId);
        if (!local) { if(draft.payload && typeof draft.payload==="object" && !Array.isArray(draft.payload) && !draft.payload.archived && draft.payload.item) error="Có bản nháp chưa đọc được an toàn. Nội dung vẫn giữ trên máy; xuất bản nháp trước khi sửa lại.";continue; }
        const saved = remote.find(i => i.id === local.id), waiting = queued.some(o => o.entityId === local.id);
        if (saved && !waiting && saved.version > local.version && sameBoardJson(data(saved), data(local))) {
          const archived = await store.saveDraft({ ...draft, payload: { archived: true, item: json(saved) }, expectedVersion: draft.version });
          if (archived.status === "saved") s.versions.set(draft.id, archived.draft.version);
        } else locals.push(local);
      }
      if (!s.active) return;
      setItems([...remote.filter(i => !i.deletedAt && !locals.some(l => l.id === i.id)), ...locals]);
      setTrashed(remote.filter(i => !!i.deletedAt)); setOperations(queued);setOnlineRequests(Object.fromEntries([...s.requests].filter(([,op])=>op.mutation==="trash"||op.mutation==="restore").map(([id,op])=>[id,op.mutation])) as Record<string,"trash"|"restore">); setReady(true);
      setMessage(error || (queued.some(o => o.schemaVersion !== BOARD_SCHEMA_VERSION) ? "Có lần lưu cũ cần khôi phục riêng. Xuất bản nháp để giữ một bản sao." : queued.some(o => o.state === "conflict") ? "Có hai bản. Hãy chọn bản muốn giữ." : queued.length ? "Đã giữ trên máy, đang chờ đồng bộ." : "Bản đang viết được giữ trên máy. Chọn Lưu để gửi vào Nhà."));
    };
    const serializedRefresh = () => { if (!s.refresh) s.refresh = refresh().finally(() => { s.refresh = null; }); return s.refresh; };
    refreshRef.current = serializedRefresh;
    const refreshFailed=()=>{if(s.active){setMessage("Chưa mở được bộ nhớ trên máy. Thử lại để lưu an toàn.");setReady(false);}};
    const run = () => {
      // Reconnect can arrive while an offline queue read is finishing. It must trigger a new drain.
      if(s.refresh){void s.refresh.finally(()=>{if(s.active)void serializedRefresh().catch(refreshFailed);}).catch(()=>{});return;}
      void serializedRefresh().catch(refreshFailed);
    };
    const invalidation = subscribeAccountInvalidation(accountId, () => { s.active = false; s.sync.stop(); setBlocked(true); setReady(false); setItems([]); setTrashed([]); });
    const beforeUnload=(event: BeforeUnloadEvent)=>{if(s.pendingWrites){event.preventDefault();event.returnValue="";}};
    run(); addEventListener("online", run);addEventListener("beforeunload",beforeUnload);
    return () => { s.active = false; s.sync.stop(); invalidation(); void s.serial.catch(() => {}).finally(() => store.close()); state.current = null; removeEventListener("online", run);removeEventListener("beforeunload",beforeUnload); };
  }, [accountId, houseId]);
  const persist = (item: BoardItem) => {
    const s = state.current; if (!s?.active) return;
    s.pendingWrites++;
    s.serial = s.serial.then(async () => {
      const result = await s.store.saveDraft({ id: item.id, kind: boardKind(item), houseId, schemaVersion: BOARD_SCHEMA_VERSION, payload: json({ item }), expectedVersion: s.versions.get(item.id) ?? null });
      if (result.status !== "saved") throw new Error("Draft changed in another tab");
      s.versions.set(item.id, result.draft.version);
    }).catch(() => { if (s.active) setMessage("Bản nháp đã đổi ở tab khác hoặc chưa lưu được. Nội dung trên màn hình vẫn được giữ; xuất bản nháp trước khi lưu tiếp."); throw new Error("Local save paused"); }).finally(()=>{s.pendingWrites--;});
    void s.serial.catch(() => {});
  };
  const change = (item: BoardItem) => { if (!ready || blocked || state.current?.saving.has(item.id)) return; setItems(prev => prev.map(i => i.id === item.id ? item : i)); persist(item); };
  const create = (type: BoardType, payload: Record<string,unknown>, mediaId: string | null = null) => {
    if (!ready || blocked || !state.current?.active) return null;
    const now = new Date().toISOString();
    const item: BoardItem = { id: crypto.randomUUID(), houseId, createdBy: accountId, type, payload, mediaId, x: Math.max(24, Math.min(160, innerWidth - 244)), y: 160, rotation: 0, zIndex: Math.min(1000000, Math.max(0, ...items.map(i => i.zIndex)) + 1), version: 0, createdAt: now, updatedAt: now, deletedAt: null };
    if (!parseBoardItemInput({ operationId: crypto.randomUUID(), id: item.id, type, ...data(item) }).value) { setMessage("Nội dung chưa hợp lệ. Kiểm tra lại trước khi ghim."); return null; }
    setItems(prev => [...prev,item]); persist(item); return item;
  };
  const save = async (item: BoardItem) => {
    const s = state.current; if (!s?.active || s.saving.has(item.id) || operations.some(o => o.entityId === item.id)) return;
    if (item.type !== "note" && item.type !== "doodle" && (!navigator.onLine || !syncEnabled)) { setMessage("Ảnh, âm thanh và liên kết cần kết nối để gửi. Bản nháp vẫn được giữ."); return; }
    if (!parseBoardItemInput({ operationId: crypto.randomUUID(), id: item.id, type: item.type, ...data(item) }).value) { setMessage("Nội dung chưa hợp lệ. Kiểm tra lại trước khi lưu."); return; }
    s.saving.add(item.id); setSavingItems(previous => [...previous, item.id]);
    try {
      await s.serial;
      const input = { houseId, schemaVersion: BOARD_SCHEMA_VERSION, entityId: item.id, entity: boardKind(item) };
      const op = await s.store.enqueue(item.version === 0 ? { ...input, mutation: "append", payload: json({ type: item.type, ...data(item) }) } : { ...input, mutation: "update", baseVersion: item.version, payload: json({ ...data(item), ...(input.entity === "board" ? { boardType:item.type } : {}) }) }, true);
      if (s.active) setOperations(prev => [...prev,op]); await refreshRef.current();
    } catch { if (s.active) setMessage("Chưa xác nhận được lần lưu. Bản đang viết và hàng đợi vẫn được giữ."); }
    finally { s.saving.delete(item.id); if (s.active) setSavingItems(previous => previous.filter(id => id !== item.id)); }
  };
  const resolve = async (op: QueuedOperation, replace: boolean) => {
    const s = state.current; if (!s?.active || !op.conflict) return;
    try {
      await s.serial;
      if (replace) {
        const local = items.find(i => i.id === op.entityId); if (!local) return;
        await s.store.queueConflictReplacement(op.operationId, json({ ...data(local), ...(op.entity === "board" ? { boardType:local.type } : {}) }), op.conflict.remoteVersion);
      } else {
        await s.store.keepRemoteConflict(op.operationId);
        const draft = await s.store.getDraft(op.entityId);
        if (draft) await s.store.saveDraft({ ...draft, expectedVersion: draft.version, payload: { archived: true, previous: draft.payload } });
      }
      await refreshRef.current();
    } catch { if (s.active) setMessage("Chưa xử lý được xung đột. Cả hai bản vẫn được giữ."); }
  };
  const trash = async (item: BoardItem, restore = false) => {
    const s = state.current;
    if (!s?.active || item.createdBy !== accountId || item.version === 0 || !navigator.onLine || !syncEnabled || onlineBusy || operations.some(o => o.entityId === item.id)) return;
    setOnlineBusy(item.id);
    try {
      await s.serial;
      const id = "board-action:" + item.id;
      let operation = s.requests.get(item.id);
      if (!operation) {
        operation = { id: item.id, operationId: crypto.randomUUID(), expectedVersion: item.version, mutation: restore ? "restore" : "trash", data: {} };
        const current = await s.store.getDraft(id);
        const saved = await s.store.saveDraft({ id, houseId, kind: "board", schemaVersion: BOARD_SCHEMA_VERSION, payload: json({ operation, item }), expectedVersion: current?.version ?? null });
        if (saved.status !== "saved") throw new Error("Another tab has an action"); s.requests.set(item.id,operation);
        if(s.active)setOnlineRequests(previous=>({...previous,[item.id]:restore?"restore":"trash"}));
      }
      await s.store.assertCurrent();
      const result = await boardActionTransport.apply(operation,{ accountId, houseId });
      await s.store.assertCurrent();
      if (!s.active) return;
      const r = result.receipt;
      const receipt = r && boardReceiptFromData({ operation_id: r.operationId, actor_id: r.actorId, house_id: r.houseId, outcome: r.outcome, item: { id:r.item.id,house_id:r.item.houseId,created_by:r.item.createdBy,type:r.item.type,payload:r.item.payload,media_id:r.item.mediaId??null,x:r.item.x,y:r.item.y,rotation:r.item.rotation,z_index:r.item.zIndex,version:r.item.version,created_at:r.item.createdAt,updated_at:r.item.updatedAt,deleted_at:r.item.deletedAt } },{ accountId,houseId },operation);
      if (!receipt || result.blocked) { setMessage(result.error || "Chưa xác nhận được thao tác. Thử lại sẽ dùng đúng lần gửi cũ."); return; }
      const requestDraft = await s.store.getDraft(id);
      if (requestDraft) { const saved = await s.store.saveDraft({ ...requestDraft, expectedVersion:requestDraft.version,payload:json({ archived:true, operation, receipt }) }); if (saved.status!=="saved") throw new Error("Action changed"); }
      s.requests.delete(item.id);
      if(s.active)setOnlineRequests(previous=>{const next={...previous};delete next[item.id];return next;});
      if (receipt.outcome === "applied") {
        const draft = await s.store.getDraft(item.id);
        if (draft) { const saved=await s.store.saveDraft({ ...draft,expectedVersion:draft.version,payload:{ archived:true, previous:draft.payload } }); if(saved.status==="saved")s.versions.set(item.id,saved.draft.version); }
      }
      await refreshRef.current();
      if (receipt.outcome === "conflict") setMessage("Vật dụng đã đổi. Bản mới đã tải; xem lại trước khi đưa vào thùng rác hoặc khôi phục.");
    } catch { if (s.active) setMessage("Chưa xác nhận được thao tác. Thử lại sẽ dùng đúng lần gửi cũ."); }
    finally { if(s.active)setOnlineBusy(null); }
  };
  const flush = async () => { const s=state.current; if(!s?.active)return false;try { await s.serial;await s.store.assertCurrent();return true; }catch { setMessage("Chưa giữ được thay đổi mới nhất. Xuất bản nháp trước khi rời bảng.");return false; } };
  const exportLocal = async () => {
    const s = state.current; if (!s?.active) return;
    try {
      await s.serial.catch(() => {});
      const payload = { schemaVersion: BOARD_SCHEMA_VERSION, houseId, drafts: (await s.store.listDrafts()).filter(d => d.houseId === houseId), operations: (await s.store.listOperations()).filter(o => o.houseId === houseId), visibleItems: items };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nha-minh-board-drafts.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if(s.active)setMessage("Chưa xuất được bản nháp. Nội dung vẫn được giữ."); }
  };
  return { items, trashed, operations, message, ready, blocked, onlineBusy,onlineRequests, savingItems, change, create, add: (text="")=>create("note",{text}), save, trash, resolve, exportLocal, flush, refresh: () => refreshRef.current() };
}
