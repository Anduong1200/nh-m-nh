import { redirect } from "next/navigation";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getVerifiedUser } from "@/modules/auth/server";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { listGameSessionsAction, readGameSessionAction } from "@/modules/games/actions";
import { isUuid } from "@/modules/knocks/model";
import { GamesScreen } from "@/components/phase4/games/game-ui";
export const dynamic="force-dynamic";
export const metadata={title:"Hộp Trò Chơi · Nhà Mình"};
export default async function GamesPage({searchParams=Promise.resolve({})}:{searchParams?:Promise<{session?:string}>}={}) {
  if(!getSupabasePublicConfiguration())redirect("/auth/sign-in");
  const user=await getVerifiedUser();if(!user)redirect("/auth/sign-in");
  let house;
  try {house=await getMyHouse();} catch(error) {
    if(!(error instanceof HouseLoadError))throw error;
    return <main><h1>Chưa mở được hộp trò chơi.</h1><p>Cần xác nhận lại quyền vào Nhà.</p><a href="/games">Thử lại</a><a href="/house">Về Nhà</a></main>;
  }
  if(!house)redirect("/house/setup");
  if(house.members.length!==2)return <main><h1>Hộp trò chơi của hai đứa.</h1><p>Cần ghép đôi đủ hai thành viên trước khi bắt đầu.</p><a href="/house">Về Nhà</a></main>;
  const context={accountId:user.id,houseId:house.id};
  const result=await listGameSessionsAction(context);
  if(result.blocked)return <main><h1>Chưa mở được hộp trò chơi.</h1><p>Phiên đăng nhập hoặc Nhà đã đổi.</p><a href="/house">Về Nhà</a></main>;
  const request=(await searchParams).session;
  const requested=request&&isUuid(request)?await readGameSessionAction(request,context):null;
  const sessions=result.sessions??[];
  if(requested?.snapshot&&!sessions.some(s=>s.id===requested.snapshot!.id))sessions.push(requested.snapshot);
  return <GamesScreen key={`${context.accountId}:${context.houseId}`} context={context} initialSessions={sessions} initialSessionId={requested?.snapshot?.id} initialError={requested?.error??result.error}/>;
}
