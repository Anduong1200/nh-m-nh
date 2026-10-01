"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type BoardItem, boardItemFromRow, parseBoardItemInput, parseBoardItemUpdate } from "./model";

export async function appendBoardObjectAction(input: unknown): Promise<{ item?: BoardItem; error?: string }> {
  const parsed = parseBoardItemInput(input);
  if (parsed.error || !parsed.value) return { error: parsed.error ?? "Dữ liệu không hợp lệ" };
  const { id, type, payload, x, y, rotation, zIndex } = parsed.value;

  const supabase = await createSupabaseServerClient("read-write");
  const { data, error } = await supabase.rpc("append_board_object", {
    p_id: id,
    p_type: type,
    p_payload: payload,
    p_x: x ?? 0,
    p_y: y ?? 0,
    p_rotation: rotation ?? 0,
    p_z_index: zIndex ?? 0,
  });

  const item = boardItemFromRow(Array.isArray(data) ? data[0] : data);
  if (error || !item || item.id !== id) {
    if (error?.code === "42501" || error?.code === "28000") {
      return { error: "Không thể thêm vào bảng. Có thể bạn không còn trong Nhà này." };
    }
    return { error: "Chưa lưu được vào bảng chung." };
  }

  return { item };
}

export async function updateBoardObjectAction(input: unknown): Promise<{ item?: BoardItem; error?: string; conflict?: boolean }> {
  const parsed = parseBoardItemUpdate(input);
  if (parsed.error || !parsed.value) return { error: parsed.error ?? "Dữ liệu không hợp lệ" };
  
  const { id, expectedVersion, payload, x, y, rotation, zIndex, deleted } = parsed.value;

  const supabase = await createSupabaseServerClient("read-write");
  const { data, error } = await supabase.rpc("update_board_object", {
    p_id: id,
    p_expected_version: expectedVersion,
    p_payload: payload !== undefined ? payload : null,
    p_x: x !== undefined ? x : null,
    p_y: y !== undefined ? y : null,
    p_rotation: rotation !== undefined ? rotation : null,
    p_z_index: zIndex !== undefined ? zIndex : null,
    p_deleted: deleted !== undefined ? deleted : null,
  });

  const item = boardItemFromRow(Array.isArray(data) ? data[0] : data);
  if (error || !item || item.id !== id) {
    if (error?.code === "40001") {
      return { error: "Vật dụng này vừa được người kia cập nhật. Hãy thử lại với nội dung mới nhất.", conflict: true };
    }
    if (error?.code === "P0002") {
      return { error: "Vật dụng không tồn tại hoặc đã bị xóa." };
    }
    return { error: "Chưa lưu được thay đổi." };
  }

  return { item };
}
