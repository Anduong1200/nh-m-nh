"use client";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { validBoardPayload, type BoardItem, type BoardType } from "@/modules/board/model";
import { uploadPhotoAction, uploadVoiceAction } from "@/modules/media/actions";
import { PrivatePhoto } from "@/components/private-photo";
import { VoiceRecorder } from "@/components/media/voice-recorder";
import { doodleBounds, emptyGameDoodle, type GameDoodle } from "@/components/phase4/games/doodle-codec";
import { useBoard } from "./use-board";
import { cachedBoardItem } from "./board-local";
import "./board.css";
import { boardOrigin } from "./board-viewport";
const Drawing = lazy(async () => { window.EXCALIDRAW_ASSET_PATH="/vendor/excalidraw-0.18.1/"; return import("@/components/phase4/games/doodle-editor"); });
type BoardProps = { houseId: string; accountId: string; initialItems: BoardItem[]; onClose: () => void; syncEnabled?: boolean };
type DragState = { id: string; type: "move" | "rotate"; startX: number; startY: number; x: number; y: number; rotation: number; centerX: number; centerY: number; zIndex: number; origin: { x: number; y: number } };
const STICKERS = { leaf: "🍃", star: "✨", tea: "🍵", hug: "🫂" };
const labels = { note:"ghi chú",link:"liên kết",doodle:"bản vẽ",photo:"ảnh",voice:"âm thanh" };
const clamp = (n: number) => Math.max(-10000,Math.min(10000,n));
const angle = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
function onlineSubscribe(callback: () => void) { addEventListener("online",callback);addEventListener("offline",callback);return()=>{removeEventListener("online",callback);removeEventListener("offline",callback);}; }
function Doodle({item}: {item: BoardItem}) {
  const doodle=item.payload as GameDoodle;
  return <svg role="img" aria-label="Nét vẽ trên Bảng Chung" viewBox={doodleBounds(doodle)} className="board-doodle">{doodle.strokes.map((s,i)=><polyline key={i} points={s.points.map(p=>p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
function Content({item,houseId}: {item: BoardItem;houseId: string}) {
  if(item.type==="doodle")return <Doodle item={item}/>;
  if(item.type==="photo"&&item.mediaId)return <PrivatePhoto key={item.mediaId} mediaId={item.mediaId} houseId={houseId} alt="Ảnh đã ghim trong Nhà"/>;
  if(item.type==="voice"&&item.mediaId)return <audio aria-label="Âm thanh đã ghim trong Nhà" controls preload="none" src={`/media/${encodeURIComponent(item.mediaId)}?house=${encodeURIComponent(houseId)}`} className="board-audio"/>;
  if(item.type==="link"&&validBoardPayload("link",item.payload))return <a href={String(item.payload.url)} target="_blank" rel="noopener noreferrer" className="board-link">{String(item.payload.title||item.payload.url)}</a>;
  return <p className="board-copy">{String(item.payload.text??item.payload.caption??"Liên kết đang viết")}</p>;
}
export function Board({ houseId,accountId,initialItems,onClose,syncEnabled=true }: BoardProps) {
  const board=useBoard(accountId,houseId,initialItems,syncEnabled);
  const { items,trashed,operations,message,ready,blocked,onlineBusy,onlineRequests,change,create:createItem,save,trash,resolve,refresh,exportLocal,flush }=board;
  const scrollRef=useRef<HTMLDivElement>(null);
  const [dragging,setDragging]=useState<DragState|null>(null),[showStickers,setShowStickers]=useState(false);
  const [panel,setPanel]=useState<"link"|"photo"|"voice"|"trash"|null>(null),[drawing,setDrawing]=useState<string|null>(null);
  const [url,setUrl]=useState(""),[title,setTitle]=useState(""),[caption,setCaption]=useState(""),[file,setFile]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false),[error,setError]=useState(""),[invalidDrawing,setInvalidDrawing]=useState(false);
  const online=useSyncExternalStore(onlineSubscribe,()=>navigator.onLine,()=>true)&&syncEnabled,rotated=useRef(false),generation=useRef(0);
  const cannotDismiss=useRef(false),flushRef=useRef(flush);
  useEffect(()=>{cannotDismiss.current=uploading||invalidDrawing;flushRef.current=flush;});
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    if(!panel&&!drawing||blocked)return;
    const dialog=document.querySelector<HTMLElement>(drawing?".board-drawing-panel":".board-panel"),previous=document.activeElement as HTMLElement|null;
    if(!dialog)return;
    const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(e=>e.getClientRects().length);
    focusable()[0]?.focus();
    const key=(event: KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();if(cannotDismiss.current)return;if(drawing)void flushRef.current().then(ok=>{if(ok)setDrawing(null);});else setPanel(null);}
      if(event.key==="Tab"){const elements=focusable(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener("keydown",key);return()=>{document.removeEventListener("keydown",key);if(previous?.isConnected)previous.focus();};
  },[panel,drawing,blocked]);
  const maxZ=Math.min(1000000,Math.max(0,...items.map(i=>i.zIndex))+1);
  const origin=dragging?.origin??boardOrigin(items);
  function create(type: BoardType, payload: Record<string,unknown>, mediaId: string | null = null) {
    return createItem(type,payload,mediaId,{x:clamp((scrollRef.current?.scrollLeft??0)+48-origin.x),y:clamp((scrollRef.current?.scrollTop??0)+80-origin.y)});
  }
  const add=(text="")=>create("note",{text});
  const draftDrawing=items.find(i=>i.id===drawing&&i.type==="doodle");
  const busy=(item: BoardItem)=>board.savingItems.includes(item.id)||!!operations.find(o=>o.entityId===item.id)||onlineBusy===item.id||!ready;
  function pointerDown(e: React.PointerEvent,item: BoardItem,type:"move"|"rotate") {
    if(busy(item))return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    const rect=e.currentTarget.closest("[data-board-item]")?.getBoundingClientRect();rotated.current=false;change({...item,zIndex:maxZ});
    setDragging({id:item.id,type,startX:e.clientX,startY:e.clientY,x:item.x,y:item.y,rotation:item.rotation,centerX:rect?rect.left+rect.width/2:0,centerY:rect?rect.top+rect.height/2:0,zIndex:maxZ,origin});
  }
  function pointerMove(e: React.PointerEvent) {
    const item=items.find(i=>i.id===dragging?.id);if(!dragging||!item)return;
    if(dragging.type==="move")change({...item,zIndex:dragging.zIndex,x:clamp(dragging.x+e.clientX-dragging.startX),y:clamp(dragging.y+e.clientY-dragging.startY)});
    else {const delta=(Math.atan2(e.clientY-dragging.centerY,e.clientX-dragging.centerX)-Math.atan2(dragging.startY-dragging.centerY,dragging.startX-dragging.centerX))*180/Math.PI;if(Math.abs(delta)>.5)rotated.current=true;change({...item,zIndex:dragging.zIndex,rotation:angle(dragging.rotation+delta)});}
  }
  async function close(){if(await flush()){generation.current++;onClose();}}
  function open(next: "link"|"photo"|"voice"|"trash") {if(uploading)return;generation.current++;setPanel(next);setFile(null);setError("");setUrl("");setTitle("");setCaption("");}
  async function submitMedia(){
    if(!file||!online||uploading||(panel!=="photo"&&panel!=="voice"))return;
    const token=++generation.current,kind=panel;setUploading(true);setError("");
    try { const form=new FormData();form.set("file",file);const result=await(kind==="photo"?uploadPhotoAction:uploadVoiceAction)(form,{accountId,houseId});
      if(token!==generation.current||blocked)return;
      if(!result.media||result.media.houseId!==houseId||result.media.ownerId!==accountId||result.media.kind!==(kind==="photo"?"photo":"audio")){setError(result.error||"Chưa xác nhận được tệp riêng tư. Giữ tệp và thử lại.");return;}
      const item=create(kind,{caption},result.media.id);if(item){setPanel(null);setFile(null);await save(item);}
    }catch{if(token===generation.current)setError("Chưa tải được tệp riêng tư. Giữ tệp và thử lại.");}finally{if(token===generation.current)setUploading(false);}
  }
  return <section aria-label="Bảng Chung" className="board-room" onPointerMove={pointerMove} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}>
    <div className="board-frame" aria-hidden="true"/>
    <header className="board-status"><div className="board-heading"><h1>Bảng Chung</h1><p>Mảnh giấy, nét vẽ và những điều muốn để lại.</p></div><p role="status">{message}</p><button onClick={()=>void refresh().catch(()=>{})}>Thử đồng bộ</button><button onClick={()=>void exportLocal()}>Xuất bản nháp</button></header>
    {blocked?<div className="board-locked"><p>Bảng đã đóng vì phiên đăng nhập hoặc Nhà đã đổi.</p><a href="/auth/sign-in">Đăng nhập lại</a></div>:<>
      <div className="board-scroll" ref={scrollRef}><div className="board-space" style={{minWidth:`${Math.max(300,...items.map(i=>i.x+origin.x+320))}px`,minHeight:`${Math.max(540,...items.map(i=>i.y+origin.y+680))}px`}}>
        {items.length===0&&ready&&<p className="board-empty">Bảng còn trống. Để lại một ghi chú, bức vẽ hay điều nhỏ cho người ấy.</p>}
        {items.map(item=>{
          const pending=operations.find(o=>o.entityId===item.id),text=typeof item.payload.text==="string"?item.payload.text:"",sticker=item.type==="note"&&Object.values(STICKERS).includes(text),name=sticker?"sticker":labels[item.type];
          const remote=cachedBoardItem(pending?.conflict?.remote);
          return <article key={item.id} data-board-item={item.id} aria-label={sticker?"Sticker đã ghim":`${labels[item.type]} trên bảng`} className={`board-card ${sticker?"board-sticker":""} ${item.type==="note"?"board-note":""}`} style={{transform:`translate(${item.x+origin.x}px, ${item.y+origin.y}px) rotate(${item.rotation}deg)`,zIndex:item.zIndex}}>
            <button aria-label={`Di chuyển ${name}`} disabled={busy(item)} className="board-handle" onPointerDown={e=>pointerDown(e,item,"move")} onKeyDown={e=>{const direction:number[]|undefined={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(direction){e.preventDefault();change({...item,x:clamp(item.x+(direction[0]??0)),y:clamp(item.y+(direction[1]??0))});}}}>⠿ <span>{sticker?"Sticker":labels[item.type]}</span></button>
            {item.type==="note"?(sticker?<p className="board-sticker-image" aria-label={`Sticker ${text}`}>{text}</p>:<textarea aria-label="Nội dung ghi chú" value={text} disabled={busy(item)} maxLength={10000} placeholder="Viết gì đó..." className="board-note-text" onChange={e=>change({...item,payload:{text:e.target.value}})}/>):<Content item={item} houseId={houseId}/>}
            {item.type==="link"&&<div className="board-fields"><input aria-label="Địa chỉ liên kết" value={String(item.payload.url??"")} disabled={busy(item)} maxLength={2048} onChange={e=>change({...item,payload:{...item.payload,url:e.target.value}})}/><input aria-label="Tên liên kết" value={String(item.payload.title??"")} disabled={busy(item)} maxLength={200} onChange={e=>change({...item,payload:{...item.payload,title:e.target.value}})}/></div>}
            {(item.type==="photo"||item.type==="voice")&&<textarea aria-label={`Chú thích ${name}`} value={String(item.payload.caption??"")} disabled={busy(item)} maxLength={1000} placeholder="Một dòng về tệp này…" className="board-caption" onChange={e=>change({...item,payload:{caption:e.target.value}})}/>}
            <div className="board-card-actions">
              <button disabled={busy(item)} aria-label={`Xoay ${name}`} onPointerDown={e=>pointerDown(e,item,"rotate")} onClick={()=>{if(!rotated.current)change({...item,rotation:angle(item.rotation+15)});rotated.current=false;}}>↻</button>
              {item.type==="doodle"&&<button disabled={busy(item)} onClick={()=>{setDrawing(item.id);setInvalidDrawing(false);}}>Sửa bản vẽ</button>}
              <button disabled={busy(item)||(!online&&item.type!=="note"&&item.type!=="doodle")} className="board-save" onClick={()=>void save(item)}>Lưu {name}</button>
              {item.createdBy===accountId&&item.version>0&&<button disabled={busy(item)||!online} onClick={()=>void trash(item)}>{onlineRequests[item.id]?"Xác nhận lần gửi cũ":"Đưa vào thùng rác"}</button>}
              {pending&&<span>{pending.state==="conflict"?"Có hai bản":"Chờ xác nhận lưu"}</span>}
              {pending?.conflict&&!pending.resolutionOperationId&&<div className="board-conflict"><p>Bản của Nhà:</p>{remote?<Content item={remote} houseId={houseId}/>:<p>Nội dung đã đổi; bản đang viết vẫn được giữ.</p>}<button onClick={()=>void resolve(pending,false)}>Giữ bản của Nhà</button><button onClick={()=>void resolve(pending,true)}>Dùng bản đang viết</button></div>}
            </div>
          </article>;
        })}
      </div></div>
      <div role="toolbar" aria-label="Dụng cụ Bảng Chung" className="board-toolbar">
        <button onClick={()=>void close()} aria-label="Trở về phòng">✕</button><button onClick={()=>add()} disabled={!ready} aria-label="+ Thêm ghi chú">+ Ghi chú</button>
        <button disabled={!ready} onClick={()=>{const item=create("doodle",emptyGameDoodle());if(item){setDrawing(item.id);setInvalidDrawing(false);}}}>+ Vẽ</button>
        <button disabled={!ready} onClick={()=>open("link")}>+ Link</button><button disabled={!ready||!online} onClick={()=>open("photo")}>+ Ảnh</button><button disabled={!ready||!online} onClick={()=>open("voice")}>+ Âm thanh</button>
        <div className="board-stickers"><button onClick={()=>setShowStickers(!showStickers)} disabled={!ready} aria-label="Thêm sticker" aria-expanded={showStickers}>✨</button>{showStickers&&<div>{Object.entries(STICKERS).map(([key,symbol])=><button key={key} aria-label={`Sticker ${key}`} onClick={()=>{add(symbol);setShowStickers(false);}}>{symbol}</button>)}</div>}</div>
        <button onClick={()=>open("trash")}>Thùng rác ({trashed.length})</button>
      </div>
    </>}
    {!blocked&&panel&&<div className="board-panel" role="dialog" aria-modal="true" aria-label={panel==="trash"?"Thùng rác của bảng":`Thêm ${panel==="link"?"liên kết":panel==="photo"?"ảnh":"âm thanh"}`}>
      <button className="board-panel-close" disabled={uploading} onClick={()=>{generation.current++;setPanel(null);setFile(null);}}>Đóng</button>
      {panel==="trash"?<><h2>Thùng rác của Bảng Chung</h2><p>Cả hai xem được. Người tạo khôi phục vật dụng của mình; không có xóa vĩnh viễn.</p>{trashed.length===0&&<p>Thùng rác đang trống.</p>}{trashed.map(item=><article key={item.id} className="board-trash-item"><Content item={item} houseId={houseId}/>{item.createdBy===accountId?<button disabled={!online||!!onlineBusy} onClick={()=>void trash(item,true)}>Khôi phục {labels[item.type]}</button>:<p>Người tạo có thể khôi phục vật dụng này.</p>}</article>)}</>:panel==="link"?<form onSubmit={e=>{e.preventDefault();if(!validBoardPayload("link",{url,title})){setError("Nhập liên kết HTTP hoặc HTTPS hợp lệ, không chứa thông tin đăng nhập.");return;}const item=create("link",{url,title});if(item){setPanel(null);void save(item);}}}><h2>Ghim một liên kết</h2><label>Địa chỉ HTTP(S)<input aria-label="Liên kết mới" type="url" required value={url} maxLength={2048} onChange={e=>setUrl(e.target.value)}/></label><label>Tên ngắn<input aria-label="Tên liên kết mới" value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label><p>Không tự tải nội dung hay ảnh xem trước từ trang bên ngoài.</p><button type="submit">Ghim liên kết</button></form>:<form onSubmit={e=>{e.preventDefault();void submitMedia();}}><h2>{panel==="photo"?"Ghim một bức ảnh":"Để lại âm thanh"}</h2><p>{panel==="photo"?"JPEG, PNG hoặc WebP tĩnh, tối đa 4 MB.":"Chọn âm thanh WAV PCM, tối đa 60 giây và 4 MB."} Cần kết nối để tải tệp riêng tư.</p>{panel==="voice"&&<VoiceRecorder disabled={uploading||!online} onRecorded={setFile}/>}<label>Chọn tệp<input aria-label={panel==="photo"?"Chọn ảnh cho bảng":"Chọn âm thanh cho bảng"} type="file" accept={panel==="photo"?"image/jpeg,image/png,image/webp":"audio/wav,.wav"} disabled={uploading||!online} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>{file&&<p>Đã chọn: {file.name}</p>}<label>Chú thích<textarea aria-label="Chú thích tệp mới" value={caption} maxLength={1000} disabled={uploading} onChange={e=>setCaption(e.target.value)}/></label><button type="submit" disabled={!file||!online||uploading}>{uploading?"Đang tải tệp riêng tư…":"Tải và ghim"}</button></form>}
      {error&&<p role="alert">{error}</p>}
    </div>}
    {!blocked&&draftDrawing&&<div className="board-drawing-panel" role="dialog" aria-modal="true" aria-label="Vẽ trên Bảng Chung"><div className="board-drawing-bar"><h2>Để lại một nét vẽ</h2><button onClick={()=>void flush().then(ok=>{if(ok)setDrawing(null);})}>Giữ bản nháp và đóng</button><button disabled={invalidDrawing} onClick={()=>void save(draftDrawing).then(()=>{if(!invalidDrawing)setDrawing(null);})}>Lưu bản vẽ</button></div><p>Bản nháp được giữ trên máy; cả hai có thể sửa bản đã ghim. Chỉ nhận nét bút trong khung này.</p><Suspense fallback={<p role="status">Đang mở bút vẽ…</p>}><Drawing initial={draftDrawing.payload as GameDoodle} previous={emptyGameDoodle()} disabled={busy(draftDrawing)} onChange={next=>{setInvalidDrawing(!next||!validBoardPayload("doodle",next));if(next&&validBoardPayload("doodle",next)&&JSON.stringify(next)!==JSON.stringify(draftDrawing.payload))change({...draftDrawing,payload:next});}}/></Suspense>{invalidDrawing&&<p role="alert">Bản vẽ chỉ nhận nét bút trong giới hạn lưu. Bỏ vật dụng không hỗ trợ hoặc giảm số nét trước khi gửi.</p>}</div>}
  </section>;
}
