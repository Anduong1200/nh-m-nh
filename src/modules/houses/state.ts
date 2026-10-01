import "server-only";
import { loadPhase2State, type Phase2State } from "@/modules/presence/server";
import { getActiveBoardItems } from "@/modules/board/server";
import type { BoardItem } from "@/modules/board/model";

/** Home composition owns optional domains; Presence/Knock never depends on Board. */
export type HomeState = Phase2State & { boardItems?: BoardItem[]; boardError?: string };

export async function loadHomeState(houseId: string): Promise<HomeState> {
  const state = await loadPhase2State(houseId); // Denies invalid identity/membership before optional reads.
  try {
    const result = await getActiveBoardItems(houseId);
    if (result.items && !result.error && result.items.every((item) => item.houseId === houseId)) {
      return { ...state, boardItems: result.items };
    }
  } catch { /* Report Board failure without taking Presence/Knock offline. */ }
  return { ...state, boardError: "Chưa tải được bảng chung. Bạn có thể thử làm mới Nhà." };
}
