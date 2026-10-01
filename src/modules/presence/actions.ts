"use server";

import { AuthenticationRequiredError, requireVerifiedUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  energyToDatabase, isExpectedVersion, parsePresenceInput, presenceExpiresAt,
  presenceFromRow, type PresenceStatus,
} from "./model";

export type PresenceActionResult = { status?: PresenceStatus; error?: string; conflict?: boolean };

function actionFailure(error: unknown): PresenceActionResult {
  return { error: error instanceof AuthenticationRequiredError ? "Đăng nhập lại để vào Nhà nhé." : "Chưa lưu được trạng thái. Thử lại sau nhé." };
}

function rpcFailure(error: { code?: string; message?: string }): PresenceActionResult {
  if (error.code === "40001" || /Presence version conflict|presence_conflict/i.test(error.message ?? "")) {
    return { error: "Trạng thái đã đổi ở thiết bị khác. Tải lại rồi chọn điều muốn giữ nhé.", conflict: true };
  }
  return { error: "Chưa lưu được trạng thái. Thử lại sau nhé." };
}

function resultFromData(data: unknown, verifiedUserId: string): PresenceActionResult {
  const row = Array.isArray(data) ? data[0] : data;
  const status = row && typeof row === "object" ? presenceFromRow(row as Record<string, unknown>) : null;
  return status?.userId === verifiedUserId ? { status } : { error: "Chưa xác nhận được trạng thái. Tải lại Nhà nhé." };
}

export async function setPresenceAction(input: unknown, expectedViewerId: unknown): Promise<PresenceActionResult> {
  try {
    const user = await requireVerifiedUser();
    // A stale tab must not submit its draft through a newly signed-in user's session.
    // This comparison only binds the visible draft to verified identity; the RPC authorizes it.
    if (typeof expectedViewerId !== "string" || expectedViewerId !== user.id) {
      return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà trước khi lưu nhé." };
    }
    const parsed = parsePresenceInput(input);
    if (!parsed.value) return { error: parsed.error };
    const value = parsed.value;
    const supabase = await createSupabaseServerClient("read-write");
    // The RPC resolves auth.uid() and active membership. No client actor/House is forwarded.
    const { data, error } = await supabase.rpc("set_presence", {
      p_mood: value.mood,
      p_energy: energyToDatabase(value.energy),
      p_availability: value.availability,
      p_note: value.note,
      p_need: value.need,
      p_expires_at: presenceExpiresAt(value, new Date()),
      p_expected_version: value.expectedVersion,
    });
    if (error) return rpcFailure(error);
    return resultFromData(data, user.id);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function clearPresenceAction(expectedVersion: unknown, expectedViewerId: unknown): Promise<PresenceActionResult> {
  try {
    const user = await requireVerifiedUser();
    if (typeof expectedViewerId !== "string" || expectedViewerId !== user.id) {
      return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà trước khi lưu nhé." };
    }
    if (!isExpectedVersion(expectedVersion)) return { error: "Phiên bản trạng thái chưa hợp lệ. Tải lại Nhà nhé." };
    const supabase = await createSupabaseServerClient("read-write");
    const { data, error } = await supabase.rpc("clear_presence", { p_expected_version: expectedVersion });
    if (error) return rpcFailure(error);
    return resultFromData(data, user.id);
  } catch (error) {
    return actionFailure(error);
  }
}
