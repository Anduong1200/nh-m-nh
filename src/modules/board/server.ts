import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { boardItemFromRow, type BoardItem } from "./model";

/** Internal read: callers verify actor/House first. RLS remains authoritative. */
export async function readBoardItems(houseId: string, includeTrash = false): Promise<{ items?: BoardItem[]; error?: string }> {
  const client = await createSupabaseServerClient();
  let query = client.from("board_objects").select("id, house_id, created_by, type, payload, media_id, x, y, rotation, z_index, version, created_at, updated_at, deleted_at").eq("house_id", houseId);
  if (!includeTrash) query = query.is("deleted_at", null);
  const { data, error } = await query.order("z_index", { ascending: true }).order("id", { ascending: true });
  if (error || !data) return { error: "Chưa tải được bảng chung." };
  const items: BoardItem[] = [];
  for (const row of data) {
    const item = boardItemFromRow(row);
    if (!item || item.houseId !== houseId) return { error: "Chưa xác nhận được dữ liệu bảng chung." };
    items.push(item);
  }
  return { items };
}
export async function getActiveBoardItems(houseId: string) {
  const user = await requireVerifiedUser();
  const house = await getMyHouse();
  if (!house || house.id !== houseId || !house.members.some((m) => m.user_id === user.id)) return { error: "Bạn không có quyền mở bảng này." };
  return readBoardItems(houseId);
}
