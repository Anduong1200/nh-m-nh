import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/modules/auth/server";

export type HouseWithMembers = {
  id: string;
  name: string;
  state: string;
  created_at: string;
  identityReady: boolean;
  members: HouseMember[];
};

export type HouseMember = {
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  mascot: "rabbit" | "owl" | null;
  profile: {
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export class HouseLoadError extends Error {
  constructor() {
    super("Chưa thể mở Nhà. Bạn có thể thử lại.");
    this.name = "HouseLoadError";
  }
}

function isMissingMascotColumn(error: { code: string; message: string } | null): boolean {
  return error !== null && (
    (error.code === "42703" && /^column (?:house_members\.mascot|"house_members"\."mascot") does not exist$/.test(error.message)) ||
    (error.code === "PGRST204" && error.message.includes("'mascot' column of 'house_members'"))
  );
}

/**
 * Get the current user's active house with members.
 * Returns null if the user has no active house.
 */
export async function getMyHouse(): Promise<HouseWithMembers | null> {
  const user = await requireVerifiedUser();
  const supabase = await createSupabaseServerClient();

  // Find the user's active house membership.
  const { data: membership, error: membershipError } = await supabase
    .from("house_members")
    .select("house_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new HouseLoadError();
  if (!membership) return null;

  // Fetch house details.
  const { data: house, error: houseError } = await supabase
    .from("houses")
    .select("id, name, state, created_at")
    .eq("id", membership.house_id)
    .eq("state", "active")
    .maybeSingle();

  if (houseError || !house) throw new HouseLoadError();

  // Identity is additive: a project on the Phase 2 schema must still open its
  // authorized House. Retry only the known missing column, never an RLS error.
  let { data: members, error: membersError } = await supabase
    .from("house_members")
    .select("user_id, role, status, joined_at, mascot")
    .eq("house_id", house.id)
    .eq("status", "active");

  const identityReady = !isMissingMascotColumn(membersError);
  if (!identityReady) {
    const baseline = await supabase
      .from("house_members")
      .select("user_id, role, status, joined_at")
      .eq("house_id", house.id)
      .eq("status", "active");
    members = baseline.data?.map((member) => ({ ...member, mascot: null })) ?? null;
    membersError = baseline.error;
  }

  if (membersError || !members || members.length > 2 || !members.some((member) => member.user_id === user.id)) {
    throw new HouseLoadError();
  }

  // house_members references auth.users, not public.profiles. Fetch profiles
  // separately under their own RLS instead of an invalid PostgREST embed.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", members.map((member) => member.user_id));
  if (profilesError) throw new HouseLoadError();

  return {
    ...house,
    identityReady,
    members: members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      joined_at: m.joined_at,
      mascot: m.mascot ?? null,
      profile: profiles?.find((profile) => profile.id === m.user_id) ?? null,
    })),
  };
}

/**
 * Check if the user has a profile, create one if not.
 */
export async function ensureProfile(): Promise<void> {
  const user = await requireVerifiedUser();
  const supabase = await createSupabaseServerClient("read-write");

  const { error } = await supabase.from("profiles").upsert(
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
  if (error) throw new HouseLoadError();
}
