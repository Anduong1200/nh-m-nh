"use client";
import { useRef, useState } from "react";
import type { BoardItem } from "@/modules/board/model";
import type { JsonValue } from "@/lib/offline/store";
import { useBoard } from "./use-board";
type BoardProps = { houseId: string; accountId: string; initialItems: BoardItem[]; onClose: () => void };
type DragState = { id: string; type: "move" | "rotate"; startX: number; startY: number; x: number; y: number; rotation: number; centerX: number; centerY: number; zIndex: number };
const STICKERS = { leaf: "🍃", star: "✨", tea: "🍵", hug: "🫂" };
const clamp = (n: number) => Math.max(-10000,Math.min(10000,n));
const angle = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
function remoteText(value: JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload)) return String(value.payload.text ?? "");
  return "Nội dung đã đổi";
}
export function Board({ houseId,accountId,initialItems,onClose }: BoardProps) {
  const { items,operations,message,ready,change,add,save,resolve,refresh,exportLocal } = useBoard(accountId,houseId,initialItems);
  const [dragging,setDragging] = useState<DragState | null>(null);
  const [showStickers,setShowStickers] = useState(false);
  const rotated = useRef(false);
  const maxZ = Math.min(1000000,Math.max(0,...items.map(i=>i.zIndex))+1);
  function pointerDown(e: React.PointerEvent, item: BoardItem, type: "move" | "rotate") {
    if (item.type !== "note" || operations.some(o=>o.entityId===item.id)) return;
    e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    const rect=e.currentTarget.closest("[data-board-item]")?.getBoundingClientRect();
    rotated.current=false;
    change({...item,zIndex:maxZ});
    setDragging({id:item.id,type,startX:e.clientX,startY:e.clientY,x:item.x,y:item.y,rotation:item.rotation,centerX:rect ? rect.left+rect.width/2 : 0,centerY:rect ? rect.top+rect.height/2 : 0,zIndex:maxZ});
  }
  function pointerMove(e: React.PointerEvent) {
    const item=items.find(i=>i.id===dragging?.id);
    if (!dragging || !item) return;
    if (dragging.type==="move") change({...item,zIndex:dragging.zIndex,x:clamp(dragging.x+e.clientX-dragging.startX),y:clamp(dragging.y+e.clientY-dragging.startY)});
    else {
      const delta=(Math.atan2(e.clientY-dragging.centerY,e.clientX-dragging.centerX)-Math.atan2(dragging.startY-dragging.centerY,dragging.startX-dragging.centerX))*180/Math.PI;
      if (Math.abs(delta)>.5) rotated.current=true;
      change({...item,zIndex:dragging.zIndex,rotation:angle(dragging.rotation+delta)});
    }
  }
  return <section aria-label="Bảng Chung" className="fixed inset-0 z-50 overflow-hidden select-none touch-none"
    style={{backgroundColor:"var(--scene-board)",backgroundImage:"radial-gradient(circle, var(--scene-wood) 1px, transparent 1px)",backgroundSize:"20px 20px"}}
    onPointerMove={pointerMove} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}>
    <div className="absolute inset-0 pointer-events-none border-[12px] sm:border-[16px] border-[var(--scene-wood)] opacity-80 mix-blend-multiply" />
    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]" />
    <div role="toolbar" aria-label="Dụng cụ Bảng Chung" className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000002] flex items-center gap-2 sm:gap-4 shadow-xl rounded-full bg-white/90 backdrop-blur-md p-2 border border-white/50">
      <button onClick={onClose} aria-label="Trở về phòng" className="w-12 h-12 rounded-full bg-gray-100 text-xl shadow-inner">✕</button>
      <button onClick={()=>add()} disabled={!ready} aria-label="+ Thêm ghi chú" className="px-4 sm:px-6 h-12 rounded-full bg-[var(--forest)] text-[var(--paper)] text-sm font-bold shadow-md whitespace-nowrap">+ Ghi chú</button>
      <div className="relative">
        <button onClick={()=>setShowStickers(!showStickers)} disabled={!ready} aria-label="Thêm sticker" aria-expanded={showStickers} className="w-12 h-12 rounded-full bg-amber-100 text-2xl shadow-md">✨</button>
        {showStickers && <div className="absolute bottom-16 right-0 flex gap-2 p-3 bg-white rounded-2xl shadow-xl border border-gray-100">
          {Object.entries(STICKERS).map(([key,symbol])=><button key={key} aria-label={"Sticker "+key} className="w-11 h-11 text-3xl" onClick={()=>{add(symbol);setShowStickers(false);}}>{symbol}</button>)}
        </div>}
      </div>
    </div>
    <p role="status" className="absolute top-6 left-6 right-6 z-[1000001] rounded bg-[var(--paper)] p-2 text-sm text-[var(--forest)]">{message} <button className="underline min-h-11" onClick={()=>void refresh()}>Thử đồng bộ</button> · <button className="underline min-h-11" onClick={()=>void exportLocal()}>Xuất bản nháp</button></p>
    <div className="w-full h-full relative" style={{touchAction:"none"}}>
      {items.map(item=>{
        const pending=operations.find(o=>o.entityId===item.id);
        const text=typeof item.payload.text==="string" ? item.payload.text : "";
        // Stickers use the existing note text contract; no unknown attachment schema.
        const sticker=item.type==="note" && Object.values(STICKERS).includes(text);
        return <article key={item.id} data-board-item={item.id} aria-label={sticker ? "Sticker đã ghim" : "Vật dụng trên bảng"}
          className={"absolute flex flex-col group transition-shadow duration-200 "+(dragging?.id===item.id ? "shadow-2xl" : "shadow-md")}
          style={{transform:"translate("+item.x+"px, "+item.y+"px) rotate("+item.rotation+"deg)",zIndex:item.zIndex,width:sticker ? "160px" : "220px",minHeight:sticker ? "160px" : "220px",backgroundColor:sticker ? "#fffdf5" : item.type==="note" ? "#fef3c7" : "#e0f2fe",borderRadius:sticker ? "24px" : "2px 8px 2px 8px"}}>
          {!sticker && <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 pointer-events-none opacity-80" style={{backgroundColor:"rgba(255,255,255,.4)",border:"1px solid rgba(0,0,0,.05)",transform:"rotate(-2deg)",boxShadow:"0 1px 2px rgba(0,0,0,.05)",maskImage:"linear-gradient(to right, transparent, black 5%, black 95%, transparent)"}} />}
          {item.type==="note" && <button aria-label={sticker ? "Di chuyển sticker" : "Di chuyển ghi chú"} disabled={!!pending} className="w-full min-h-11 cursor-grab active:cursor-grabbing bg-black/5 rounded-t"
            onPointerDown={e=>pointerDown(e,item,"move")}
            onKeyDown={e=>{const direction:number[]|undefined={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(direction){e.preventDefault();change({...item,x:clamp(item.x+(direction[0]??0)),y:clamp(item.y+(direction[1]??0))});}}}>⠿</button>}
          {item.type==="note" && (sticker ? <p className="flex-1 text-center text-6xl p-2" aria-label={"Sticker "+text}>{text}</p> : <textarea aria-label="Nội dung ghi chú" value={text} disabled={!!pending} maxLength={10000} placeholder="Viết gì đó..."
            className="flex-1 w-full p-4 pt-1 [font-family:var(--font-display)] text-lg leading-relaxed bg-transparent resize-none border-none text-gray-800"
            onPointerDown={e=>e.stopPropagation()} onChange={e=>change({...item,payload:{text:e.target.value}})} />)}
          {item.type==="link" && <a href={String(item.payload.url)} target="_blank" rel="noopener noreferrer" className="p-4 underline text-[var(--forest)]">{String(item.payload.title||item.payload.url)}</a>}
          {item.type!=="note" && item.type!=="link" && <p className="p-4 text-[var(--forest)]">{item.type==="doodle" ? "Bản vẽ đã lưu" : "Tệp riêng tư đã lưu"}</p>}
          {item.type==="note" && <div className="flex flex-wrap gap-2 p-2 text-sm text-gray-800">
            <button disabled={!!pending} aria-label={sticker ? "Xoay sticker" : "Xoay ghi chú"} className="min-h-11 min-w-11 rounded bg-black/10 p-2" onPointerDown={e=>pointerDown(e,item,"rotate")} onClick={()=>{if(!rotated.current)change({...item,rotation:angle(item.rotation+15)});rotated.current=false;}}>↻</button>
            <button disabled={!!pending} className="min-h-11 rounded bg-[var(--forest)] p-2 text-[var(--paper)]" onClick={()=>void save(item)}>{sticker ? "Lưu sticker" : "Lưu ghi chú"}</button>
            {pending && <span>{pending.state==="conflict" ? "Có hai bản" : "Chờ xác nhận lưu"}</span>}
            {pending?.conflict && !pending.resolutionOperationId && <>
              <p className="w-full break-words">Bản của Nhà: {remoteText(pending.conflict.remote)}</p>
              <button className="underline min-h-11" onClick={()=>void resolve(pending,false)}>Giữ bản của Nhà</button>
              <button className="underline min-h-11" onClick={()=>void resolve(pending,true)}>Dùng bản đang viết</button>
            </>}
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
