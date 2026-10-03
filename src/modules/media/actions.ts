"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { parseGameContext } from "@/modules/games/model";
import { createMediaAdminClient } from "@/lib/supabase/media-admin";
import { mediaReferenceFromRow, type MediaReference } from "./model";
import { normalizePhoto, PHOTO_INPUT_MAX_BYTES } from "./photo";

export async function uploadPhotoAction(input: FormData, expectedContext: unknown): Promise<{ media?: MediaReference; error?: string; blocked?: boolean }> {
  try {
    const user = await requireVerifiedUser();
    const context = parseGameContext(expectedContext);
    const house = await getMyHouse();
    if (!context || context.accountId !== user.id || house?.id !== context.houseId || house.members.length !== 2 || !house.members.some(m => m.user_id === user.id)) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const file = input instanceof FormData ? input.get("file") : null;
    if (!(file instanceof File) || !file.size || file.size > PHOTO_INPUT_MAX_BYTES) return { error: "Chọn ảnh JPEG, PNG hoặc WebP, tối đa 4 MB." };
    let bytes: Buffer;
    try { bytes = await normalizePhoto(new Uint8Array(await file.arrayBuffer())); }
    catch { return { error: "Ảnh chưa đọc được. Chọn ảnh JPEG, PNG hoặc WebP tĩnh, tối đa 25 megapixel." }; }
    const client = createMediaAdminClient();
    const id = crypto.randomUUID();
    const path = `${context.houseId}/${id}`;
    const { error: uploadError } = await client.storage.from("nha-minh-private").upload(path, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
    if (uploadError) return { error: "Chưa tải được ảnh riêng tư. Giữ ảnh và thử lại nhé." };
    // Service-only RPC rechecks active House/actor under row locks after the upload.
    const { data, error } = await client.rpc("register_verified_photo", { p_id: id, p_house_id: context.houseId, p_actor_id: user.id, p_size: bytes.byteLength });
    const media = error ? null : mediaReferenceFromRow(data);
    if (!media || media.id !== id || media.houseId !== context.houseId || media.ownerId !== user.id) return { error: "Chưa xác nhận được ảnh. Ảnh này chưa được gửi vào lượt chơi.", blocked: error?.code === "42501" };
    return { media };
  } catch { return { error: "Chưa kết nối được dịch vụ ảnh riêng tư. Kiểm tra cấu hình server hoặc thử lại." }; }
}
