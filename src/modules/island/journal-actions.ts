"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/modules/knocks/model";
import { parseGameContext, type GameContext } from "@/modules/games/model";
import { parseIslandEntry, parseIslandEntryCommand, parseIslandEntryReceipt, parseIslandJournalPage, type IslandEntry, type IslandEntryReceipt, type IslandJournalPage } from "./journal";

export type IslandJournalRead = { context?: GameContext; page?: IslandJournalPage; entry?: IslandEntry; error?: string; blocked?: boolean };
export type IslandJournalWrite = { receipt?: IslandEntryReceipt; error?: string; blocked?: boolean; rejected?: boolean };
async function authorize(input: unknown) {
  const user = await requireVerifiedUser(); const context = parseGameContext(input);
  if (!context || context.accountId !== user.id) return null;
  const house = await getMyHouse();
  return house?.id === context.houseId && house.members.length === 2 && house.members.some(member => member.user_id === user.id) ? context : null;
}
export async function readIslandJournalAction(expectedContext: unknown, cursor: IslandJournalPage["next"] = null): Promise<IslandJournalRead> {
  if (cursor && (!isUuid(cursor.id) || !Number.isFinite(Date.parse(cursor.createdAt)))) return { error: "Trang lịch sử chưa hợp lệ." };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("get_island_entries", { p_house_id: context.houseId, p_before_created_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null });
    const page = error ? null : parseIslandJournalPage(data, context.houseId);
    return page ? { context, page } : { error: "Chưa mở được sổ kỷ niệm. Bạn có thể thử lại.", blocked: error?.code === "42501" || error?.code === "28000" };
  } catch { return { error: "Chưa mở được sổ kỷ niệm. Bạn có thể thử lại." }; }
}
export async function readIslandEntryAction(entryId: string, expectedContext: unknown): Promise<IslandJournalRead> {
  if (!isUuid(entryId)) return { error: "Trang sổ chưa hợp lệ." };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("get_island_entry", { p_house_id: context.houseId, p_entry_id: entryId });
    const entry = error ? null : parseIslandEntry(data);
    return entry && entry.id === entryId && entry.houseId === context.houseId ? { context, entry } : { error: "Chưa tìm được trang sổ trong Nhà này.", blocked: error?.code === "42501" || error?.code === "28000" };
  } catch { return { error: "Chưa mở được trang sổ. Bạn có thể thử lại." }; }
}
export async function applyIslandEntryAction(input: unknown, expectedContext: unknown): Promise<IslandJournalWrite> {
  const command = parseIslandEntryCommand(input);
  if (!command) return { error: "Nội dung chưa hợp lệ. Kỷ niệm cần được xác nhận trước khi lưu.", rejected: true };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà. Bản nháp vẫn được giữ." };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("apply_island_entry_command", { p_house_id: context.houseId, p_command: command });
    const receipt = error ? null : parseIslandEntryReceipt(data, command, context.houseId, context.accountId);
    if (receipt) return { receipt };
    return { error: error?.code === "23505" ? "Tác phẩm này đã có kỷ niệm, hoặc trang sổ đã được lưu. Làm mới sổ để xem lại." : "Chưa xác nhận được việc lưu. Bản nháp vẫn được giữ.", blocked: error?.code === "42501" || error?.code === "28000", rejected: !!error && ["23505", "22023"].includes(error.code) };
  } catch { return { error: "Chưa xác nhận được việc lưu. Bản nháp vẫn được giữ." }; }
}
