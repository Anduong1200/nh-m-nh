"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/modules/auth/server";

/**
 * Create a new house and make the current user the first member.
 * Redirects to the house page on success.
 */
export async function createHouseAction(): Promise<{ error?: string }> {
  const user = await requireVerifiedUser();
  const supabase = await createSupabaseServerClient("read-write");

  const { data, error } = await supabase.rpc("create_house_with_owner");

  if (error) {
    if (error.message?.includes("Already in a house")) {
      return { error: "Bạn đã có một Nhà rồi." };
    }
    return { error: "Không thể tạo Nhà. Vui lòng thử lại." };
  }

  // Ensure profile exists.
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        "",
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (data) {
    redirect("/house");
  }

  return { error: "Không thể tạo Nhà. Vui lòng thử lại." };
}

/**
 * Generate a pairing invite link.
 * Token is a high-entropy random value; only its SHA-256 hash is stored.
 */
export async function createPairingInviteAction(): Promise<{
  inviteToken?: string;
  error?: string;
}> {
  await requireVerifiedUser();
  const supabase = await createSupabaseServerClient("read-write");

  // Generate high-entropy token (32 bytes = 256 bits).
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Hash the token for storage.
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Expire in 24 hours.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // The transaction derives the verified actor/House and locks capacity.
  const { error } = await supabase.rpc("create_pairing_invite", {
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    return { error: "Không thể tạo lời mời. Vui lòng thử lại." };
  }

  return { inviteToken: token };
}

/**
 * Accept a pairing invite using the raw token.
 */
export async function acceptPairingInviteAction(
  token: string,
): Promise<{ houseId?: string; error?: string }> {
  await requireVerifiedUser();
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return { error: "Lời mời không hợp lệ." };
  }
  const supabase = await createSupabaseServerClient("read-write");

  // Hash the provided token.
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data, error } = await supabase.rpc("accept_pairing_invite", {
    p_token_hash: tokenHash,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Invalid invite")) {
      return { error: "Lời mời không hợp lệ." };
    }
    if (msg.includes("already used")) {
      return { error: "Lời mời đã được sử dụng." };
    }
    if (msg.includes("expired")) {
      return { error: "Lời mời đã hết hạn." };
    }
    if (msg.includes("own invite")) {
      return { error: "Không thể nhận lời mời của chính mình." };
    }
    if (msg.includes("Already a member")) {
      return { error: "Bạn đã ở trong Nhà này rồi." };
    }
    if (msg.includes("full")) {
      return { error: "Nhà đã có đủ 2 người." };
    }
    return { error: "Không thể nhận lời mời. Vui lòng thử lại." };
  }

  return { houseId: data as string };
}

/**
 * Sign out the current user.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient("read-write");
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Chưa thể đăng xuất. Bạn có thể thử lại.");
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Update user's display name.
 */
export async function updateDisplayNameAction(
  displayName: string,
): Promise<{ error?: string }> {
  const user = await requireVerifiedUser();
  
  if (!displayName || typeof displayName !== "string") {
    return { error: "Tên không hợp lệ." };
  }
  
  const trimmed = displayName.trim();
  if (trimmed.length === 0 || trimmed.length > 50) {
    return { error: "Tên phải từ 1 đến 50 ký tự." };
  }

  const supabase = await createSupabaseServerClient("read-write");
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", user.id);

  if (error) {
    return { error: "Không thể cập nhật tên. Vui lòng thử lại." };
  }

  revalidatePath("/house");
  return {};
}

/**
 * Assign mascot to the user.
 */
export async function assignMascotAction(
  mascot: "rabbit" | "owl",
): Promise<{ error?: string }> {
  await requireVerifiedUser();
  if (mascot !== "rabbit" && mascot !== "owl") return { error: "Linh vật không hợp lệ." };
  const supabase = await createSupabaseServerClient("read-write");

  const { error } = await supabase.rpc("assign_mascot", {
    p_mascot: mascot,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Mascot already taken by partner")) {
      return { error: "Người thương của bạn đã chọn linh vật này rồi." };
    }
    if (msg.includes("Mascot already assigned")) {
      return { error: "Bạn đã chọn linh vật rồi." };
    }
    return { error: "Không thể nhận linh vật. Vui lòng thử lại." };
  }

  revalidatePath("/house");
  return {};
}
