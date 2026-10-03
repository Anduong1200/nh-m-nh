import { redirect } from "next/navigation";
import { getMyHouse, HouseLoadError, type HouseWithMembers } from "@/modules/houses/server";
import { HouseDashboard } from "./house-dashboard";
import { HouseUnavailable } from "./house-unavailable";
import { requireVerifiedUser } from "@/modules/auth/server";
import { loadHomeState, type HomeState } from "@/modules/houses/state";
import { getBackgroundNotificationConfiguration } from "@/modules/notifications/push-server";

export const metadata = {
  title: "Nhà Mình",
  description: "Ngôi nhà nhỏ của hai đứa.",
};

export const dynamic = "force-dynamic";

export default async function HousePage() {
  const user = await requireVerifiedUser();
  let house: HouseWithMembers | null;
  try {
    house = await getMyHouse();
  } catch (error) {
    if (!(error instanceof HouseLoadError)) throw error;
    return <HouseUnavailable />;
  }

  if (!house) {
    redirect("/house/setup");
  }

  let initialState: HomeState | null = null;
  let initialError: string | null = null;
  if (house.members.length === 2) {
    try {
      initialState = await loadHomeState(house.id);
    } catch {
      initialError = "Chưa tải được dấu vết trong Nhà. Thử tải lại nhé.";
    }
  }

  return <HouseDashboard key={`${house.id}:${user.id}`} house={house} currentUserId={user.id} initialState={initialState} initialError={initialError} verifiedAt={new Date().toISOString()} backgroundNotifications={getBackgroundNotificationConfiguration()} />;
}
