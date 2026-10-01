import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { knockFromRow, type Knock } from "@/modules/knocks/model";
import { DEFAULT_NOTIFICATION_PREFERENCES, notificationPreferencesFromRow, type NotificationPreferences } from "@/modules/notifications/model";
import { isPresenceVisible, presenceFromRow, type PresenceStatus } from "./model";

export type Phase2State = { 
  statuses: PresenceStatus[]; 
  knocks: Knock[]; 
  preferences: NotificationPreferences;
};

export class Phase2UnavailableError extends Error {
  constructor() {
    super("Chưa tải được dấu vết trong Nhà. Thử lại sau nhé.");
    this.name = "Phase2UnavailableError";
  }
}

/** Authorized, short-lived SSR/foreground state. No presence timestamps or receipts. */
export async function loadPhase2State(houseId: string): Promise<Phase2State> {
  const user = await requireVerifiedUser();
  const house = await getMyHouse();
  if (!house || house.id !== houseId || !house.members.some((member) => member.user_id === user.id)) {
    throw new Phase2UnavailableError();
  }
  const memberIds = new Set(house.members.map((member) => member.user_id));
  const supabase = await createSupabaseServerClient();
  const [presence, inbox, preferencesResult, dismissals] = await Promise.all([
    supabase.from("presence_entries").select("house_id,user_id,mood,energy,availability,note,need,expires_at,version,cleared").eq("house_id", house.id),
    supabase.from("knocks").select("id,house_id,sender_id,recipient_id,kind,content,created_at").eq("house_id", house.id).eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(24),
    supabase.from("notification_preferences").select("user_id,quiet_enabled,start_minute,end_minute,timezone,preview,knocks_enabled").eq("user_id", user.id).maybeSingle(),
    supabase.from("knock_dismissals").select("knock_id").eq("user_id", user.id),
  ]);
  if (presence.error || inbox.error || preferencesResult.error || dismissals.error) throw new Phase2UnavailableError();
  const now = new Date();
  const statuses: PresenceStatus[] = [];
  for (const row of presence.data ?? []) {
    if (row.house_id !== house.id || !memberIds.has(row.user_id)) continue;
    const status = presenceFromRow(row);
    if (!status) throw new Phase2UnavailableError();
    // Own tombstones retain the optimistic version after expiry/clear, never show as status.
    if (status.userId === user.id || isPresenceVisible(status, now)) statuses.push(status);
  }
  const dismissedIds = new Set((dismissals.data ?? []).map((row) => row.knock_id));
  const knocks: Knock[] = [];
  for (const row of inbox.data ?? []) {
    if (row.house_id !== house.id || row.recipient_id !== user.id || !memberIds.has(row.sender_id) || dismissedIds.has(row.id)) continue;
    const knock = knockFromRow(row);
    if (!knock) throw new Phase2UnavailableError();
    knocks.push(knock);
    if (knocks.length === 12) break;
  }
  const preferenceRow = preferencesResult.data;
  if (preferenceRow && preferenceRow.user_id !== user.id) throw new Phase2UnavailableError();
  const preferences = preferenceRow ? notificationPreferencesFromRow(preferenceRow) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!preferences) throw new Phase2UnavailableError();
  
  return { statuses, knocks, preferences };
}
