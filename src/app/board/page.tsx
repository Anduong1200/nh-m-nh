import { redirect } from "next/navigation";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getVerifiedUser } from "@/modules/auth/server";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { readBoardItems } from "@/modules/board/server";
import { HouseUnavailable } from "../house/house-unavailable";
import { BoardRoom } from "./room";
export const dynamic = "force-dynamic";
export const metadata = { title: "Bảng Chung · Nhà Mình" };
export default async function BoardPage() {
  if (!getSupabasePublicConfiguration()) redirect("/auth/sign-in");
  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");
  let house;
  try { house = await getMyHouse(); }
  catch (error) { if (!(error instanceof HouseLoadError)) throw error; return <HouseUnavailable />; }
  if (!house) redirect("/house/setup");
  if (house.members.length !== 2 || !house.members.some(member => member.user_id === user.id)) redirect("/house");
  const initial = await readBoardItems(house.id, true);
  return <BoardRoom key={`${user.id}:${house.id}`} accountId={user.id} houseId={house.id}
    initialItems={initial.items ?? []} initialError={initial.error ?? null} />;
}
