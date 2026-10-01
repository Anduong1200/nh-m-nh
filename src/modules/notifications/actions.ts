"use server";

import { AuthenticationRequiredError, requireVerifiedUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notificationPreferencesFromRow, parseNotificationPreferences, type NotificationPreferences } from "./model";

export async function saveNotificationPreferencesAction(input: unknown, expectedViewerId: unknown): Promise<{ preferences?: NotificationPreferences; error?: string }> {
  try {
    const user = await requireVerifiedUser();
    if (typeof expectedViewerId !== "string" || expectedViewerId !== user.id) {
      return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà trước khi lưu nhé." };
    }
    const parsed = parseNotificationPreferences(input);
    if (!parsed.value) return { error: parsed.error };
    const value = parsed.value;
    const supabase = await createSupabaseServerClient("read-write");
    const { data, error } = await supabase.rpc("set_notification_preferences", {
      p_quiet_enabled: value.quietEnabled,
      p_start_minute: value.startMinute,
      p_end_minute: value.endMinute,
      p_timezone: value.timeZone,
      p_preview: value.preview,
      p_knocks_enabled: value.knocksEnabled,
    });
    if (error) return { error: "Chưa lưu được tùy chọn thông báo. Thử lại sau nhé." };
    const row = Array.isArray(data) ? data[0] : data;
    const preferences = row && typeof row === "object" && "user_id" in row && row.user_id === user.id ? notificationPreferencesFromRow(row as Record<string, unknown>) : null;
    return preferences ? { preferences } : { error: "Chưa xác nhận được tùy chọn thông báo. Tải lại Nhà nhé." };
  } catch (error) {
    return { error: error instanceof AuthenticationRequiredError ? "Đăng nhập lại để vào Nhà nhé." : "Chưa lưu được tùy chọn thông báo. Thử lại sau nhé." };
  }
}
