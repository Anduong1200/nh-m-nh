import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/modules/auth/server";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { readIslandStateAction } from "@/modules/island/actions";
import { listGameSessionsAction } from "@/modules/games/actions";
import { parseIslandView } from "@/modules/island/client";
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
  const [projection, games] = await Promise.all([readIslandStateAction(context), listGameSessionsAction(context)]);
  const changedContext = [projection.context, games.context].some(reply => reply && (reply.accountId !== context.accountId || reply.houseId !== context.houseId));
  if (projection.blocked || games.blocked || changedContext) return <main id="main-content" className="state-page"><div className="state-paper" role="alert"><h1>Cần xác nhận lại quyền vào Nhà.</h1><a href="/house">Về Nhà</a></div></main>;
  const initialView = projection.context?.accountId === user.id && projection.context.houseId === house.id && games.context?.accountId === user.id && games.context.houseId === house.id
    ? parseIslandView({ state: projection.state, artifacts: games.sessions?.filter(session => session.status === "completed") }, context)
    : null;
  return <IslandWorkspace key={`${context.accountId}:${context.houseId}`} context={context} initialView={initialView} initialError={initialView ? null : "Chưa tải được lịch sử Đảo. Bạn có thể thử lại."} />;
}
