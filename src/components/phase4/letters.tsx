"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HomeDialog } from "@/components/phase2/home-dialog";
import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { subscribeAccountInvalidation } from "@/lib/offline";
import { LetterClient, type LetterTransport } from "@/modules/letters/client";
import { letterTransport } from "@/modules/letters/transport";
import { listLettersAction } from "@/modules/letters/actions";
import { LETTER_SCHEMA_VERSION, parseLetter, type Letter, type LetterCommand, type LetterContext, type RevealSession } from "@/modules/letters/model";
import { composeCommand, emptyLetterForm, parseComposerDraft, preferLetterProjection, type ComposerDraft, type LetterForm } from "@/app/letters/ui-model";

type ListResult = Awaited<ReturnType<typeof listLettersAction>>;
type Runtime = { store: AccountOfflineStore; client: LetterClient; closed: boolean };
type DraftChoice = { id: string; label: string };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const draftLabel = (draft: ComposerDraft) => `${draft.pending ? "Chờ xác nhận · " : ""}${Array.from(draft.form.content.replace(/\s+/gu, " ")).slice(0, 35).join("") || "Nháp chưa có nội dung"}`;
function subscribeOnline(listener: () => void) { window.addEventListener("online", listener); window.addEventListener("offline", listener); return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); }; }
const browserOnline = () => navigator.onLine;
const dateText = (value: string, zone?: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", ...(zone ? { timeZone: zone } : {}) }).format(new Date(value));
async function cacheProjection(runtime: Runtime, letter: Letter) {
  const cached = await runtime.client.cached(letter.id);
  const accepted = preferLetterProjection(cached ?? undefined, letter);
  await runtime.store.cacheRecent({ id: `letter:${letter.id}`, houseId: letter.houseId, kind: "letter", schemaVersion: LETTER_SCHEMA_VERSION, serverVersion: accepted.version, payload: json(accepted) });
  return accepted;
}

/** Displays actor-specific server projections. Opening/sending never follows a local animation or clock. */
export function LettersScreen({ context, initialLetters, names = {}, initialError = null, transport = letterTransport, list = listLettersAction }: {
  context: LetterContext; initialLetters: Letter[]; names?: Record<string, string>; initialError?: string | null;
  transport?: LetterTransport; list?: (context: LetterContext) => Promise<ListResult>;
}) {
  const router = useRouter();
  const [letters, setLetters] = useState(initialLetters.filter(letter => parseLetter(letter, context)));
  const [selected, setSelected] = useState<Letter | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState<LetterForm>(emptyLetterForm);
  const [pending, setPending] = useState<LetterCommand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftConflict, setDraftConflict] = useState(false);
  const [draftChoices, setDraftChoices] = useState<DraftChoice[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState(`letter:composer:${context.houseId}`);
  const [room, setRoom] = useState<RevealSession | null>(null);
  const [roomDisconnected, setRoomDisconnected] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, browserOnline, () => true);
  const runtime = useRef<Runtime | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const roomRef = useRef<RevealSession | null>(null);
  const active = useRef(true);
  const locked = useRef(false);
  const draftId = useRef(`letter:composer:${context.houseId}`);
  const draftVersions = useRef(new Map<string, number | null>());
  const saves = useRef<Promise<boolean>>(Promise.resolve(true));
  const failedDraft = useRef(false);
  const openAttempt = useRef<LetterCommand | null>(null);
  const dialogGeneration = useRef(0);
  const readGeneration = useRef(0);
  const ownName = names[context.accountId] || "Mình";
  const name = (id: string) => id === context.accountId ? ownName : names[id] || "Người thương";

  const invalidate = useCallback(() => {
    readGeneration.current += 1; dialogGeneration.current += 1;
    if (runtime.current) { runtime.current.closed = true; runtime.current.client.stop(); }
    detach.current?.(); detach.current = null;
    if (active.current) { setBlocked(true); setLetters([]); setSelected(null); setComposing(false); setRoom(null); setForm(emptyLetterForm()); setPending(null); }
  }, []);

  const updateLetter = useCallback((letter: Letter) => {
    if (!active.current) return;
    setLetters(current => [preferLetterProjection(current.find(item => item.id === letter.id), letter), ...current.filter(item => item.id !== letter.id)]);
    setSelected(current => current?.id === letter.id ? preferLetterProjection(current, letter) : current);
  }, []);

  const saveLocal = useCallback((draft: ComposerDraft) => {
    const id = draftId.current;
    const run = async () => {
      const current = runtime.current;
      if (!current || current.closed || failedDraft.current) return false;
      try {
        const result = await current.store.saveDraft({ id, houseId: context.houseId, kind: "letter", schemaVersion: LETTER_SCHEMA_VERSION, payload: json(draft), expectedVersion: draftVersions.current.get(id) ?? null });
        if (result.status === "conflict") { failedDraft.current = true; if (active.current) setDraftConflict(true); return false; }
        draftVersions.current.set(id, result.draft.version);
        if (active.current) {
          setDraftChoices(previous => [...previous.filter(choice => choice.id !== id), ...((draft.form.content || draft.form.clue || draft.pending) ? [{ id, label: draftLabel(draft) }] : [])]);
          setNotice("Bản nháp đã lưu trên thiết bị này.");
        }
        return true;
      } catch {
        if (active.current) setError("Chưa lưu được bản nháp trên thiết bị. Giữ cửa sổ này và thử lại nhé.");
        return false;
      }
    };
    const next = saves.current.then(run, run);
    saves.current = next;
    return next;
  }, [context.houseId]);

  const refresh = useCallback(async () => {
    const current = runtime.current;
    if (!current || current.closed || locked.current) return;
    const generation = ++readGeneration.current;
    try {
      await current.store.assertCurrent();
      if (!navigator.onLine) {
        const rows = await current.store.listRecent();
        const values = rows.filter(row => row.kind === "letter" && row.houseId === context.houseId && row.schemaVersion === LETTER_SCHEMA_VERSION).flatMap(row => { const letter = parseLetter(row.payload, context); return letter ? [letter] : []; });
        if (active.current && !current.closed) { setLetters(values); setCached(true); }
        return;
      }
      const result = await list(context);
      await current.store.assertCurrent();
      if (current.closed || !active.current || generation !== readGeneration.current) return;
      if (result.blocked) { invalidate(); return; }
      if (result.error || result.context?.accountId !== context.accountId || result.context.houseId !== context.houseId || !result.letters || result.letters.some(letter => !parseLetter(letter, context))) throw new Error("list");
      const projected: Letter[] = [];
      for (const letter of result.letters) projected.push(await cacheProjection(current, letter));
      if (active.current && !current.closed && generation === readGeneration.current) {
        setLetters(previous => projected.map(letter => preferLetterProjection(previous.find(item => item.id === letter.id), letter)));
        setCached(false); setError(null);
        setSelected(previous => { if (!previous) return null; const incoming = projected.find(item => item.id === previous.id); return incoming ? preferLetterProjection(previous, incoming) : null; });
      }
    } catch {
      try { await current.store.assertCurrent(); }
      catch { invalidate(); return; }
      if (active.current) setError("Chưa làm mới được hòm thư. Bạn có thể thử lại; bản nháp vẫn được giữ.");
    }
  }, [context, invalidate, list]);

  useEffect(() => {
    active.current = true;
    const current: Runtime = { store: new AccountOfflineStore(context.accountId), client: null as unknown as LetterClient, closed: false };
    const guarded: LetterTransport = {
      read: async (...args) => { const result = await transport.read(...args); if (result.blocked) invalidate(); return result; },
      apply: async (...args) => { const result = await transport.apply(...args); if (result.blocked) invalidate(); return result; },
      reveal: async (...args) => { const result = await transport.reveal(...args); if (result.blocked) invalidate(); return result; },
    };
    current.client = new LetterClient(context, current.store, guarded, () => navigator.onLine);
    runtime.current = current;
    const unsubscribe = subscribeAccountInvalidation(context.accountId, invalidate);
    let timer: ReturnType<typeof setInterval> | undefined;
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    void (async () => {
      try {
        const drafts = (await current.store.listDrafts()).filter(row => row.kind === "letter" && row.houseId === context.houseId && row.schemaVersion === LETTER_SCHEMA_VERSION && row.id.startsWith("letter:composer:")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const draft = drafts.find(row => parseComposerDraft(row.payload));
        const restored = draft ? parseComposerDraft(draft.payload) : null;
        if (current.closed) return;
        for (const row of drafts) draftVersions.current.set(row.id, row.version);
        setDraftChoices(drafts.flatMap(row => { const value = parseComposerDraft(row.payload); return value && (value.form.content || value.form.clue || value.pending) ? [{ id: row.id, label: draftLabel(value) }] : []; }));
        if (draft && restored) { draftId.current = draft.id; setSelectedDraftId(draft.id); setForm(restored.form); setPending(restored.pending); if (restored.pending) setNotice("Một lần gửi chưa có xác nhận. Thử lại đúng lá thư này để tránh gửi trùng."); }
        else setForm(emptyLetterForm(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"));
        for (const letter of initialLetters) if (parseLetter(letter, context)) await cacheProjection(current, letter);
        if (current.closed) return;
        setReady(true);
        timer = setInterval(() => { void current.store.assertCurrent().catch(invalidate); }, 1000);
        if (!navigator.onLine) await refresh();
      } catch { if (!current.closed) setError("Chưa mở được lưu trữ trên thiết bị. Thử tải lại; thư vẫn nằm trong Nhà."); }
    })();
    window.addEventListener("online", visible); document.addEventListener("visibilitychange", visible);
    const poll = window.setInterval(visible, 20000);
    return () => {
      active.current = false; current.closed = true; detach.current?.(); detach.current = null; unsubscribe();
      const leaving = roomRef.current;
      if (leaving?.status === "active" && navigator.onLine) void transport.reveal({ kind: "leave", letterId: leaving.letterId, sessionId: leaving.sessionId }, context).catch(() => {});
      current.client.stop(); current.store.close();
      window.removeEventListener("online", visible); document.removeEventListener("visibilitychange", visible);
      window.clearInterval(poll); if (timer) clearInterval(timer);
    };
  }, [context, initialLetters, invalidate, refresh, transport]);

  useEffect(() => {
    if (!ready || blocked || draftConflict) return;
    if (!form.content && !form.clue && !pending) return;
    void saveLocal({ form, pending });
  }, [blocked, draftConflict, form, pending, ready, saveLocal]);

  async function closeCompose() { if (await saveLocal({ form, pending }) && active.current) setComposing(false); }
  async function returnHome() {
    if (!ready || blocked || await saveLocal({ form, pending })) router.push("/house");
  }
  async function send(event: FormEvent) {
    event.preventDefault(); const current = runtime.current;
    if (!current || locked.current || !online || !ready || blocked || draftConflict) return;
    readGeneration.current += 1;
    locked.current = true; setBusy(true); setError(null);
    try {
      const command = pending ?? composeCommand(form, { operationId: crypto.randomUUID(), letterId: crypto.randomUUID() });
      setPending(command);
      if (!await saveLocal({ form, pending: command })) throw new Error("Chưa lưu được lần gửi. Bản đang viết vẫn được giữ.");
      const receipt = await current.client.apply(command);
      if (current.closed) return;
      updateLetter(receipt.snapshot); setPending(null); const cleared = emptyLetterForm(form.timeZone); setForm(cleared);
      await saveLocal({ form: cleared, pending: null });
      if (active.current) { setComposing(false); setNotice("Đã gửi lá thư vào Nhà."); }
    } catch (cause) { if (active.current) setError(cause instanceof Error && cause.message !== "No confirmed receipt; retry the same operation, keep draft" ? cause.message : "Chưa nhận được xác nhận gửi. Bản nháp được giữ; thử lại đúng lá thư này."); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }

  async function inspect(letter: Letter) {
    if (locked.current || blocked) return;
    dialogGeneration.current += 1;
    setError(null); setSelected(letter); openAttempt.current = null;
    if (online && runtime.current) {
      try { const fresh = await runtime.current.client.read(letter.id); if (fresh) updateLetter(fresh); }
      catch { setError("Chưa làm mới được lá thư. Nội dung đã lưu vẫn ở đây."); }
    }
  }
  async function openLetter() {
    const current = runtime.current;
    if (!selected?.canOpen || !current || locked.current || !online) return;
    readGeneration.current += 1;
    locked.current = true; setBusy(true); setError(null);
    try {
      openAttempt.current ??= { kind: "open", letterId: selected.id, operationId: crypto.randomUUID() };
      const receipt = await current.client.apply(openAttempt.current); if (!current.closed) updateLetter(receipt.snapshot);
    } catch { if (active.current) setError("Chưa xác nhận được việc mở thư. Thử lại khi kết nối ổn định nhé."); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  function acceptRoom(session: RevealSession | null) {
    if (!active.current) return;
    const previous = roomRef.current;
    if (previous?.status === "revealed") return;
    if (session && previous?.letterId === session.letterId && previous.snapshot.version > session.snapshot.version) return;
    setRoomDisconnected(session === null);
    if (!session) return;
    roomRef.current = session; setRoom(session); updateLetter(session.snapshot);
  }
  async function join() {
    const current = runtime.current;
    if (!selected?.canJoin || !current || locked.current || !online) return;
    const generation = ++dialogGeneration.current;
    detach.current?.(); detach.current = null;
    readGeneration.current += 1;
    locked.current = true; setBusy(true); setError(null);
    try {
      const session = await current.client.reveal({ kind: "join", letterId: selected.id, sessionId: null });
      if (current.closed || generation !== dialogGeneration.current) return;
      acceptRoom(session);
      if (session.status === "active") detach.current = current.client.watchReveal(selected.id, session.sessionId, session => { if (generation === dialogGeneration.current) acceptRoom(session); });
    } catch { if (active.current) setError("Chưa vào được phiên mở thư. Thư vẫn được niêm phong; có thể thử lại."); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function confirm() {
    const current = runtime.current;
    if (!room || !current || room.status !== "active" || roomDisconnected || !online || locked.current) return;
    const generation = dialogGeneration.current;
    readGeneration.current += 1;
    locked.current = true; setBusy(true); setError(null);
    try { const session = await current.client.reveal({ kind: "ready", letterId: room.letterId, sessionId: room.sessionId }); if (generation === dialogGeneration.current) acceptRoom(session); }
    catch { if (active.current) { setRoomDisconnected(true); setError("Chưa xác nhận được phiên mở thư. Vào lại khi cả hai sẵn sàng nhé."); } }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  function closeLetter() {
    dialogGeneration.current += 1;
    detach.current?.(); detach.current = null; const leaving = roomRef.current; roomRef.current = null; setRoom(null); setSelected(null); setRoomDisconnected(false);
    if (leaving?.status === "active" && navigator.onLine && runtime.current) void runtime.current.client.reveal({ kind: "leave", letterId: leaving.letterId, sessionId: leaving.sessionId }).catch(() => {});
  }
  async function keepSeparateDraft() {
    await saves.current; draftId.current = `letter:composer:${crypto.randomUUID()}`; setSelectedDraftId(draftId.current); failedDraft.current = false; setDraftConflict(false); await saveLocal({ form, pending });
  }
  async function switchDraft(id: string) {
    const current = runtime.current;
    if (!current || current.closed || locked.current || draftConflict) return;
    locked.current = true; setBusy(true);
    try {
      if (!await saveLocal({ form, pending })) return;
      const row = await current.store.getDraft(id); const value = parseComposerDraft(row?.payload);
      if (current.closed || !row || row.houseId !== context.houseId || !value) return;
      draftId.current = id; draftVersions.current.set(id, row.version); setSelectedDraftId(id); setForm(value.form); setPending(value.pending); setError(null);
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }

  if (blocked) return <main id="main-content" className="letters-shell"><section className="letters-paper" role="alert"><h1>Cần xác nhận lại quyền vào Nhà.</h1><p>Hòm thư đã đóng trên thiết bị này.</p><a className="letters-button" href="/house">Về Nhà</a></section></main>;
  const received = letters.filter(letter => letter.recipientId === context.accountId);
  const sent = letters.filter(letter => letter.senderId === context.accountId);
  const envelope = (letter: Letter) => <button key={letter.id} type="button" className="letter-envelope" onClick={event => { event.currentTarget.focus(); void inspect(letter); }} aria-label={`Thư ${letter.senderId === context.accountId ? "gửi" : "từ"} ${letter.senderId === context.accountId ? name(letter.recipientId) : name(letter.senderId)}${letter.clue ? `: ${letter.clue}` : ""}`}><span aria-hidden="true" className="letter-stamp">{letter.state === "sealed" ? "♥" : "✉"}</span><span className="letter-person">{letter.senderId === context.accountId ? `Gửi ${name(letter.recipientId)}` : `Từ ${name(letter.senderId)}`}</span>{letter.clue && <span className="letter-clue">{letter.clue}</span>}<span className="letter-envelope-state">{letter.state === "scheduled" ? "Đã hẹn giờ" : letter.state === "sealed" ? (letter.revealTogether ? "Niêm phong · mở cùng nhau" : "Còn niêm phong") : letter.state === "opened" ? "Có thể đọc lại" : "Đã gửi"}</span></button>;
  return <main id="main-content" className="letters-shell">
    <header className="letters-heading"><div><a href="/house" className="letters-back" onClick={event => { event.preventDefault(); void returnHome(); }}>← Về Nhà</a><p className="eyebrow">Một điều để người thương tìm thấy</p><h1>Hòm thư của hai đứa</h1></div><button className="letters-button" type="button" onClick={event => { event.currentTarget.focus(); setComposing(true); }} disabled={!ready}>🪶 Viết thư</button></header>
    <div className="letters-status"><p role="status">{!ready ? "Đang mở hòm thư…" : !online || cached ? "Đang xem bản đã lưu trên thiết bị. Gửi và mở thư cần kết nối." : "Thư riêng của Nhà mình."}</p><button type="button" className="letters-secondary" onClick={() => void refresh()} disabled={!ready || busy}>Làm mới hòm thư</button></div>
    {!composing && !selected && error && <p role="alert" className="letters-error">{error}</p>}
    {!composing && notice && <p role="status" className="letters-notice">{notice}</p>}
    <section className="letters-paper" aria-labelledby="received-heading"><h2 id="received-heading">📬 Thư đã nhận</h2>{received.length ? <div className="letter-envelope-grid">{received.map(envelope)}</div> : <p className="letters-empty">Hòm thư còn trống. Khi có thư đến, phong bì sẽ ở đây.</p>}</section>
    <section className="letters-paper" aria-labelledby="sent-heading"><h2 id="sent-heading">✉ Thư mình gửi</h2>{sent.length ? <div className="letter-envelope-grid">{sent.map(envelope)}</div> : <p className="letters-empty">Để lại một lá thư theo nhịp của bạn.</p>}</section>
    <HomeDialog open={composing} title="Viết thư cho người thương" onClose={() => void closeCompose()}>{composing && <form className="letter-form" onSubmit={event => void send(event)}>
      {error && <p role="alert" className="letters-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && <p className="letters-notice">Lần gửi này đang chờ xác nhận. Nội dung được giữ nguyên khi thử lại để tránh gửi hai lần.</p>}
      {draftChoices.length > 1 && <><label htmlFor="letter-local-draft">Bản nháp trên thiết bị</label><select id="letter-local-draft" value={selectedDraftId} disabled={busy || draftConflict} onChange={event => void switchDraft(event.target.value)}>{draftChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></>}
      {draftConflict && <div role="alert"><p>Một cửa sổ khác đã lưu bản nháp này. Bản bạn đang viết vẫn ở đây.</p><button className="letters-secondary" type="button" onClick={() => void keepSeparateDraft()}>Lưu bản này thành nháp riêng</button></div>}
      <fieldset disabled={busy || pending !== null}>
        <label htmlFor="letter-clue">Gợi ý trên phong bì (tùy chọn)</label><input id="letter-clue" value={form.clue} onChange={event => { if (Array.from(event.target.value).length <= 80) setForm({ ...form, clue: event.target.value }); }} placeholder="Một chiếc lá cho người thương…" />
        <label htmlFor="letter-content">Nội dung thư</label><textarea id="letter-content" rows={8} value={form.content} onChange={event => { if (Array.from(event.target.value).length <= 2000) setForm({ ...form, content: event.target.value }); }} placeholder="Viết điều bạn muốn để lại…" /><p className="letter-count">{Array.from(form.content).length}/2.000 ký tự</p>
        <label htmlFor="letter-delivery">Cách gửi</label><select id="letter-delivery" value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value as LetterForm["mode"] })}><option value="immediate">Gửi ngay</option><option value="scheduled">Hẹn giờ</option></select>
        {form.mode === "scheduled" && <><label htmlFor="letter-time">Giao thư lúc</label><input id="letter-time" type="datetime-local" required value={form.localDateTime} onChange={event => setForm({ ...form, localDateTime: event.target.value, dst: "" })} /><label htmlFor="letter-zone">Múi giờ giao thư</label><input id="letter-zone" required value={form.timeZone} onChange={event => setForm({ ...form, timeZone: event.target.value, dst: "" })} placeholder="Asia/Ho_Chi_Minh" /><label htmlFor="letter-dst">Nếu giờ này xuất hiện hai lần</label><select id="letter-dst" value={form.dst} onChange={event => setForm({ ...form, dst: event.target.value as LetterForm["dst"] })}><option value="">Chưa chọn</option><option value="earlier">Lần sớm hơn</option><option value="later">Lần muộn hơn</option></select><p>Ngày giờ dùng múi giờ ghi ở trên. Hòm thư chỉ giao khi máy chủ xác nhận đến giờ.</p></>}
        <label className="letter-check"><input type="checkbox" checked={form.together} onChange={event => setForm({ ...form, together: event.target.checked })} />Mở cùng nhau</label><p>Cả hai cần vào cùng phiên, giữ kết nối và tự xác nhận mở thư. Có thể rời phiên bất cứ lúc nào.</p>
      </fieldset>
      <div className="letter-actions"><button className="letters-secondary" type="button" onClick={() => void closeCompose()}>Cất bản nháp</button><button className="letters-button" type="submit" disabled={!online || busy || !ready || draftConflict || !form.content.trim()}>{busy ? "Đang xác nhận…" : pending ? "Thử gửi lại lá thư này" : "Niêm phong và gửi"}</button></div>
    </form>}</HomeDialog>
    <HomeDialog open={selected !== null} title={selected ? `Lá thư ${selected.senderId === context.accountId ? "mình gửi" : `từ ${name(selected.senderId)}`}` : "Lá thư"} onClose={closeLetter}>{selected && <article className="letter-reading">
      {error && <p role="alert" className="letters-error">{error}</p>}
      {selected.clue && <p className="letter-clue">{selected.clue}</p>}
      <p>{selected.state === "scheduled" ? "Hẹn giao" : "Giao thư"}: {dateText(selected.deliverAt, selected.delivery.mode === "scheduled" ? selected.delivery.timeZone : undefined)}{selected.delivery.mode === "scheduled" ? ` (${selected.delivery.timeZone})` : ""}</p>
      {selected.content !== null ? <div className="letter-body">{selected.content}</div> : <div className="letter-sealed"><span aria-hidden="true">♥</span><p>Nội dung còn được niêm phong.</p></div>}
      {selected.canOpen && <button type="button" className="letters-button" onClick={() => void openLetter()} disabled={!online || busy}>Mở lá thư</button>}
      {selected.canJoin && <div className="letter-joint"><h3>Mở cùng nhau</h3><p>Hai đứa vào cùng phiên rồi mỗi người xác nhận. Mất kết nối hoặc hết phiên thì thư vẫn được giữ.</p>
        {room?.status === "active" && <><p role="status">{roomDisconnected || !online ? "Phiên đang mất kết nối. Vào lại khi sẵn sàng." : `Có ${room.connectedPlayers}/2 người trong phiên này.`}</p><p>{room.ownReady && !roomDisconnected ? "Bạn đã xác nhận cho phiên này." : "Bạn chưa xác nhận mở trong phiên này."}</p><button type="button" className="letters-button" onClick={() => void confirm()} disabled={busy || !online || roomDisconnected || room.ownReady || !room.ownPresent}>Mình sẵn sàng mở</button></>}
        {room?.status === "expired" && <p role="status">Phiên đã kết thúc. Có thể bắt đầu một phiên mới; thư vẫn niêm phong.</p>}
        {(!room || room.status !== "active" || roomDisconnected || !room.ownPresent) && <button type="button" className="letters-button" onClick={() => void join()} disabled={!online || busy}>Vào phiên mở cùng nhau</button>}
      </div>}
      <button type="button" className="letters-secondary" onClick={closeLetter}>Cất thư lại</button>
    </article>}</HomeDialog>
  </main>;
}
