"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountOfflineStore, subscribeAccountInvalidation } from "@/lib/offline";
import { readIslandStateAction } from "@/modules/island/actions";
import { listGameSessionsAction } from "@/modules/games/actions";
import { IslandClient, parseIslandView, type IslandTransport, type IslandView } from "@/modules/island/client";
import type { GameContext } from "@/modules/games/model";
import { SharedIsland } from "@/components/phase4/shared-island";

const productionTransport: IslandTransport = { read: readIslandStateAction, list: listGameSessionsAction };

export function IslandWorkspace({ context, initialView, initialError = null, transport = productionTransport }: {
  context: GameContext;
  initialView: IslandView | null;
  initialError?: string | null;
  transport?: IslandTransport;
}) {
  const [view, setView] = useState<IslandView | null>(() => parseIslandView(initialView, context));
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(initialError);
  const [blocked, setBlocked] = useState(false);
  const client = useRef<IslandClient | null>(null);
  const generation = useRef(0);
  const refreshing = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(async () => {
    const bound = client.current;
    if (!bound || refreshing.current) return;
    const epoch = generation.current;
    refreshing.current = true;
    setBusy(true);
    try {
      const result = await bound.refresh();
      if (epoch !== generation.current || client.current !== bound) return;
      if (result.blocked) {
        invalidate(); client.current = null; refreshing.current = false;
        setView(null); setCached(false); setBusy(false); setBlocked(true); setError(result.error ?? "Cần xác nhận lại quyền vào Nhà.");
        return;
      }
      else if (result.view) setView(result.view);
      setCached(result.cached);
      setError(result.error ?? null);
    } catch {
      if (epoch !== generation.current || client.current !== bound) return;
      try {
        const previous = await bound.cached();
        if (epoch !== generation.current || client.current !== bound) return;
        if (previous) { setView(previous); setCached(true); }
      } catch { /* The generation barrier forbids stale account reads. */ }
      setError("Chưa làm mới được Đảo. Bạn có thể thử lại.");
    } finally {
      if (epoch === generation.current && client.current === bound) { refreshing.current = false; setBusy(false); }
    }
  }, [invalidate]);

  useEffect(() => {
    let disposed = false;
    const store = new AccountOfflineStore(context.accountId);
    const bound = new IslandClient(context, store, transport, () => navigator.onLine);
    client.current = bound;
    refreshing.current = false;
    const unsubscribe = subscribeAccountInvalidation(context.accountId, () => {
      invalidate(); bound.stop(); client.current = null;
      setView(null); setCached(false); setBusy(false); setBlocked(true);
      setError("Đăng nhập lại để mở Đảo của Nhà.");
    });
    void (async () => {
      try {
        if (initialView) await bound.remember(initialView);
        else {
          const previous = await bound.cached();
          if (!disposed && client.current === bound && previous) { setView(previous); setCached(true); }
        }
      } catch { /* No unverified snapshot is displayed after a storage failure. */ }
      if (!disposed && client.current === bound) await refresh();
    })();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(() => { if (navigator.onLine) refreshVisible(); }, 30_000);
    window.addEventListener("online", refreshVisible);
    window.addEventListener("offline", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true; invalidate(); bound.stop(); store.close(); unsubscribe();
      if (client.current === bound) client.current = null;
      window.clearInterval(timer); window.removeEventListener("online", refreshVisible); window.removeEventListener("offline", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [context, initialView, invalidate, refresh, transport]);

  return <SharedIsland view={view} cached={cached} busy={busy} error={error} blocked={blocked} onRefresh={() => void refresh()} />;
}
