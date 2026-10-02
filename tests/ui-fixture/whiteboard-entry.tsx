import { lazy,Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AccountOfflineStore,clearAccountOfflineData } from "@/lib/offline/store";
import { textScene } from "@/modules/whiteboard/test-fixtures";
import type { WhiteboardSnapshot } from "@/modules/whiteboard/model";
const params=new URLSearchParams(location.search);
const actor=params.get("actor")==="1" ? 1 : 0;
const accountId=actor ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111";
const houseId="33333333-3333-4333-8333-333333333333";
const suffix="?session="+encodeURIComponent(params.get("session")??"manual-whiteboard")+"&actor="+actor;
const post=async(path:string,input:unknown)=>(await fetch("/api/whiteboard/"+path+suffix,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)})).json();
window.whiteboardTest={
 remote:async()=>(await (await fetch("/api/whiteboard/snapshot"+suffix)).json()).snapshot as WhiteboardSnapshot,
 inspect:async()=>{const store=new AccountOfflineStore(accountId);try{return {drafts:await store.listDrafts(),operations:await store.listOperations(),recent:await store.listRecent()};}finally{store.close();}},
 lose:()=>post("control",{lose:true}),
 partner:(text:string)=>post("partner",{scene:textScene(text)}),
 clear:()=>clearAccountOfflineData(accountId),
};
const Editor=lazy(async()=>{window.EXCALIDRAW_ASSET_PATH="/vendor/excalidraw-0.18.1/";return import("@/components/phase3/whiteboard-editor");});
createRoot(document.getElementById("root")!).render(<Suspense fallback={<p>Đang tải editor thử…</p>}><Editor accountId={accountId} houseId={houseId} onClose={()=>history.back()} /></Suspense>);
type WhiteboardHarness=typeof window.whiteboardTest;
declare global { interface Window { whiteboardTest:{
 remote():Promise<WhiteboardSnapshot>;
 inspect():Promise<{drafts:Awaited<ReturnType<AccountOfflineStore["listDrafts"]>>;operations:Awaited<ReturnType<AccountOfflineStore["listOperations"]>>;recent:Awaited<ReturnType<AccountOfflineStore["listRecent"]>>}>;
 lose():Promise<unknown>;partner(text:string):Promise<unknown>;clear():Promise<void>;
}; } }
export type {WhiteboardHarness};
