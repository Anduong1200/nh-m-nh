"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/modules/knocks/model";
import { parseLetter, parseLetterCommand, parseLetterContext, parseLetterReceipt, parseRevealCommand, parseRevealSession, type Letter, type LetterContext, type LetterReceipt, type RevealSession } from "./model";
export type LetterReadResult = { context?: LetterContext; letter?: Letter | null; error?: string; blocked?: boolean };
export type LetterWriteResult = { receipt?: LetterReceipt; error?: string; blocked?: boolean };
export type LetterRevealResult = { context?: LetterContext; session?: RevealSession; error?: string; blocked?: boolean };
async function authorize(input: unknown) {
  const user = await requireVerifiedUser(); const context = parseLetterContext(input);
  if (!context || context.accountId !== user.id) return null;
  const house = await getMyHouse();
  return house?.id === context.houseId && house.members.some(m => m.user_id === user.id) ? context : null;
}
export async function readLetterAction(id: string, expectedContext: unknown): Promise<LetterReadResult> {
  if (!isUuid(id)) return { error: "Lá thư không hợp lệ." };
  id = id.toLowerCase();
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("get_letter", { p_house_id: context.houseId, p_letter_id: id });
    if (!error && data === null) return { context, letter: null };
    const letter = error ? null : parseLetter(data, context);
    return letter?.id === id ? { context, letter } : { error: "Chưa tải được lá thư.", blocked: error?.code === "42501" || error?.code === "28000" };
  } catch { return { error: "Chưa tải được lá thư. Bạn có thể thử lại." }; }
}
export async function applyLetterCommandAction(input: unknown, expectedContext: unknown): Promise<LetterWriteResult> {
  const command = parseLetterCommand(input);
  if (!command) return { error: "Nội dung hoặc lịch gửi thư chưa hợp lệ." };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà. Bản nháp vẫn được giữ." };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("apply_letter_command", { p_house_id: context.houseId, p_command: command });
    const receipt = error ? null : parseLetterReceipt(data, context, command);
    return receipt ? { receipt } : { error: "Chưa xác nhận được thao tác. Bản nháp vẫn được giữ.", blocked: error?.code === "42501" || error?.code === "28000" };
  } catch { return { error: "Chưa xác nhận được kết nối. Bản nháp vẫn được giữ." }; }
}
export async function applyLetterRevealAction(input: unknown, expectedContext: unknown): Promise<LetterRevealResult> {
  const command = parseRevealCommand(input);
  if (!command) return { error: "Phiên mở thư chưa hợp lệ." };
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("apply_letter_reveal", { p_house_id: context.houseId, p_command: command });
    const session = error ? null : parseRevealSession(data, context, command);
    return session ? { context, session } : { error: "Chưa xác nhận được phiên mở thư. Thư vẫn được giữ.", blocked: error?.code === "42501" || error?.code === "28000" };
  } catch { return { error: "Mất kết nối phiên mở thư. Có thể vào lại khi cả hai sẵn sàng." }; }
}
export async function listLettersAction(expectedContext: unknown): Promise<{ context?: LetterContext; letters?: Letter[]; error?: string; blocked?: boolean }> {
  try {
    const context = await authorize(expectedContext);
    if (!context) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("letters").select("id").eq("house_id", context.houseId).order("deliver_at", { ascending: false }).limit(30);
    if (error || !data || data.some(row => !isUuid(row.id))) return { error: "Chưa tải được hòm thư." };
    const letters: Letter[] = [];
    for (const row of data) {
      // Avoid repeated network auth per envelope; the RPC rechecks current DB access.
      const { data: projection, error: readError } = await client.rpc("get_letter", { p_house_id: context.houseId, p_letter_id: row.id });
      if (!readError && projection === null) continue;
      const letter = readError ? null : parseLetter(projection, context);
      if (!letter || letter.id !== row.id) return { error: "Chưa xác nhận được hòm thư.", blocked: readError?.code === "42501" || readError?.code === "28000" };
      letters.push(letter);
    }
    return { context, letters };
  } catch { return { error: "Chưa tải được hòm thư. Bạn có thể thử lại." }; }
}
