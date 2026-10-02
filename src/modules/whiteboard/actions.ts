"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emptyWhiteboardScene, parseWhiteboardContext, parseWhiteboardOperation, whiteboardReceipt, whiteboardSnapshot, type WhiteboardSnapshot, type WhiteboardReceipt } from "./model";
export type WhiteboardReadResult = { context?: { accountId: string; houseId: string }; snapshot?: WhiteboardSnapshot; error?: string; blocked?: boolean };
export type WhiteboardSaveResult = { receipt?: WhiteboardReceipt; error?: string; blocked?: boolean };
async function authorize(input: unknown) {
  const user = await requireVerifiedUser();
  const context = parseWhiteboardContext(input);
  if (!context || user.id !== context.accountId) return null;
  const house = await getMyHouse();
  return house?.id === context.houseId ? context : null;
}
export async function getWhiteboardSnapshotAction(expectedContext: unknown): Promise<WhiteboardReadResult> {
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Phiên đăng nhập hoặc Nhà đã đổi. Bản nháp vẫn được giữ." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("whiteboards").select("house_id, version, scene, updated_by, updated_at").eq("house_id", context.houseId).maybeSingle();
    if (error) return { error: "Chưa tải được bảng vẽ." };
    const snapshot = data ? whiteboardSnapshot({ houseId: data.house_id, version: data.version, scene: data.scene, updatedBy: data.updated_by, updatedAt: data.updated_at }) : { houseId: context.houseId, version: 0, scene: emptyWhiteboardScene(), updatedBy: null, updatedAt: null };
    return snapshot ? { context, snapshot } : { error: "Chưa xác nhận được bản vẽ." };
  } catch { return { error: "Chưa tải được bảng vẽ. Bản nháp vẫn được giữ." }; }
}
export async function saveWhiteboardSnapshotAction(input: unknown, expectedContext: unknown): Promise<WhiteboardSaveResult> {
  const operation = parseWhiteboardOperation(input);
  if (!operation) return { error: "Bản vẽ không hợp lệ hoặc vượt giới hạn lưu." };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Phiên đăng nhập hoặc Nhà đã đổi. Bản nháp vẫn được giữ." };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("save_whiteboard_snapshot", { p_operation_id: operation.operationId, p_house_id: context.houseId, p_expected_version: operation.expectedVersion, p_scene: operation.scene });
    if (error) return { error: "Chưa lưu được bản vẽ. Bản nháp vẫn được giữ.", blocked: error.code === "42501" || error.code === "28000" };
    const receipt = whiteboardReceipt(data, context, operation);
    return receipt ? { receipt } : { error: "Chưa xác nhận được lần lưu. Hàng đợi vẫn được giữ." };
  } catch { return { error: "Chưa xác nhận được kết nối và quyền vào Nhà. Bản nháp vẫn được giữ." }; }
}
