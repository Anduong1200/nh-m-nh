"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AccountOfflineStore } from "@/lib/offline/store";
import { appendBoardObjectAction, updateBoardObjectAction } from "@/modules/board/actions";

function subscribeOnline(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
function readOnline() { return typeof navigator !== "undefined" ? navigator.onLine : true; }
function serverOnline() { return true; }

export function SyncCoordinator({ accountId, houseId }: { accountId: string; houseId: string }) {
  const online = useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!online || isSyncing) return;

    const syncQueue = async () => {
      setIsSyncing(true);
      try {
        const store = new AccountOfflineStore(accountId);
        const operations = await store.listOperations();
        
        for (const op of operations) {
          if (op.state === "pending" && op.houseId === houseId) {
            if (op.entity === "note") {
              if (op.mutation === "append") {
                const res = await appendBoardObjectAction(op.payload);
                if (!res.error || res.error.includes("duplicate")) {
                  await store.acknowledgeOperation(op.operationId);
                }
              } else if (op.mutation === "update") {
                const res = await updateBoardObjectAction(op.payload);
                if (res.conflict) {
                  // Wait, store.preserveConflict handles the conflict state.
                  // For now, we will mark it as conflict in the UI.
                  setConflict(true);
                } else if (!res.error) {
                  await store.acknowledgeOperation(op.operationId);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Sync failed:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncQueue();
  }, [online, accountId, houseId, isSyncing]);

  if (!conflict) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-red-100 text-red-800 p-4 rounded shadow-md z-[100]">
      Có xung đột dữ liệu trên bảng. Hãy làm mới lại trang.
      <button 
        className="ml-4 bg-red-600 text-white px-2 py-1 rounded"
        onClick={() => window.location.reload()}
      >
        Làm mới
      </button>
    </div>
  );
}
