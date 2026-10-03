"use server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseGameContext } from "@/modules/games/model";
import { isUuid } from "@/modules/knocks/model";
import { getBackgroundNotificationConfiguration } from "./push-server";
import { parsePrivatePushSubscription, validPushEndpoint } from "./push-model";

export async function readPushSubscriptionAction(endpoint: unknown, expectedContext: unknown): Promise<{ deviceToken?: string; error?: string }> {
  try {
    const user = await requireVerifiedUser(), context = parseGameContext(expectedContext), house = await getMyHouse();
    if (!context || context.accountId !== user.id || house?.id !== context.houseId || !validPushEndpoint(endpoint)) return { error: "Cần xác nhận lại quyền vào Nhà." };
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("push_subscriptions").select("id").eq("owner_id", user.id).eq("house_id", context.houseId).eq("endpoint", endpoint).eq("active", true).maybeSingle();
    return !error && isUuid(data?.id) ? { deviceToken: data.id } : {};
  } catch { return { error: "Chưa xác nhận được đăng ký thông báo." }; }
}

export async function enrollPushAction(input: unknown, expectedContext: unknown): Promise<{ deviceToken?: string; error?: string; blocked?: boolean }> {
  try {
    const user = await requireVerifiedUser(), context = parseGameContext(expectedContext), house = await getMyHouse();
    if (!context || context.accountId !== user.id || house?.id !== context.houseId || house.members.length !== 2 || !house.members.some(member => member.user_id === user.id)) return { blocked: true, error: "Cần xác nhận lại quyền vào Nhà." };
    if (!getBackgroundNotificationConfiguration().enabled) return { error: "Thông báo nền chưa sẵn sàng. Thông báo trong Nhà vẫn hoạt động." };
    const subscription = parsePrivatePushSubscription(input);
    if (!subscription) return { error: "Đăng ký thông báo chưa hợp lệ. Thử lại nhé." };
    const client = await createSupabaseServerClient("read-write");
    const { data, error } = await client.rpc("enroll_push_subscription", { p_house_id: context.houseId, p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth });
    return !error && isUuid(data) ? { deviceToken: data } : { error: "Chưa bật được thông báo nền. Thử lại nhé.", blocked: error?.code === "42501" };
  } catch { return { error: "Chưa bật được thông báo nền. Thử lại khi có kết nối nhé." }; }
}
export async function disablePushAction(deviceToken: unknown, expectedContext: unknown): Promise<{ disabled?: boolean; error?: string }> {
  try {
    const user = await requireVerifiedUser(), context = parseGameContext(expectedContext), house = await getMyHouse();
    if (!context || context.accountId !== user.id || house?.id !== context.houseId || !isUuid(deviceToken)) return { error: "Phiên đăng nhập đã đổi. Tải lại Nhà nhé." };
    const client = await createSupabaseServerClient("read-write");
    const { error } = await client.rpc("disable_push_subscription", { p_house_id: context.houseId, p_id: deviceToken });
    return error ? { error: "Chưa xác nhận được việc tắt thông báo nền." } : { disabled: true };
  } catch { return { error: "Chưa kết nối được để tắt thông báo nền." }; }
}
