import {beforeEach,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createGame,gameActors,gameHouse,initialGame} from "@/modules/games/test-fixtures";
const mocks=vi.hoisted(()=>({configured:vi.fn(),user:vi.fn(),house:vi.fn(),list:vi.fn(),read:vi.fn(),redirect:vi.fn((path:string)=>{throw new Error("REDIRECT:"+path);})}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/env",()=>({getSupabasePublicConfiguration:mocks.configured}));
vi.mock("@/modules/auth/server",()=>({getVerifiedUser:mocks.user,requireVerifiedUser:vi.fn()}));
vi.mock("@/modules/houses/server",async original=>({...await original<typeof import("@/modules/houses/server")>(),getMyHouse:mocks.house}));
vi.mock("@/modules/games/actions",()=>({listGameSessionsAction:mocks.list,readGameSessionAction:mocks.read}));
vi.mock("@/components/phase4/games/game-ui",()=>({GamesScreen:()=>null}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
import GamesPage from "./page";
beforeEach(()=>{vi.clearAllMocks();mocks.configured.mockReturnValue({});mocks.user.mockResolvedValue({id:gameActors[0]});mocks.house.mockResolvedValue({id:gameHouse,members:[{user_id:gameActors[0]},{user_id:gameActors[1]}]});mocks.list.mockResolvedValue({context:{accountId:gameActors[0],houseId:gameHouse},sessions:[]});});
it("redirects an unconfigured or anonymous visitor without querying private game state",async()=>{
  mocks.configured.mockReturnValue(null);await expect(GamesPage()).rejects.toThrow("REDIRECT:/auth/sign-in");expect(mocks.user).not.toHaveBeenCalled();
  mocks.configured.mockReturnValue({});mocks.user.mockResolvedValue(null);await expect(GamesPage()).rejects.toThrow("REDIRECT:/auth/sign-in");expect(mocks.list).not.toHaveBeenCalled();
});
it("unpaired House shows guidance without loading or creating games",async()=>{
  mocks.house.mockResolvedValue({id:gameHouse,members:[{user_id:gameActors[0]}]});const html=renderToStaticMarkup(await GamesPage());expect(html).toContain("ghép đôi đủ hai");expect(mocks.list).not.toHaveBeenCalled();
});
it("a deep link reads its authorized game even outside the latest list",async()=>{
  const snapshot=initialGame(createGame());mocks.read.mockResolvedValue({context:{accountId:gameActors[0],houseId:gameHouse},snapshot});const page=await GamesPage({searchParams:Promise.resolve({session:snapshot.id})});
  expect(mocks.read).toHaveBeenCalledWith(snapshot.id,{accountId:gameActors[0],houseId:gameHouse});expect(page.props).toMatchObject({initialSessionId:snapshot.id,initialSessions:[snapshot]});
});
it("does not trust malformed URL IDs or pass a blocked House bootstrap to the UI",async()=>{
  await GamesPage({searchParams:Promise.resolve({session:"not-an-id"})});expect(mocks.read).not.toHaveBeenCalled();mocks.list.mockResolvedValue({blocked:true});const html=renderToStaticMarkup(await GamesPage());expect(html).toContain("Phiên đăng nhập hoặc Nhà đã đổi");
});
