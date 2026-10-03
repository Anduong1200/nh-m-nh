"use client";
import { lazy, Suspense, useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { subscribeAccountInvalidation } from "@/lib/offline";
import { GAME_DEFAULT_TURNS, GAME_TYPES, gameLocalId, parseGameCommand, parseGameMove, parseGameSession, type GameContext, type GameSession, type GameType } from "@/modules/games/model";
import { gameActionTransport } from "@/modules/games/transport";
import { listGameSessionsAction } from "@/modules/games/actions";
import { uploadPhotoAction } from "@/modules/media/actions";
import type { MediaReference } from "@/modules/media/model";
import { PrivatePhoto } from "@/components/private-photo";
import type { GameProposal, GameTransport } from "@/modules/games/sync";
import { GamesWorkspace, isStaleGameDraft, type GameList } from "./workspace";
import { doodleBounds, emptyGameDoodle, type GameDoodle } from "./doodle-codec";
import "./games.css";

const Drawing=lazy(async()=>{window.EXCALIDRAW_ASSET_PATH="/vendor/excalidraw-0.18.1/";return import("./doodle-editor");});
const games: Record<GameType,{title:string;description:string;icon:string}>={
  "doodle-relay":{title:"Doodle Relay",description:"Vẽ tiếp sức, mỗi người thêm một nét.",icon:"🎨"},
  "draw-guess":{title:"Draw & Guess",description:"Bạn vẽ, người ấy đoán từ khóa riêng.",icon:"🤔"},
  "one-line-story":{title:"One-line Story",description:"Cùng viết một câu chuyện, mỗi lượt một dòng.",icon:"✍️"},
  "photo-mission":{title:"Photo Mission",description:"Chọn một thử thách nhỏ và để lại hai bức ảnh.",icon:"📸"},
};
type Upload = (form: FormData,context: GameContext)=>Promise<{media?:MediaReference;error?:string;blocked?:boolean}>;
type PhotoProps = {mediaId:string;houseId:string;alt?:string};
export type GamesScreenProps = {context: GameContext;initialSessions:GameSession[];initialSessionId?:string|undefined;initialError?:string|undefined;transport?:GameTransport;list?:GameList;upload?:Upload;PhotoComponent?:ComponentType<PhotoProps>};
const json=(value:unknown):JsonValue=>JSON.parse(JSON.stringify(value)) as JsonValue;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);

