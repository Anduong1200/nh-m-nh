import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BoardItem } from "./model";

export async function getActiveBoardItems(): Promise<{ items?: BoardItem[]; error?: string }> {
  const supabase = await createSupabaseServerClient("read-only");
  const { data, error } = await supabase
    .from("board_objects")
    .select("id, house_id, created_by, type, payload, x, y, rotation, z_index, version, created_at, updated_at, deleted_at")
    .is("deleted_at", null)
    .order("z_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) {
    return { error: "Không tải được bảng chung. Vui lòng thử lại sau." };
  }

  const items: BoardItem[] = data.map((item: any) => ({
    id: item.id,
    houseId: item.house_id,
    createdBy: item.created_by,
    type: item.type as "note" | "link",
    payload: item.payload,
    x: Number(item.x),
    y: Number(item.y),
    rotation: Number(item.rotation),
    zIndex: item.z_index,
    version: item.version,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at,
  }));

  return { items };
}
