"use client";
import { useEffect, useState } from "react";
import { AccountOfflineStore } from "@/lib/offline/store";
import { BoardSyncSession } from "@/modules/board/sync";
import { boardActionTransport } from "@/modules/board/transport";
export function SyncCoordinator({ accountId, houseId }: { accountId: string; houseId: string }) {
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const store = new AccountOfflineStore(accountId);
    const session = new BoardSyncSession({ accountId, houseId }, store, boardActionTransport, () => navigator.onLine);
    let active = true;
    const drain = () => {
      if (!navigator.onLine) return;
      void session.drain().then(async () => {
        const operations = await store.listOperations();
        if (active) setConflict(operations.some(o => o.houseId === houseId && o.state === "conflict"));
      }).catch(() => {});
    };
    drain();
    addEventListener("online", drain);
    addEventListener("nha-minh:board-queue", drain);
    return () => { active = false; session.stop(); store.close(); removeEventListener("online", drain); removeEventListener("nha-minh:board-queue", drain); };
  }, [accountId, houseId]);
  return conflict ? <p role="status" className="fixed bottom-4 right-4 z-[100] max-w-xs rounded bg-[var(--paper)] p-3 text-[var(--forest)]">Có hai bản của một ghi chú. Mở Bảng Chung để chọn bản muốn giữ.</p> : null;
}

