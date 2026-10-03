"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/modules/knocks/model";
import { gameReceipt, parseGameCommand, parseGameContext, parseGameSession, type GameContext, type GameReceipt, type GameSession } from "./model";
export type GameReadResult = { context?: GameContext; snapshot?: GameSession; error?: string; blocked?: boolean };
export type GameWriteResult = { receipt?: GameReceipt; error?: string; blocked?: boolean };
async function authorize(input: unknown) {
  const user = await requireVerifiedUser();
  const context = parseGameContext(input);
  if (!context || context.accountId !== user.id) return null;
  const house = await getMyHouse();
  return house?.id === context.houseId && house.members.length === 2 && house.members.some(m => m.user_id === user.id) ? context : null;
}
export async function readGameSessionAction(sessionId: string, expectedContext: unknown): Promise<GameReadResult> {
  if (!isUuid(sessionId)) return {error:"Phiên chơi không hợp lệ."};
  try {
    const context = await authorize(expectedContext);
    if (!context) return {blocked:true,error:"Phiên đăng nhập hoặc Nhà đã đổi. Bản nháp vẫn được giữ."};
    const client = await createSupabaseServerClient();
    const {data,error} = await client.rpc("get_game_session",{p_house_id:context.houseId,p_session_id:sessionId});
    const snapshot = error ? null : parseGameSession(data);
    if (!snapshot || snapshot.id !== sessionId || snapshot.houseId !== context.houseId || !snapshot.players.some(p => p.userId === context.accountId) || snapshot.gameType === "draw-guess" && snapshot.status === "active" && snapshot.createdBy !== context.accountId && snapshot.answer !== null) return {error:"Chưa xác nhận được phiên chơi.",blocked:error?.code === "42501" || error?.code === "28000"};
    return {context,snapshot};
  } catch { return {error:"Chưa tải được phiên chơi. Bản nháp vẫn được giữ."}; }
}
export async function applyGameCommandAction(input: unknown, expectedContext: unknown): Promise<GameWriteResult> {
  const command = parseGameCommand(input);
  if (!command) return {error:"Đóng góp chưa hợp lệ hoặc vượt giới hạn lưu."};
  try {
    const context = await authorize(expectedContext);
    if (!context) return {blocked:true,error:"Phiên đăng nhập hoặc Nhà đã đổi. Bản nháp vẫn được giữ."};
    const client = await createSupabaseServerClient("read-write");
    const {data,error} = await client.rpc("apply_game_command",{p_house_id:context.houseId,p_command:command});
    const receipt = error ? null : gameReceipt(data,context,command);
    return receipt ? {receipt} : {error:"Chưa xác nhận được lượt chơi. Hàng đợi vẫn được giữ.",blocked:error?.code === "42501" || error?.code === "28000"};
  } catch { return {error:"Chưa xác nhận được kết nối và quyền vào Nhà. Hàng đợi vẫn được giữ."}; }
}
export async function listGameSessionsAction(expectedContext: unknown): Promise<{context?: GameContext; sessions?: GameSession[]; error?: string; blocked?: boolean}> {
  try {
    const context = await authorize(expectedContext);
    if (!context) return {blocked:true,error:"Cần xác nhận hai thành viên trong Nhà."};
    const client = await createSupabaseServerClient();
    const {data,error} = await client.from("game_sessions").select("id").eq("house_id",context.houseId).order("updated_at",{ascending:false}).limit(20);
    if (error || !data || data.some(row => !isUuid(row.id))) return {error:"Chưa tải được hộp trò chơi."};
    const sessions: GameSession[] = [];
    for (const row of data) {
      // Identity is verified once for the request; every RPC still rechecks DB membership.
      const {data: projection,error: readError} = await client.rpc("get_game_session",{p_house_id:context.houseId,p_session_id:row.id});
      const snapshot = readError ? null : parseGameSession(projection);
      if (!snapshot || snapshot.id !== row.id || snapshot.houseId !== context.houseId || !snapshot.players.some(p => p.userId === context.accountId) || snapshot.gameType === "draw-guess" && snapshot.status === "active" && snapshot.createdBy !== context.accountId && snapshot.answer !== null) return {error:"Chưa xác nhận được hộp trò chơi.",blocked:readError?.code === "42501" || readError?.code === "28000"};
      sessions.push(snapshot);
    }
    return {context,sessions};
  } catch { return {error:"Chưa tải được hộp trò chơi."}; }
}
