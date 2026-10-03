"use client";
import { useEffect } from "react";
import { AccountOfflineStore } from "@/lib/offline/store";
import type { JsonValue } from "@/lib/offline/store";
import type { HouseWithMembers } from "@/modules/houses/server";
import type { HomeState } from "@/modules/houses/state";

/** Props originate from a verified server page. Saves no credentials/private HTML. */
export function RememberOfflineContext({ accountId, houseId, verifiedAt, displayName = "Bạn", houseName = "Nhà Mình", homeData }: {
  accountId: string; houseId: string; verifiedAt: string; displayName?: string; houseName?: string;
  homeData?: { house: HouseWithMembers; state: HomeState };
}) {
  useEffect(() => {
    const store = new AccountOfflineStore(accountId);
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    const timer = setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      // Freeze the generation before an independent identity probe. Late callbacks after
      // logout or account switching cannot re-establish an old page's local namespace.
      await store.assertCurrent();
      const response = await fetch("/house/state", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as { currentUserId?: string; house?: HouseWithMembers };
      if (controller.signal.aborted || data.currentUserId !== accountId || data.house?.id !== houseId ||
          data.house.state !== "active" || data.house.members?.length !== 2 || !data.house.members.some(member => member.user_id === accountId)) return;
      await store.rememberRecoveryContext({ accountId, houseId, verifiedAt: startedAt, displayName, houseName });
      if (homeData) await store.cacheRecent({ id: `home:${houseId}`, houseId, kind: "home", schemaVersion: 1,
        serverVersion: Date.parse(startedAt), payload: JSON.parse(JSON.stringify({ ...homeData, currentUserId: accountId })) as JsonValue });
    })().catch(() => {}).finally(() => { clearTimeout(timer); store.close(); });
    return () => { controller.abort(); clearTimeout(timer); store.close(); };
  }, [accountId, houseId, verifiedAt, displayName, houseName, homeData]);
  return null;
}
