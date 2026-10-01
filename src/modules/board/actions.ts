"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyHouse } from "@/modules/houses/server";
import { boardReceiptFromData, parseBoardContext, parseBoardItemInput, parseBoardItemUpdate, type BoardMutation, type BoardReceipt, type BoardItem } from "./model";
import { readBoardItems } from "./server";

export type BoardActionResult = { item?: BoardItem; receipt?: BoardReceipt; error?: string; conflict?: boolean; blocked?: boolean };
async function apply(operation: BoardMutation, expectedContext: unknown): Promise<BoardActionResult> {
  try {
    const user = await requireVerifiedUser();
    const context = parseBoardContext(expectedContext);
    if (!context || context.accountId !== user.id) return { error: "Phiên đăng nhập đã đổi. Bản đang viết vẫn được giữ.", blocked: true };
    const house = await getMyHouse();
    if (!house || house.id !== context.houseId) return { error: "Nhà đã đổi. Bản đang viết vẫn được giữ.", blocked: true };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("apply_board_operation", {
      p_operation_id: operation.operationId, p_house_id: context.houseId, p_item_id: operation.id,
      p_mutation: operation.mutation, p_expected_version: operation.expectedVersion, p_data: operation.data,
    });
    if (error) return { error: "Chưa lưu được thay đổi trên bảng. Bản đang viết vẫn được giữ.", blocked: error.code === "42501" || error.code === "28000" };
    const receipt = boardReceiptFromData(data, context, operation);
    if (!receipt) return { error: "Chưa xác nhận được lần lưu. Bạn có thể thử lại." };
    if (receipt.outcome === "conflict") return { receipt, conflict: true, error: "Vật dụng đã thay đổi. Chọn bản bạn muốn giữ." };
    return { item: receipt.item, receipt };
  } catch { return { error: "Chưa xác nhận được kết nối và quyền vào Nhà. Bản đang viết vẫn được giữ." }; }
}
export async function appendBoardObjectAction(input: unknown, expectedContext?: unknown): Promise<BoardActionResult> {
  const parsed = parseBoardItemInput(input);
  if (!parsed.value) return { error: parsed.error ?? "Dữ liệu không hợp lệ." };
  const { id, operationId, ...data } = parsed.value;
  return apply({ id, operationId, mutation: "append", expectedVersion: 0, data }, expectedContext);
}
export async function updateBoardObjectAction(input: unknown, expectedContext?: unknown): Promise<BoardActionResult> {
  const parsed = parseBoardItemUpdate(input);
  if (!parsed.value) return { error: parsed.error ?? "Dữ liệu không hợp lệ." };
  const { id, operationId, expectedVersion, deleted, ...data } = parsed.value;
  return apply({ id, operationId, expectedVersion, mutation: deleted === true ? "trash" : deleted === false ? "restore" : "update", data }, expectedContext);
}
export async function getBoardSnapshotAction(expectedContext: unknown): Promise<{ context?: { accountId: string; houseId: string }; items?: BoardItem[]; error?: string; blocked?: boolean }> {
  try {
    const user = await requireVerifiedUser();
    const context = parseBoardContext(expectedContext);
    const house = await getMyHouse();
    if (!context || user.id !== context.accountId || house?.id !== context.houseId) return { error: "Phiên đăng nhập hoặc Nhà đã đổi.", blocked: true };
    const result = await readBoardItems(context.houseId, true);
    return result.items ? { context, items: result.items } : result;
  } catch { return { error: "Chưa tải được bảng chung." }; }
}
