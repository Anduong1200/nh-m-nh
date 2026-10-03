import { redirect } from "next/navigation";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getVerifiedUser } from "@/modules/auth/server";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { HouseUnavailable } from "../house/house-unavailable";
import { WhiteboardRoom } from "./room";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảng vẽ chung · Nhà Mình" };
export default async function WhiteboardPage() {
  if (!getSupabasePublicConfiguration()) redirect("/auth/sign-in");
  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");
  let house;
  try { house = await getMyHouse(); }
  catch (error) { if (!(error instanceof HouseLoadError)) throw error; return <HouseUnavailable />; }
  if (!house) redirect("/house/setup");
  if (house.members.length !== 2) redirect("/house");
  return <WhiteboardRoom key={`${user.id}:${house.id}`} accountId={user.id} houseId={house.id} />;
}
