import { redirect } from "next/navigation";
import { getMyHouse } from "@/modules/houses/server";
import { HouseDashboard } from "./house-dashboard";
import { requireVerifiedUser } from "@/modules/auth/server";
import { loadHomeState, type HomeState } from "@/modules/houses/state";

export const metadata = {
  title: "Nhà Mình",
  description: "Ngôi nhà nhỏ của hai đứa.",
};

export const dynamic = "force-dynamic";

export default async function HousePage() {
  const user = await requireVerifiedUser();
  const house = await getMyHouse();

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

  return <HouseDashboard key={`${house.id}:${user.id}`} house={house} currentUserId={user.id} initialState={initialState} initialError={initialError} />;
}
