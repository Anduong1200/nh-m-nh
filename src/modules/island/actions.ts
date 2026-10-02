"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseGameContext, type GameContext } from "@/modules/games/model";
import { parseIslandState, type IslandState } from "./model";

export type IslandReadResult = { context?: GameContext; state?: IslandState; error?: string; blocked?: boolean };
/** Read-only: there is deliberately no append-event or update-level action. */
export async function readIslandStateAction(expectedContext: unknown): Promise<IslandReadResult> {
  try {
    const user = await requireVerifiedUser();
    const context = parseGameContext(expectedContext);
    const house = await getMyHouse();
    if (!context || context.accountId !== user.id || house?.id !== context.houseId || !house.members.some(m => m.user_id === user.id)) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("get_island_state", { p_house_id: context.houseId });
    const state = error ? null : parseIslandState(data);
    if (!state || state.houseId !== context.houseId) return { error: "Chưa tải được Đảo Chung.", blocked: error?.code === "42501" || error?.code === "28000" };
    return { context, state };
  } catch { return { error: "Chưa tải được Đảo Chung. Bạn có thể thử lại." }; }
}