export function GamesScreen({context,initialSessions,initialSessionId,initialError,transport=gameActionTransport,list=listGameSessionsAction,upload=uploadPhotoAction,PhotoComponent=PrivatePhoto}:GamesScreenProps) {
  const [workspace,setWorkspace]=useState<GamesWorkspace|null>(null);
  const [invalidated,setInvalidated]=useState(false);
  useEffect(()=>{
    const w=new GamesWorkspace(context,new AccountOfflineStore(context.accountId),transport,list,initialSessions,()=>navigator.onLine);
    let active=true;
    void w.open().then(()=>{if(active)setWorkspace(w);});
    const refresh=()=>void w.refresh();
    const visible=()=>{if(document.visibilityState==="visible")refresh();};
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(w.hasUnflushedDraft()){event.preventDefault();event.returnValue="";}};
    window.addEventListener("online",refresh);window.addEventListener("offline",refresh);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
    window.addEventListener("beforeunload",beforeUnload);
    const unsubscribe=subscribeAccountInvalidation(context.accountId,()=>{w.close();if(active)setInvalidated(true);});
    return ()=>{active=false;unsubscribe();w.close();window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);window.removeEventListener("focus",visible);window.removeEventListener("beforeunload",beforeUnload);document.removeEventListener("visibilitychange",visible);};
  },[context,transport,list,initialSessions]);
  if(invalidated)return <main className="games-room"><h1>Hộp trò chơi đã đóng.</h1><p>Phiên đăng nhập đã đổi. <a href="/auth/sign-in">Đăng nhập lại</a> để xác nhận quyền vào Nhà.</p></main>;
  return workspace&&workspace.context.accountId===context.accountId&&workspace.context.houseId===context.houseId ? <WorkspaceScreen key={`${context.accountId}:${context.houseId}`} workspace={workspace} initialSessionId={initialSessionId} initialError={initialError} upload={upload} Photo={PhotoComponent}/> : <main className="games-room"><h1>Hộp Trò Chơi</h1><p role="status">Đang mở bản nháp và hộp trò chơi…</p><a href="/house">Về Nhà</a></main>;
}
function WorkspaceScreen({workspace,initialSessionId,initialError,upload,Photo}:{workspace:GamesWorkspace;initialSessionId?:string|undefined;initialError?:string|undefined;upload:Upload;Photo:ComponentType<PhotoProps>}) {
  const router=useRouter();
  const state=useSyncExternalStore(workspace.subscribe,workspace.getState,workspace.getState);
  const [selected,setSelected]=useState<string|null>(initialSessionId??null);
  const [creating,setCreating]=useState<{id:string;gameType:GameType}|null>(null);
  const [history,setHistory]=useState(false);
  const [error,setError]=useState("");
  const [navigating,setNavigating]=useState(false);
  const session=state.sessions.find(s=>s.id===selected);
  const operations=state.operations.filter(o=>o.entityId===gameLocalId(selected??creating?.id??""));
  const conflict=operations.find(o=>o.state==="conflict"&&!o.resolutionOperationId);
  const remote=parseGameSession(conflict?.conflict?.remote);
  const draft=state.drafts.find(d=>d.id===gameLocalId(selected??creating?.id??""));
  const recoveries=state.drafts.filter(d=>d.id.startsWith("game-recovery:")&&record(d.payload)&&d.payload.mode==="recovery");
  async function run(task:()=>Promise<unknown>){setError("");try{await task();}catch{setError("Chưa xác nhận được thao tác. Bản nháp và lượt chờ vẫn được giữ.");}}
  async function navigate(change:()=>void){
    if(navigating)return;setNavigating(true);setError("");
    try{if(!await workspace.flushDrafts()){setError("Chưa giữ được thay đổi mới nhất. Màn này vẫn mở; bạn có thể xuất bản nháp trước khi thử lại.");return;}change();}
    catch{setError("Chưa giữ được bản nháp. Giữ màn này và thử lại.");}
    finally{setNavigating(false);}
  }
  async function exportDrafts(){const data=await workspace.exportLocal(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="nha-minh-games-drafts.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const open=(id:string)=>void navigate(()=>{setCreating(null);setSelected(id);});
  const sessions=state.sessions.filter(s=>history?s.status==="completed":s.status==="active");
  return <main className="games-room">
    <header><div><h1>Hộp Trò Chơi</h1><p>Để lại một lượt nhỏ. Người ấy tiếp tục khi có thời gian.</p></div><a href="/house" onClick={e=>{e.preventDefault();void navigate(()=>router.push("/house"));}}>Về Nhà</a></header>
    <nav aria-label="Hộp trò chơi"><button disabled={navigating} onClick={()=>void navigate(()=>{setHistory(false);setCreating(null);setSelected(null);})}>Đang chơi</button><button disabled={navigating} onClick={()=>void navigate(()=>{setHistory(true);setCreating(null);setSelected(null);})}>Kỷ vật trò chơi</button><button disabled={state.busy||state.blocked||navigating} onClick={()=>void run(()=>workspace.refresh())}>Tải lại</button><button onClick={()=>void run(exportDrafts)}>Xuất bản nháp</button></nav>
    <p role="status">{state.online?state.busy?"Đang xác nhận với Nhà…":state.notice:"Đang ngoại tuyến. Bạn vẫn có thể giữ bản nháp và xếp lượt chờ gửi."} {state.operations.length>0&&`${state.operations.length} lượt đang chờ xác nhận.`}</p>
    {(state.error||error||initialError&&!state.sessions.length)&&<p role="alert">{error||state.error||initialError}</p>}
    {state.blocked ? <p>Hộp trò chơi tạm đóng vì phiên đăng nhập hoặc Nhà đã đổi. <a href="/auth/sign-in">Đăng nhập lại</a>. Bản nháp được giữ riêng trên máy.</p> : <>
      {!history&&<section aria-label="Bắt đầu màn mới" className="games-lobby">{GAME_TYPES.map(type=><button key={type} disabled={navigating} onClick={()=>void navigate(()=>{setSelected(null);setCreating({id:crypto.randomUUID(),gameType:type});})}><span aria-hidden="true">{games[type].icon}</span><strong>{games[type].title}</strong><span>{games[type].description}</span></button>)}</section>}
      <section aria-label={history?"Kỷ vật đã hoàn thành":"Các màn đang chơi"} className="games-session-list">
        <h2>{history?"Những màn đã thành kỷ vật":"Màn đang chơi"}</h2>
        {sessions.length===0&&<p>{history?"Chưa có kỷ vật trò chơi. Những màn hoàn thành sẽ được giữ ở đây.":"Chưa có màn đang chơi. Chọn một trò ở trên để bắt đầu."}</p>}
        {sessions.map(s=><button key={s.id} disabled={navigating} onClick={()=>open(s.id)} aria-pressed={selected===s.id}><strong>{games[s.gameType].title}</strong><span>{s.gameType==="draw-guess"?s.status==="completed"?s.answer:"Một bức vẽ và từ khóa riêng":s.prompt}</span><small>{s.status==="completed"?"Đã hoàn thành":s.turn?.userId===workspace.context.accountId?"Đến lượt bạn":"Đợi người ấy tiếp tục khi rảnh"} · {s.events.length}/{s.turnLimit}</small></button>)}
      </section>
      {!history&&state.drafts.filter(d=>record(d.payload)&&d.payload.mode==="create"&&!state.sessions.some(s=>d.id===gameLocalId(s.id))&&d.id.startsWith("game:")).map(d=>{const payload=d.payload as Record<string,unknown>;const type=payload.gameType as GameType;return GAME_TYPES.includes(type)?<button key={d.id} disabled={navigating} onClick={()=>void navigate(()=>{setSelected(null);setCreating({id:d.id.slice(5),gameType:type});})}>Mở bản nháp {games[type].title}</button>:null;})}
      {recoveries.length>0&&<section className="games-paper" aria-label="Bản nháp lượt cũ"><h2>Bản nháp lượt cũ vẫn ở đây</h2><p>Nhà đã sang lượt khác. Những đóng góp chưa gửi được cất riêng trên máy, không tự thêm vào lượt mới. Dùng “Xuất bản nháp” để giữ một bản sao.</p>{recoveries.map(d=>{const p=d.payload as Record<string,unknown>;return <details key={d.id}><summary>Bản nháp {typeof p.sourceVersion==="number"?`ở lượt ${p.sourceVersion}`:"chưa xác định lượt"} · {d.updatedAt}</summary><RecoveryPreview content={p.content} houseId={d.houseId} Photo={Photo}/></details>;})}</section>}
      {creating&&<section className="games-paper" aria-label="Tạo màn trò chơi"><CreateForm key={creating.id} value={creating} initial={draft?.payload} workspace={workspace} pending={operations.length>0||navigating} onCreated={id=>{setCreating(null);setSelected(id);}}/></section>}
      {session&&<section className="games-paper" aria-label="Màn trò chơi đang chọn"><h2>{games[session.gameType].title}</h2><p>{session.gameType==="draw-guess"?session.answer!==null?`Từ khóa: ${session.answer}`:"Từ khóa được giữ kín đến khi màn hoàn thành.":`Chủ đề: ${session.prompt}`}</p><GameArtifact session={session} Photo={Photo}/>
        {draft&&isStaleGameDraft(draft.payload,session,workspace.context.accountId)&&<p role="status">Bản nháp trước thuộc lượt khác hoặc chưa xác định được lượt. Nội dung vẫn giữ trên máy; xem “Bản nháp lượt cũ” hoặc xuất bản nháp trước khi tiếp tục.</p>}
        {session.status==="active"&&<><p role="status">Lượt {session.turn?.number}/{session.turnLimit} · {session.turn?.userId===workspace.context.accountId?"Đến lượt bạn":"Người ấy sẽ tiếp tục khi rảnh."}</p>{session.turn?.userId===workspace.context.accountId&&<MoveForm key={`${session.id}:${session.version}`} session={session} initial={draft?.payload} workspace={workspace} upload={upload} Photo={Photo} pending={operations.length>0||navigating}/>}</>}
        {session.status==="completed"&&<p>Kỷ vật đã được giữ trong Nhà. Cả hai có thể mở lại bất cứ lúc nào.</p>}
      </section>}
      {selected&&!session&&operations.length>0&&<p>Màn mới hoặc lượt chơi đang chờ Nhà xác nhận. Bản nháp vẫn được giữ.</p>}
      {conflict&&remote&&<section className="games-conflict" aria-label="Xung đột lượt chơi"><h2>Có hai bản của lượt này.</h2><p>Bản của Nhà ở phiên bản {remote.version}. Đóng góp chờ gửi của bạn được giữ riêng.</p><GameArtifact session={remote} Photo={Photo}/><button onClick={()=>void run(()=>workspace.keepRemote(conflict.operationId))}>Giữ bản của Nhà, cất bản nháp</button><button disabled={remote.turn?.userId!==workspace.context.accountId||remote.status!=="active"} onClick={()=>void run(async()=>{const payload=record(conflict.payload)?conflict.payload:{};const command=parseGameCommand({...payload,expectedVersion:remote.version,operationId:crypto.randomUUID()});if(!command||command.kind==="create")throw new Error("Review new turn");const {operationId,...proposal}=command;void operationId;await workspace.resolve(conflict.operationId,proposal);})}>Gửi đóng góp đã xem theo lượt mới</button></section>}
    </>}
  </main>;
}
function RecoveryPreview({content,houseId,Photo}:{content:unknown;houseId:string;Photo:ComponentType<PhotoProps>}) {
  if(!record(content))return <p>Bản nháp giữ nguyên trong bản xuất.</p>;
  const doodle=parseGameMove({kind:"doodle",payload:content.doodle});
  const photo=parseGameMove({kind:"photo",payload:{mediaId:content.mediaId,caption:typeof content.caption==="string"?content.caption:""}});
  return <div className="games-artifact">
    {typeof content.text==="string"&&<p>{content.text}</p>}
    {typeof content.prompt==="string"&&<p>{content.prompt}</p>}
    {typeof content.caption==="string"&&<p>{content.caption}</p>}
    {photo?.kind==="photo"&&<Photo mediaId={photo.payload.mediaId} houseId={houseId} alt="Ảnh trong bản nháp lượt cũ"/>}
    {doodle?.kind==="doodle"&&<svg role="img" aria-label="Nét vẽ trong bản nháp lượt cũ" viewBox={doodleBounds(doodle.payload)}>{doodle.payload.strokes.map((s,i)=><polyline key={i} points={s.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"/>)}</svg>}
  </div>;
}
function CreateForm({value,initial,workspace,pending,onCreated}:{value:{id:string;gameType:GameType};initial:JsonValue|undefined;workspace:GamesWorkspace;pending:boolean;onCreated:(id:string)=>void}) {
  const id=useId(),previous=record(initial)&&initial.mode==="create"?initial:null;
  const [prompt,setPrompt]=useState(typeof previous?.prompt==="string"?previous.prompt:"");
  const [turns,setTurns]=useState(typeof previous?.turnLimit==="number"?previous.turnLimit:GAME_DEFAULT_TURNS[value.gameType]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const payload={mode:"create",gameType:value.gameType,prompt,turnLimit:turns};
  const proposal:GameProposal={sessionId:value.id,expectedVersion:0,kind:"create",payload:{gameType:value.gameType,prompt,turnLimit:turns}};
  const valid=!!parseGameCommand({...proposal,operationId:"11111111-1111-4111-8111-111111111111"});
  return <form onSubmit={e=>{e.preventDefault();setBusy(true);setError("");void (async()=>{if(!await workspace.saveDraft(value.id,json(payload)))throw new Error("Draft conflict");await workspace.submit(proposal);onCreated(value.id);})().catch(()=>setError("Màn mới chưa được xác nhận. Bản nháp và hàng đợi vẫn được giữ.")).finally(()=>setBusy(false));}}>
    <h2>Bắt đầu {games[value.gameType].title}</h2><label htmlFor={`${id}-prompt`}>{value.gameType==="draw-guess"?"Từ khóa bí mật":"Chủ đề của hai đứa"}</label><input id={`${id}-prompt`} value={prompt} maxLength={value.gameType==="draw-guess"?100:500} onChange={e=>{const next=e.target.value;setPrompt(next);workspace.stageDraft(value.id,json({...payload,prompt:next}));}} disabled={pending||busy}/>
    {value.gameType==="draw-guess"&&<p>Người đoán chưa thấy từ khóa cho đến khi kết thúc. Đoán đúng cần khớp dấu và chữ hoa/chữ thường; khoảng trắng đầu/cuối được bỏ qua.</p>}
    {value.gameType==="photo-mission"&&<p>Mỗi người góp một ảnh. Ảnh tải lên được chia sẻ trong Nhà riêng của hai đứa; gửi lượt sẽ góp ảnh vào thử thách.</p>}
    {(value.gameType==="doodle-relay"||value.gameType==="one-line-story")&&<><label htmlFor={`${id}-turns`}>Số lượt: {turns}</label><input id={`${id}-turns`} type="range" min={2} max={12} step={1} value={turns} disabled={pending||busy} onChange={e=>{const next=Number(e.target.value);setTurns(next);workspace.stageDraft(value.id,json({...payload,turnLimit:next}));}}/></>}
    {error&&<p role="alert">{error}</p>}<button type="submit" disabled={!valid||busy||pending}>{pending?"Màn đang chờ xác nhận":busy?"Đang giữ màn mới…":"Tạo màn"}</button>
  </form>;
}
function MoveForm({session,initial,workspace,upload,Photo,pending}:{session:GameSession;initial:JsonValue|undefined;workspace:GamesWorkspace;upload:Upload;Photo:ComponentType<PhotoProps>;pending:boolean}) {
  const id=useId(),previous=record(initial)&&initial.mode==="move"&&initial.serverVersion===session.version?initial:null;
  const [text,setText]=useState(typeof previous?.text==="string"?previous.text:"");
  const [caption,setCaption]=useState(typeof previous?.caption==="string"?previous.caption:"");
  const [mediaId,setMediaId]=useState(typeof previous?.mediaId==="string"?previous.mediaId:"");
  const [doodle,setDoodle]=useState<GameDoodle|null>(previous&&parseGameMove({kind:"doodle",payload:previous.doodle})?.kind==="doodle"?previous.doodle as GameDoodle:emptyGameDoodle());
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const phase=session.turn!.phase,previousDoodle:GameDoodle={schemaVersion:1,strokes:session.events.flatMap(e=>e.kind==="doodle"?e.payload.strokes:[])};
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const draftPayload={mode:"move",serverVersion:session.version,text,caption,mediaId,doodle};
  const kind=phase==="drawing"?"doodle":phase;
  const payload=kind==="doodle"?doodle:kind==="photo"?{mediaId,caption}:{text};
  const proposal= {sessionId:session.id,expectedVersion:session.version,kind,payload} as GameProposal;
  const valid=!!parseGameCommand({...proposal,operationId:"11111111-1111-4111-8111-111111111111"});
  return <form onSubmit={e=>{e.preventDefault();setBusy(true);setError("");void (async()=>{if(!await workspace.saveDraft(session.id,json({mode:"move",serverVersion:session.version,text,caption,mediaId,doodle})))throw new Error("Draft conflict");await workspace.submit(proposal);})().catch(()=>setError("Lượt chơi chưa được xác nhận. Đóng góp của bạn vẫn được giữ.")).finally(()=>setBusy(false));}}>
    {(phase==="line"||phase==="guess")&&<><label htmlFor={`${id}-text`}>{phase==="line"?"Một dòng tiếp theo":"Bạn đoán là gì?"}</label><input id={`${id}-text`} value={text} maxLength={phase==="line"?500:100} onChange={e=>{const next=e.target.value;setText(next);workspace.stageDraft(session.id,json({...draftPayload,text:next}));}} disabled={pending||busy}/>{phase==="guess"&&<p>Đáp án khớp dấu và chữ hoa/chữ thường. Bạn có tối đa ba lần đoán.</p>}</>}
    {(phase==="doodle"||phase==="drawing")&&<Suspense fallback={<p role="status">Đang mở bút vẽ…</p>}><Drawing initial={doodle??emptyGameDoodle()} previous={previousDoodle} onChange={next=>{if(JSON.stringify(doodle)!==JSON.stringify(next)){setDoodle(next);workspace.stageDraft(session.id,json({...draftPayload,doodle:next}));}}} disabled={pending||busy}/></Suspense>}
    {phase==="photo"&&<><label htmlFor={`${id}-photo`}>Ảnh cho thử thách</label><input id={`${id}-photo`} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending||busy||!navigator.onLine} onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!file.size||file.size>4*1024*1024){setError("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 4 MB.");return;}setBusy(true);setError("");const data=new FormData();data.set("file",file);void upload(data,workspace.context).then(async result=>{await workspace.assertCurrent();if(!mounted.current)return;if(!result.media||result.media.houseId!==workspace.context.houseId||result.media.ownerId!==workspace.context.accountId||result.media.kind!=="photo"){setError(result.error??"Chưa xác nhận được ảnh riêng trong Nhà.");return;}setMediaId(result.media.id);workspace.stageDraft(session.id,json({...draftPayload,mediaId:result.media.id}));}).catch(()=>{if(mounted.current)setError("Chưa lưu được ảnh riêng trong Nhà. Thử lại khi có kết nối.");}).finally(()=>{if(mounted.current)setBusy(false);});}}/><p>Ảnh JPEG, PNG hoặc WebP tĩnh, tối đa 4 MB và 25 megapixel. Chọn ảnh cần kết nối; bản nháp chú thích vẫn được giữ khi ngoại tuyến.</p>{mediaId&&<Photo mediaId={mediaId} houseId={session.houseId} alt="Ảnh đã chọn cho lượt của bạn"/>}<label htmlFor={`${id}-caption`}>Chú thích nhỏ</label><input id={`${id}-caption`} maxLength={500} value={caption} onChange={e=>{const next=e.target.value;setCaption(next);workspace.stageDraft(session.id,json({...draftPayload,caption:next}));}} disabled={pending||busy}/></>}
    {doodle===null&&(phase==="doodle"||phase==="drawing")&&<p role="alert">Bản vẽ chỉ nhận nét bút và cần nằm trong giới hạn lưu. Bỏ vật dụng không hỗ trợ hoặc giảm số nét trước khi gửi.</p>}
    {error&&<p role="alert">{error}</p>}<button type="submit" disabled={!valid||busy||pending}>{pending?"Lượt đang chờ Nhà xác nhận":busy?"Đang giữ đóng góp…":"Gửi lượt"}</button>
  </form>;
}
export function GameArtifact({session,Photo=PrivatePhoto}:{session:GameSession;Photo?:ComponentType<PhotoProps>}) {
  const doodle:GameDoodle={schemaVersion:1,strokes:session.events.flatMap(e=>e.kind==="doodle"?e.payload.strokes:[])};
  return <div className="games-artifact">
    {doodle.strokes.length>0&&<svg role="img" aria-label="Bức vẽ chung đã gửi" viewBox={doodleBounds(doodle)}>{doodle.strokes.map((s,i)=><polyline key={i} points={s.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"/>)}</svg>}
    {session.events.filter(e=>e.kind!=="doodle").map(e=><article key={e.operationId}>{e.kind==="photo"?<><Photo mediaId={e.payload.mediaId} houseId={session.houseId} alt="Ảnh trong thử thách của hai đứa"/><p>{e.payload.caption}</p></>:<p>{e.kind==="guess"?`Lần đoán: ${e.payload.text}`:e.payload.text}</p>}</article>)}
    {session.events.length===0&&<p>Trang đầu vẫn đang để trống cho hai đứa.</p>}
  </div>;
}
