"use server";

import { AuthenticationRequiredError, requireVerifiedUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, knockFromRow, parseKnockInput, type Knock } from "./model";

export type KnockActionResult = { knock?: Knock; error?: string };

function failure(error: unknown): { error: string } {
  return { error: error instanceof AuthenticationRequiredError ? "Đăng nhập lại để vào Nhà nhé." : "Cú gõ cửa chưa gửi được. Giữ lời nhắn và thử lại nhé." };
}

export async function sendKnockAction(input: unknown, expectedViewerId: unknown): Promise<KnockActionResult> {
  try {
    const user = await requireVerifiedUser();
    if (typeof expectedViewerId !== "string" || expectedViewerId !== user.id) {
      return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà trước khi gửi nhé." };
    }
    const parsed = parseKnockInput(input);
    if (!parsed.value) return { error: parsed.error };
    const supabase = await createSupabaseServerClient("read-write");
    const { data, error } = await supabase.rpc("send_knock", {
      p_operation_id: parsed.value.operationId,
      p_kind: parsed.value.kind,
      p_content: parsed.value.content,
    });
    if (error) {
      if (/House is not paired|No partner|not paired|pairing required/i.test(error.message ?? "")) {
        return { error: "Nhà cần ghép đôi trước khi gõ cửa nhé." };
      }
      return failure(error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const knock = row && typeof row === "object" ? knockFromRow(row as Record<string, unknown>) : null;
    return knock?.senderId === user.id && knock.id === parsed.value.operationId &&
      knock.kind === parsed.value.kind && knock.content === parsed.value.content
      ? { knock } : { error: "Chưa xác nhận được cú gõ cửa. Thử lại với cùng lời nhắn nhé." };
  } catch (error) {
    return failure(error);
  }
}

export async function dismissKnockAction(knockId: unknown, expectedViewerId: unknown): Promise<{ success?: boolean; error?: string }> {
  try {
    const user = await requireVerifiedUser();
    if (typeof expectedViewerId !== "string" || expectedViewerId !== user.id) {
      return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà trước khi cất cú gõ nhé." };
    }
    if (!isUuid(knockId)) return { error: "Cú gõ cửa chưa hợp lệ." };
    const supabase = await createSupabaseServerClient("read-write");
    // This is recipient-owned inbox tidying; the sender cannot query dismissals.
    const { data, error } = await supabase.rpc("dismiss_knock", { p_knock_id: knockId });
    if (error || data !== true) return { error: "Chưa cất được cú gõ cửa. Thử lại sau nhé." };
    return { success: true };
  } catch (error) {
    return { error: error instanceof AuthenticationRequiredError ? "Đăng nhập lại để vào Nhà nhé." : "Chưa cất được cú gõ cửa. Thử lại sau nhé." };
  }
}
