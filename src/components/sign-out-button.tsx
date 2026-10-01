"use client";

import { useState } from "react";
import { AccountOfflineStore, clearAccountOfflineData } from "@/lib/offline";
import { signOutAction } from "@/modules/houses/actions";

/** Account ID is supplied by verified server identity, never a user form. */
export function SignOutButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if ("indexedDB" in window) {
        const store = new AccountOfflineStore(userId);
        let hasPending = false;
        try {
          const [drafts, operations] = await Promise.all([store.listDrafts(), store.listOperations()]);
          hasPending = drafts.length > 0 || operations.length > 0;
        } finally {
          store.close();
        }
        if (hasPending && !window.confirm("Có bản nháp chưa đồng bộ trên thiết bị này. Đăng xuất sẽ xóa các bản nháp đó. Bạn có muốn tiếp tục?")) {
          setBusy(false);
          return;
        }
        await clearAccountOfflineData(userId);
      }
      await signOutAction();
    } catch {
      setError("Chưa thể đăng xuất an toàn. Bạn có thể thử lại.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="sign-out-button" onClick={() => void signOut()} disabled={busy}>
        {busy ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
