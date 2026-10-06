"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountOfflineStore, subscribeAccountInvalidation, type JsonValue } from "@/lib/offline";
import type { GameContext, GameSession } from "@/modules/games/model";
import { IslandJournalClient, type IslandJournalTransport } from "@/modules/island/journal-client";
import { islandCalendarDate, parseIslandEntryCommand, type IslandEntry, type IslandEntryCommand, type IslandEntryContent, type IslandEntryType, type IslandJournalPage } from "@/modules/island/journal";
import { HomeDialog } from "@/components/phase2/home-dialog";

type Editor = { id: string; entryType: IslandEntryType; entryId: string; expectedVersion: number; title: string; body: string; occurredOn: string; sourceSessionId: string | null; confirmed: boolean; command: IslandEntryCommand | null; status: "draft" | "pending" | "conflict" | "accepted"; remote: IslandEntry | null };
type SavedEditor = { editor: Editor; version: number | null };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
function parseEditor(value: unknown): Editor | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Editor;
  if (!v.id?.startsWith("island-journal-draft:") || !["memory", "milestone"].includes(v.entryType) || typeof v.title !== "string" || typeof v.body !== "string" || !islandCalendarDate(v.occurredOn) || !["draft", "pending", "conflict", "accepted"].includes(v.status) || v.command !== null && !parseIslandEntryCommand(v.command)) return null;
  return v;
}
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--forest)]/30 px-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50";
const inputClass = "w-full rounded-xl border border-[var(--forest)]/30 bg-[var(--paper)] p-3 text-[var(--forest)]";

