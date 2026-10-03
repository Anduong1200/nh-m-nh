import { createRoot } from "react-dom/client";
import { GamesScreen } from "../../src/components/phase4/games/game-ui";
import { clearAccountOfflineData } from "../../src/lib/offline/store";
import { gameActors,gameHouse } from "../../src/modules/games/test-fixtures";
import type { GameTransport } from "../../src/modules/games/sync";
import type { GameList } from "../../src/components/phase4/games/workspace";
import type { MediaReference } from "../../src/modules/media/model";
const params=new URLSearchParams(location.search),actor=gameActors[Number(params.get("actor")??0)]!;
const scope=params.get("session")??"games-ui";
const context={accountId:actor,houseId:gameHouse};
const url=(path:string)=>`/api/games/${path}?actor=${params.get("actor")??0}&session=${encodeURIComponent(scope)}`;
const transport:GameTransport={read:async id=>(await fetch(url("read")+"&id="+id)).json(),apply:async command=>(await fetch(url("apply"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)})).json()};
const list:GameList=async()=>(await fetch(url("list"))).json();
const initialSessions:[]= [];
const upload=async()=>({media:{id:crypto.randomUUID(),houseId:gameHouse,ownerId:actor,kind:"photo",bucket:"nha-minh-private",path:"fixture-owned-photo",mime:"image/jpeg",bytes:100,durationSeconds:null} as MediaReference});
function Photo({alt}: {mediaId:string;houseId:string;alt?:string}){return <div role="img" aria-label={alt??"Ảnh riêng fixture"}>Ảnh riêng trong fixture</div>;}
Object.assign(window,{gamesUiHarness:{logout:()=>clearAccountOfflineData(actor)}});
createRoot(document.getElementById("root")!).render(<GamesScreen context={context} initialSessions={initialSessions} transport={transport} list={list} upload={upload} PhotoComponent={Photo}/>);
