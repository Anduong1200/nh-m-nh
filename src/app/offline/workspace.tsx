"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AccountOfflineStore, getOfflineRecoveryContext, type OfflineDraft, type OfflineRecoveryContext, type RecentContent } from "@/lib/offline/store";
import { subscribeAccountInvalidation } from "@/lib/offline/invalidation";
import { recoverRecentContent } from "@/lib/offline/recovery";
import { GameArtifact } from "@/components/phase4/games/game-ui";
import "./workspace.css";
const Board = dynamic(() => import("@/components/phase3/board").then(module => module.Board), { ssr: false, loading: () => <p role="status">Đang mở Bảng Chung trên thiết bị…</p> });
const Whiteboard = dynamic(() => import("@/components/phase3/whiteboard").then(module => module.Whiteboard), { ssr: false, loading: () => <p role="status">Đang mở bản vẽ trên thiết bị…</p> });
type Verification = "checking" | "offline" | "verified" | "blocked";
function OfflinePhoto() { return <p>Ảnh riêng tư cần kết nối để xem.</p>; }
export function OfflineWorkspace() {
  const [context, setContext] = useState<OfflineRecoveryContext | null>(null);
  const [loaded, setLoaded] = useState(false), [opened, setOpened] = useState(false);
  const [verification, setVerification] = useState<Verification>("checking");
  const [recent, setRecent] = useState<RecentContent[]>([]), [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [panel, setPanel] = useState<"board" | "whiteboard" | null>(null), [error, setError] = useState("");
  const storeRef = useRef<AccountOfflineStore | null>(null);
  const verifySequence = useRef({ value: 0 });
  useEffect(() => {
    let active = true;
    void getOfflineRecoveryContext().then(binding => { if (active) { setContext(binding); setLoaded(true); if (!binding) setVerification("blocked"); } }).catch(() => { if (active) { setLoaded(true); setError("Chưa đọc được dữ liệu trên thiết bị. Nội dung cũ vẫn được giữ."); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!context) return;
    const store = new AccountOfflineStore(context.accountId);
    storeRef.current = store;
    const counter = verifySequence.current;
    let active = true, denied = false, request: AbortController | null = null;
    function block() { denied = true; counter.value++; request?.abort(); if (active) { setVerification("blocked"); setOpened(false); setPanel(null); setRecent([]); setDrafts([]); } }
    async function verify() {
      if (denied) return;
      const sequence = ++counter.value;
      request?.abort();
      const controller = new AbortController(); request = controller;
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        await store.assertCurrent();
        const binding = await getOfflineRecoveryContext();
        if (!binding || binding.accountId !== context!.accountId || binding.houseId !== context!.houseId || binding.epoch !== context!.epoch) { block(); return; }
        if (!navigator.onLine) { if (active && sequence === counter.value) setVerification("offline"); return; }
        if (active) setVerification("checking");
        const response = await fetch("/house/state", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!active || sequence !== counter.value) return;
        if (response.status === 401 || response.status === 403) { block(); return; }
        if (!response.ok) { setVerification("offline"); return; }
        const value = await response.json() as { currentUserId?: string; house?: { id?: string; state?: string; members?: { user_id?: string }[] } };
        await store.assertCurrent();
        if (!active || sequence !== counter.value) return;
        if (value.currentUserId !== context!.accountId || value.house?.id !== context!.houseId || value.house.state !== "active" || value.house.members?.length !== 2 || !value.house.members.some(member => member.user_id === context!.accountId)) { block(); return; }
        setVerification("verified");
      } catch {
        if (active && !denied && sequence === counter.value) {
          try { await store.assertCurrent(); } catch { block(); return; }
          setVerification("offline");
        }
      }
      finally { clearTimeout(timeout); }
    }
    const connection = () => { void verify(); };
    const unsubscribe = subscribeAccountInvalidation(context.accountId, block);
    const timer = setInterval(() => { void store.assertCurrent().then(async () => {
      const binding = await getOfflineRecoveryContext();
      if (!binding || binding.accountId !== context.accountId || binding.houseId !== context.houseId || binding.epoch !== context.epoch) block();
    }).catch(block); }, 1000);
    addEventListener("online", connection); addEventListener("offline", connection);
    void verify();
    return () => { active = false; counter.value++; request?.abort(); clearInterval(timer); unsubscribe(); removeEventListener("online", connection); removeEventListener("offline", connection); store.close(); storeRef.current = null; };
  }, [context]);
  async function openSaved() {
    if (!context || verification === "blocked" || verification === "checking") return;
    try {
      const generation = verifySequence.current.value;
      const store = storeRef.current;
      if (!store) return;
      const [rows, local] = await Promise.all([store.listRecent(), store.listDrafts()]);
      await store.assertCurrent();
      if (generation !== verifySequence.current.value) return;
      const binding = await getOfflineRecoveryContext();
      if (binding?.accountId !== context.accountId || binding.houseId !== context.houseId || binding.epoch !== context.epoch) return;
      setRecent(rows.filter(row => row.houseId === context.houseId));
      setDrafts(local.filter(row => row.houseId === context.houseId));
      setOpened(true); setError("");
    } catch { setError("Chưa mở được bản đã lưu. Nội dung trên thiết bị vẫn được giữ."); }
  }
  async function exportSaved() {
    if (!context || verification === "blocked" || verification === "checking") return;
    try {
      const generation = verifySequence.current.value;
      const store = storeRef.current; if (!store) return;
      const [local, operations, content] = await Promise.all([store.listDrafts(), store.listOperations(), store.listRecent()]);
      await store.assertCurrent();
      if (generation !== verifySequence.current.value) return;
      const binding = await getOfflineRecoveryContext();
      if (binding?.accountId !== context.accountId || binding.houseId !== context.houseId || binding.epoch !== context.epoch) return;
      const value = { schemaVersion: 1, exportedAt: new Date().toISOString(), houseId: context.houseId,
        drafts: local.filter(row => row.houseId === context.houseId), operations: operations.filter(row => row.houseId === context.houseId), recent: content.filter(row => row.houseId === context.houseId) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "nha-minh-local-content.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("Chưa xuất được bản đã lưu. Bạn có thể thử lại."); }
  }
  const visible = context && opened && verification !== "blocked";
  const saved = context ? recoverRecentContent(recent, context) : { letters: [], games: [], entries: [] };
  return <main id="main-content" tabIndex={-1} className="recovery-page">
    <header><p className="eyebrow">NHÀ MÌNH · TRÊN THIẾT BỊ NÀY</p><h1>Những điều vẫn ở lại.</h1><p>Đọc bản gần đây, giữ ghi chú và nét vẽ khi chưa kết nối được với Nhà.</p><p><a href="/house">Thử về Nhà</a> · <a href="/auth/sign-in">Đăng nhập</a></p></header>
    {!loaded && <p role="status">Đang kiểm tra bản đã lưu…</p>}
    {loaded && !context && <p>Chưa có không gian đã xác nhận trên thiết bị này, hoặc lần xác nhận đã quá 7 ngày. Kết nối và mở Nhà để chuẩn bị sử dụng offline; bản nháp cũ không bị xóa.</p>}
    {context && <section aria-label="Không gian đã lưu"><h2>{context.houseName}</h2><p>Không gian gần nhất của {context.displayName}. Dữ liệu trên thiết bị chưa được mã hóa đầu cuối; hãy dùng thiết bị bạn tin cậy.</p>
      <p role="status">{verification === "checking" ? "Đang xác nhận kết nối và tài khoản…" : verification === "blocked" ? "Cần đăng nhập đúng tài khoản và Nhà để mở lại. Bản nháp vẫn được giữ." : verification === "verified" ? "Đã xác nhận tài khoản và Nhà. Các lần lưu chờ có thể đồng bộ." : "Chưa kết nối được với Nhà. Mọi thao tác ở đây được giữ trên thiết bị."}</p>
      <button disabled={verification === "checking" || verification === "blocked"} onClick={() => void openSaved()}>Mở bản đã lưu</button>
      <button disabled={verification === "checking" || verification === "blocked"} onClick={() => void exportSaved()}>Xuất nội dung trên thiết bị</button>
    </section>}
    {error && <p role="alert">{error}</p>}
    {visible && <div hidden={verification === "checking"}>
      <nav aria-label="Nháp offline"><button onClick={() => setPanel("board")}>Ghi chú / doodle trên Bảng</button><button onClick={() => setPanel("whiteboard")}>Bảng vẽ chung trên thiết bị</button></nav>
      <section><h2>Thư đã được phép đọc</h2>{!saved.letters.length && <p>Chưa có thư được lưu gần đây.</p>}{saved.letters.map(letter => <article key={letter.id}><h3>{letter.content === null ? "Phong bì còn niêm phong" : "Thư đã lưu"}</h3><p>{letter.clue}</p>{letter.content !== null && <p className="recovery-content">{letter.content}</p>}{letter.content === null && <p>Kết nối để mở thư theo đúng điều kiện; thời gian trên thiết bị không tự mở nội dung.</p>}</article>)}</section>
      <section><h2>Kỷ vật trò chơi</h2>{!saved.games.length && <p>Chưa có màn chơi được lưu gần đây.</p>}{saved.games.map(game => <article key={game.id}><h3>{game.prompt || "Màn chơi của hai đứa"}</h3><GameArtifact session={game} Photo={OfflinePhoto} /></article>)}</section>
      <section><h2>Kỷ niệm / cột mốc</h2>{!saved.entries.length && <p>Chưa có kỷ niệm hoặc cột mốc được lưu gần đây.</p>}{saved.entries.map(entry => <article key={entry.id}><h3>{entry.title}</h3><p>{entry.occurredOn}</p><p className="recovery-content">{entry.body}</p></article>)}</section>
      <section><h2>Bản nháp chưa gửi</h2><p>{drafts.length} bản nháp trong Nhà này. Dùng Bảng/Bảng vẽ để viết tiếp; các bản khác có thể xuất ra và mở lại khi kết nối.</p></section>
      {panel === "board" && <Board accountId={context.accountId} houseId={context.houseId} initialItems={[]} syncEnabled={verification === "verified"} onClose={() => { setPanel(null); void openSaved(); }} />}
      {panel === "whiteboard" && <Whiteboard accountId={context.accountId} houseId={context.houseId} syncEnabled={verification === "verified"} onClose={() => { setPanel(null); void openSaved(); }} />}
    </div>}
  </main>;
}
