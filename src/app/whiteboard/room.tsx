"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { subscribeAccountInvalidation } from "@/lib/offline";
import { AccountOfflineStore } from "@/lib/offline/store";
import { Whiteboard } from "@/components/phase3/whiteboard";
export function WhiteboardRoom({ accountId, houseId }: { accountId: string; houseId: string }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const store = new AccountOfflineStore(accountId);
    const close = () => setBlocked(true);
    const unsubscribe = subscribeAccountInvalidation(accountId, close);
    void store.assertCurrent().catch(close);
    const timer = window.setInterval(() => void store.assertCurrent().catch(close), 1000);
    return () => { unsubscribe(); window.clearInterval(timer); store.close(); };
  }, [accountId]);
  if (blocked) return <main id="main-content" className="state-page"><div className="state-paper" role="alert"><h1>Bảng vẽ đã đóng.</h1><p>Cần xác nhận lại quyền vào Nhà.</p><a href="/house">Về Nhà</a></div></main>;
  return <main id="main-content"><Whiteboard accountId={accountId} houseId={houseId} onClose={() => router.push("/house")} /></main>;
}
