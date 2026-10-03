"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Board } from "@/components/phase3/board";
import { AccountOfflineStore } from "@/lib/offline/store";
import { subscribeAccountInvalidation } from "@/lib/offline";
import type { BoardItem } from "@/modules/board/model";
import { getBoardSnapshotAction } from "@/modules/board/actions";
export function BoardRoom({ accountId, houseId, initialItems, initialError }: {
  accountId: string; houseId: string; initialItems: BoardItem[]; initialError: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const store = new AccountOfflineStore(accountId);
    const close = () => setBlocked(true);
    const unsubscribe = subscribeAccountInvalidation(accountId, close);
    const timer = setInterval(() => void store.assertCurrent().catch(close), 1000);
    return () => { unsubscribe(); clearInterval(timer); store.close(); };
  }, [accountId]);
  async function retry() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      const result = await getBoardSnapshotAction({ accountId, houseId });
      if (result.blocked) { setBlocked(true); return; }
      if (!result.items || result.context?.accountId !== accountId || result.context.houseId !== houseId) { setError(result.error ?? "Chưa mở được Bảng Chung."); return; }
      setItems(result.items); setError(null);
    } catch { setError("Chưa kết nối được với Bảng Chung. Bạn có thể thử lại."); }
    finally { setBusy(false); }
  }
  if (blocked || error) return <main id="main-content" className="state-page"><div className="state-paper" role="alert">
    <h1>{blocked ? "Bảng Chung đã đóng." : "Chưa mở được Bảng Chung."}</h1>
    <p>{blocked ? "Cần xác nhận lại quyền vào Nhà." : error}</p>
    {!blocked && <button type="button" className="primary-button" disabled={busy} onClick={() => void retry()}>{busy ? "Đang mở…" : "Thử lại"}</button>}
    <p><a href="/house">Về Nhà</a> · <a href="/offline">Nháp trên thiết bị</a></p>
  </div></main>;
  return <main id="main-content"><Board accountId={accountId} houseId={houseId} initialItems={items} onClose={() => router.push("/house")} /></main>;
}
