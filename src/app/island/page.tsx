import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/modules/auth/server";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { readIslandStateAction } from "@/modules/island/actions";
import { listGameSessionsAction } from "@/modules/games/actions";
import { islandReadResult } from "@/modules/island/client";
import { HouseUnavailable } from "../house/house-unavailable";
import { IslandWorkspace } from "./workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hòn đảo của hai đứa · Nhà Mình" };

export default async function IslandPage() {
  if (!getSupabasePublicConfiguration()) redirect("/auth/sign-in");
  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");
  let house;
  try { house = await getMyHouse(); }
  catch (error) { if (!(error instanceof HouseLoadError)) throw error; return <HouseUnavailable />; }
  if (!house) redirect("/house/setup");
  if (house.members.length !== 2) redirect("/house");
  const context = { accountId: user.id, houseId: house.id };
  const [projection, games] = await Promise.all([
    readIslandStateAction(context).catch(() => ({ error: "Chưa tải được bản đồ Đảo." })),
    listGameSessionsAction(context).catch(() => ({ error: "Chưa tải được tác phẩm trò chơi." })),
  ]);
  const result = islandReadResult(context, projection, games);
  if (result.blocked) return <main id="main-content" className="state-page"><div className="state-paper" role="alert"><h1>Cần xác nhận lại quyền vào Nhà.</h1><a href="/house">Về Nhà</a></div></main>;
  return <IslandWorkspace key={`${context.accountId}:${context.houseId}`} context={context} initialView={result.view} initialError={result.error ?? null} />;
}
