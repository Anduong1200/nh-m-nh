import { createSupabaseServerClient } from "@/lib/supabase/server";
import { boardItemFromRow, type BoardItem } from "./model";

export async function getActiveBoardItems(houseId: string): Promise<{ items?: BoardItem[]; error?: string }> {
  const supabase = await createSupabaseServerClient("read-only");
  const { data, error } = await supabase
    .from("board_objects")
    .select("id, house_id, created_by, type, payload, x, y, rotation, z_index, version, created_at, updated_at, deleted_at")
    .eq("house_id", houseId)
    .is("deleted_at", null)
    .order("z_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) {
    return { error: "Không tải được bảng chung. Vui lòng thử lại sau." };
  }

  const items: BoardItem[] = [];
  for (const row of data) {
    const item = boardItemFromRow(row);
    if (!item || item.houseId !== houseId) return { error: "Chưa xác nhận được dữ liệu bảng chung." };
    items.push(item);
  }

  return { items };
}