/** Shared journal pages are explicit user actions, never automatic memories. */
export function IslandJournal({ context, artifacts, transport, blocked: parentBlocked, onChanged, onBlocked }: {
  context: GameContext; artifacts: GameSession[]; transport: IslandJournalTransport; blocked: boolean; onChanged: () => void; onBlocked: () => void;
}) {
  const [entries, setEntries] = useState<IslandEntry[]>([]);
  const [next, setNext] = useState<IslandJournalPage["next"]>(null);
  const [tab, setTab] = useState<IslandEntryType | "trash">("memory");
  const [busy, setBusy] = useState(true); const [saving, setSaving] = useState(false);
  const [cached, setCached] = useState(false); const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<SavedEditor | null>(null);
  const [drafts, setDrafts] = useState<SavedEditor[]>([]);
  const [blocked, setBlocked] = useState(false);
  const client = useRef<IslandJournalClient | null>(null); const epoch = useRef(0);
  const editing = useRef<SavedEditor | null>(null); const writeChain = useRef<Promise<void>>(Promise.resolve());
  const invalidate = useCallback(() => { epoch.current++; }, []);
  const alive = (bound: IslandJournalClient, generation: number) => client.current === bound && epoch.current === generation;
  const closeAccess = useCallback(() => { epoch.current++; client.current?.stop(); client.current = null; editing.current = null; setEditor(null); setDrafts([]); setEntries([]); setBusy(false); setSaving(false); setBlocked(true); setError("Cần đăng nhập lại để mở sổ của Nhà."); onBlocked(); }, [onBlocked]);
  const loadDrafts = useCallback(async (bound: IslandJournalClient, generation: number) => {
    const rows = await bound.drafts(); if (!alive(bound, generation)) return;
    setDrafts(rows.flatMap(row => { const value = parseEditor(row.payload); return value && value.status !== "accepted" ? [{ editor: value, version: row.version }] : []; }));
  }, []);
  const refresh = useCallback(async (cursor: IslandJournalPage["next"] = null) => {
    const bound = client.current; if (!bound) return; const generation = epoch.current; setBusy(true);
    try {
      const result = await bound.read(cursor); if (!alive(bound, generation)) return;
      if (result.blocked) { closeAccess(); return; }
      if (result.page) {
        setEntries(previous => {
          const merged = new Map((cursor ? previous : []).map(entry => [entry.id, entry]));
          for (const entry of result.page!.entries) { const old = previous.find(item => item.id === entry.id); merged.set(entry.id, old && old.version > entry.version ? old : entry); }
          return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        }); setNext(result.page.next);
      }
      setCached(result.cached); setError(result.error ?? null); await loadDrafts(bound, generation);
    } catch { if (alive(bound, generation)) { setError("Chưa mở được sổ. Bản nháp vẫn được giữ."); const previous = await bound.cached().catch(() => []); if (alive(bound, generation)) { setEntries(previous); setCached(true); } } }
    finally { if (alive(bound, generation)) setBusy(false); }
  }, [closeAccess, loadDrafts]);

  useEffect(() => {
    const store = new AccountOfflineStore(context.accountId); const bound = new IslandJournalClient(context, store, transport, () => navigator.onLine);
    client.current = bound; const unsubscribe = subscribeAccountInvalidation(context.accountId, closeAccess);
    void Promise.resolve().then(() => refresh()); const online = () => void refresh(); window.addEventListener("online", online); window.addEventListener("offline", online);
    const visible = () => { if (document.visibilityState === "visible" && navigator.onLine) void refresh(); };
    document.addEventListener("visibilitychange", visible); const timer = window.setInterval(visible, 30_000);
    return () => { invalidate(); bound.stop(); if (client.current === bound) client.current = null; store.close(); unsubscribe(); window.removeEventListener("online", online); window.removeEventListener("offline", online); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); };
  }, [closeAccess, context, invalidate, refresh, transport]);
  useEffect(() => { if (parentBlocked) { invalidate(); client.current?.stop(); client.current = null; editing.current = null; } }, [invalidate, parentBlocked]);
  useEffect(() => {
    const navigate = () => { if (location.hash === "#island-milestones") setTab("milestone"); else if (location.hash === "#island-journal") setTab("memory"); };
    navigate(); window.addEventListener("hashchange", navigate); return () => window.removeEventListener("hashchange", navigate);
  }, []);

  const persist = useCallback((value: SavedEditor): Promise<SavedEditor> => {
    const bound = client.current; const generation = epoch.current;
    if (!bound) return Promise.reject(new Error("Journal stopped"));
    let result!: SavedEditor;
    const save = writeChain.current.catch(() => {}).then(async () => {
      if (!alive(bound, generation)) throw new Error("Journal stopped");
      // Use the latest local CAS version for this editor; other-tab conflicts
      // fork a separate draft instead of silently replacing either proposal.
      const version = editing.current?.editor.id === value.editor.id ? editing.current.version : value.version;
      let saved = await bound.saveDraft(value.editor.id, json(value.editor), version);
      let effective = value.editor;
      if (saved.status === "conflict") {
        effective = { ...value.editor, id: `island-journal-draft:${crypto.randomUUID()}` };
        saved = await bound.saveDraft(effective.id, json(effective), null);
        if (alive(bound, generation)) setError("Có bản nháp đã đổi trong tab khác. Đã giữ nội dung của bạn thành bản riêng.");
      }
      if (saved.status !== "saved" || !alive(bound, generation)) throw new Error("Draft could not be saved");
      result = { editor: effective, version: saved.draft.version };
      if (editing.current?.editor.id === value.editor.id) {
        const latest = editing.current.editor;
        editing.current = { editor: { ...latest, id: effective.id }, version: result.version };
        setEditor(editing.current);
      }
    });
    writeChain.current = save; return save.then(() => result);
  }, []);
  const openNew = (entryType: IslandEntryType) => {
    const value: SavedEditor = { version: null, editor: { id: `island-journal-draft:${crypto.randomUUID()}`, entryId: crypto.randomUUID(), expectedVersion: 0, entryType, title: "", body: "", occurredOn: localDate(), sourceSessionId: null, confirmed: false, command: null, status: "draft", remote: null } };
    editing.current = value; setEditor(value); setError(null);
  };
  const openEntry = (entry: IslandEntry) => {
    const value: SavedEditor = { version: null, editor: { id: `island-journal-draft:${crypto.randomUUID()}`, entryId: entry.id, expectedVersion: entry.version, entryType: entry.entryType, title: entry.title, body: entry.body, occurredOn: entry.occurredOn, sourceSessionId: entry.sourceSessionId, confirmed: true, command: null, status: "draft", remote: null } };
    editing.current = value; setEditor(value); setError(null);
  };
  const change = (patch: Partial<Editor>) => {
    if (!editing.current || editing.current.editor.status === "pending") return;
    const value = { ...editing.current, editor: { ...editing.current.editor, ...patch } }; editing.current = value; setEditor(value);
    void persist(value).catch(() => { setError("Chưa lưu được bản nháp trên thiết bị. Giữ cửa sổ này và sao chép nội dung nếu cần."); });
  };
  const closeEditor = async () => {
    if (saving) return;
    const value = editing.current;
    const unchanged = value && value.version === null && value.editor.command === null && entries.some(entry => entry.id === value.editor.entryId && entry.version === value.editor.expectedVersion && entry.title === value.editor.title && entry.body === value.editor.body && entry.occurredOn === value.editor.occurredOn);
    if (value && value.editor.status !== "accepted" && !unchanged) { try { await persist(value); } catch { setError("Chưa lưu được bản nháp. Bạn có thể sao chép nội dung trước khi đóng."); return; } }
    editing.current = null; setEditor(null); const bound = client.current; if (bound) await loadDrafts(bound, epoch.current).catch(() => {});
  };
  const publish = async (kind?: "trash" | "restore") => {
    const bound = client.current; const generation = epoch.current; const current = editing.current; if (!bound || !current || saving) return;
    setSaving(true); setError(null);
    try {
      const e = current.editor; let command = e.command;
      if (!command) {
        const content: IslandEntryContent = { title: e.title.trim(), body: e.body, occurredOn: e.occurredOn };
        command = kind ? { operationId: crypto.randomUUID(), entryId: e.entryId, expectedVersion: e.expectedVersion, kind, payload: {} } : e.expectedVersion === 0
          ? { operationId: crypto.randomUUID(), entryId: e.entryId, expectedVersion: 0, kind: "create", payload: { ...content, entryType: e.entryType, sourceSessionId: e.sourceSessionId, confirmed: e.confirmed } }
          : { operationId: crypto.randomUUID(), entryId: e.entryId, expectedVersion: e.expectedVersion, kind: "update", payload: content };
      }
      if (!parseIslandEntryCommand(command)) { setError("Điền tiêu đề, ngày hợp lệ và xác nhận kỷ niệm trước khi lưu nhé."); return; }
      const pending = await persist({ ...current, editor: { ...e, command, status: "pending" } }); if (!alive(bound, generation)) return;
      editing.current = pending; setEditor(pending);
      const result = await bound.write(command); if (!alive(bound, generation)) return;
      if (result.blocked) { closeAccess(); return; }
      if (!result.receipt) {
        if (result.rejected) { const rejected = await persist({ ...pending, editor: { ...pending.editor, command: null, status: "draft" } }); editing.current = rejected; setEditor(rejected); }
        setError(result.error ?? "Chưa xác nhận được việc lưu. Thử lại đúng bản này khi có kết nối."); return;
      }
      if (result.receipt.outcome === "conflict") {
        const conflict = await persist({ ...pending, editor: { ...pending.editor, status: "conflict", remote: result.receipt.entry } });
        editing.current = conflict; setEditor(conflict); setError("Trang sổ đã đổi. Nội dung của bạn vẫn nằm trong bản nháp; hãy xem bản mới trước khi tiếp tục."); return;
      }
      await persist({ ...pending, editor: { ...pending.editor, status: "accepted" } }); if (!alive(bound, generation)) return;
      editing.current = null; setEditor(null); await refresh(); if (alive(bound, generation)) onChanged();
    } catch { if (alive(bound, generation)) setError("Chưa xác nhận được việc lưu. Bản nháp và thao tác gốc vẫn được giữ để thử lại."); }
    finally { if (alive(bound, generation)) setSaving(false); }
  };
  const visible = parentBlocked || blocked ? [] : entries.filter(entry => tab === "trash" ? !!entry.trashedAt : entry.entryType === tab && !entry.trashedAt);
  const activeEditor = editor?.editor;
  const pending = activeEditor?.status === "pending";
  const currentEntry = entries.find(entry => entry.id === activeEditor?.entryId);
  const disabled = blocked || parentBlocked;
  return (
    <section id="island-journal" className="relative z-10 mx-auto mt-5 max-w-4xl rounded-2xl border border-[var(--forest)]/30 bg-[var(--paper)] p-4 text-[var(--forest)] shadow sm:p-6" aria-label="Sổ kỷ niệm và cột mốc">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold [font-family:var(--font-display)]">Sổ của Đảo</h2><p className="mt-1 text-sm">Giữ một kỷ niệm, đánh dấu một ngày của hai đứa.</p></div><button type="button" className={buttonClass} disabled={busy || disabled} onClick={() => void refresh()}>Làm mới sổ</button></div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Chọn trang sổ"><button id="island-memories" type="button" className={buttonClass} aria-pressed={tab === "memory"} onClick={() => setTab("memory")}>🌸 Kỷ niệm</button><button id="island-milestones" type="button" className={buttonClass} aria-pressed={tab === "milestone"} onClick={() => setTab("milestone")}>⚜️ Cột mốc</button><button type="button" className={buttonClass} aria-pressed={tab === "trash"} onClick={() => setTab("trash")}>Thùng lưu tạm</button></nav>

      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={disabled} onClick={() => openNew("memory")}>Lưu kỷ niệm</button><button type="button" className={buttonClass} disabled={disabled} onClick={() => openNew("milestone")}>Thêm cột mốc</button></div>
      <div aria-live="polite">{cached && <p className="mt-3 text-sm">Đang xem các trang đã lưu trên thiết bị. Kết nối lại để lưu thay đổi.</p>}{error && !editor && <p role="alert" className="mt-3 rounded-xl border border-[var(--forest)]/30 p-3">{error}</p>}</div>
      {busy && entries.length === 0 && <p className="mt-4">Đang mở sổ…</p>}
      {!busy && visible.length === 0 && <p className="mt-4">{tab === "trash" ? "Chưa có trang nào trong thùng lưu tạm." : "Trang này còn trống. Hai đứa có thể để lại điều đầu tiên."}</p>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{visible.map(entry => <li key={entry.id} className="rounded-xl border border-[var(--forest)]/20 bg-white/30 p-4"><h3 className="break-words text-lg font-bold">{entry.title}</h3><p className="mt-1 text-sm"><time dateTime={entry.occurredOn}>{entry.occurredOn.split("-").reverse().join("/")}</time> · {entry.entryType === "memory" ? "Kỷ niệm" : "Cột mốc"}{entry.trashedAt ? " · đang lưu tạm" : ""}</p><p className="mt-3 whitespace-pre-wrap break-words">{entry.body}</p>{entry.sourceSessionId && <a className="mt-3 inline-flex min-h-11 items-center underline" href={`/games?session=${encodeURIComponent(entry.sourceSessionId)}`}>Mở tác phẩm gốc</a>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={disabled} onClick={() => openEntry(entry)}>{entry.trashedAt ? "Xem trang lưu tạm" : "Mở trang / sửa"}</button>{entry.trashedAt && entry.createdBy !== context.accountId && <p className="text-sm">Người tạo có thể khôi phục trang này.</p>}</div></li>)}</ul>
      {next && <button type="button" className={`${buttonClass} mt-4`} disabled={busy || cached || disabled} onClick={() => void refresh(next)}>Mở những trang cũ hơn</button>}

      <p className="mt-3 text-sm">Cả hai được sửa; người tạo được đưa vào thùng lưu tạm và khôi phục. Đảo giữ lịch sử khi một trang được lưu tạm.</p>
      {drafts.length > 0 && !disabled && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-bold">Bản nháp trên thiết bị ({drafts.length})</summary><ul className="space-y-2">{drafts.map(draft => <li key={draft.editor.id}><button type="button" className={buttonClass} onClick={() => { editing.current = draft; setEditor(draft); setError(null); }}>{draft.editor.title || "Trang chưa đặt tên"}{draft.editor.status === "pending" ? " · cần xác nhận lại" : draft.editor.status === "conflict" ? " · có thay đổi cần xem" : ""}</button></li>)}</ul></details>}
      <HomeDialog open={!!editor && !disabled} title={activeEditor?.entryType === "milestone" ? "Một cột mốc của hai đứa" : "Giữ lại một kỷ niệm"} onClose={() => void closeEditor()}>
        {activeEditor && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void publish(); }}>
          {error && <p role="alert" className="rounded-xl border border-[var(--forest)]/30 p-3">{error}</p>}
          <label className="block">Tiêu đề<input className={`${inputClass} mt-1`} maxLength={120} required value={activeEditor.title} readOnly={pending || saving || !!currentEntry?.trashedAt} onChange={event => change({ title: event.target.value })} /></label>
          <label className="block">Ngày của hai đứa<input className={`${inputClass} mt-1`} type="date" required value={activeEditor.occurredOn} readOnly={pending || saving || !!currentEntry?.trashedAt} onChange={event => change({ occurredOn: event.target.value })} /></label>
          <label className="block">Điều muốn giữ lại<textarea className={`${inputClass} mt-1 min-h-32`} maxLength={4000} value={activeEditor.body} readOnly={pending || saving || !!currentEntry?.trashedAt} onChange={event => change({ body: event.target.value })} /></label>
          {activeEditor.entryType === "memory" && activeEditor.expectedVersion === 0 && <><label className="block">Nguồn kỷ niệm<select className={`${inputClass} mt-1`} value={activeEditor.sourceSessionId ?? ""} disabled={pending || saving} onChange={event => change({ sourceSessionId: event.target.value || null })}><option value="">Một ghi chép chung của hai đứa</option>{artifacts.map(game => <option key={game.id} value={game.id}>{game.gameType === "draw-guess" ? "Bức vẽ và đáp án đã mở" : game.prompt}</option>)}</select></label><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5" checked={activeEditor.confirmed} disabled={pending || saving} onChange={event => change({ confirmed: event.target.checked })} /><span>Tôi xác nhận lưu trang này thành kỷ niệm chung. Cả hai thành viên trong Nhà đều đọc được.</span></label></>}
          {activeEditor.sourceSessionId && activeEditor.expectedVersion > 0 && <a href={`/games?session=${encodeURIComponent(activeEditor.sourceSessionId)}`} className="inline-flex min-h-11 items-center underline">Mở tác phẩm gốc</a>}
          {activeEditor.status === "conflict" && activeEditor.remote && <div className="rounded-xl border border-[var(--forest)]/30 p-3"><p>Trang hiện tại: <strong>{activeEditor.remote.title}</strong></p><p className="whitespace-pre-wrap break-words">{activeEditor.remote.body}</p><button type="button" className={`${buttonClass} mt-3`} disabled={saving || !!activeEditor.remote.trashedAt} onClick={() => change({ expectedVersion: activeEditor.remote!.version, command: null, status: "draft", remote: null })}>Đã xem bản mới, tiếp tục với bản nháp của tôi</button><button type="button" className={`${buttonClass} mt-3`} disabled={saving} onClick={() => { const separate = { ...activeEditor, id: `island-journal-draft:${crypto.randomUUID()}`, entryId: crypto.randomUUID(), expectedVersion: 0, command: null, status: "draft" as const, remote: null, sourceSessionId: null, confirmed: false }; const value = { editor: separate, version: null }; editing.current = value; setEditor(value); void persist(value); }}>Giữ thành một trang riêng</button></div>}
          <div className="flex flex-wrap gap-2">
            {(pending || !currentEntry?.trashedAt) && activeEditor.status !== "conflict" && <button type="submit" className={buttonClass} disabled={saving}>{saving ? "Đang xác nhận…" : pending ? "Thử lại đúng thao tác này" : activeEditor.expectedVersion === 0 && activeEditor.entryType === "memory" ? "Xác nhận lưu kỷ niệm chung" : "Lưu trang"}</button>}
            {currentEntry && currentEntry.createdBy === context.accountId && !pending && activeEditor.status !== "conflict" && <button type="button" className={buttonClass} disabled={saving} onClick={() => void publish(currentEntry.trashedAt ? "restore" : "trash")}>{currentEntry.trashedAt ? "Khôi phục trang" : "Đưa vào thùng lưu tạm"}</button>}
            <button type="button" className={buttonClass} disabled={saving} onClick={() => void closeEditor()}>Đóng và giữ bản nháp</button>
          </div>
          {pending && <p role="status" className="text-sm">Thao tác đã được giữ nguyên. Thử lại sẽ không tạo hai trang hoặc ghi đè thay đổi của người kia.</p>}
        </form>}
      </HomeDialog>
    </section>
  );
}
