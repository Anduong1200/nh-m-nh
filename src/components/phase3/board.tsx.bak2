"use client";
import { useState } from "react";
import type { BoardItem } from "@/modules/board/model";
import type { JsonValue } from "@/lib/offline/store";
import { useBoard } from "./use-board";
type BoardProps = { houseId: string; accountId: string; initialItems: BoardItem[]; onClose: () => void };
type DragState = { id: string; startX: number; startY: number; x: number; y: number };
const clamp = (n: number) => Math.max(-10000, Math.min(10000,n));
const angle = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
function remoteText(value: JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload)) return String(value.payload.text ?? "");
  return "Nội dung đã đổi";
}
export function Board({ houseId, accountId, initialItems, onClose }: BoardProps) {
  const { items, operations, message, ready, change, add: addNote, save, resolve, refresh, exportLocal } = useBoard(accountId, houseId, initialItems);
  const [dragging,setDragging] = useState<DragState | null>(null);
  const handlePointerDown = (e: React.PointerEvent, item: BoardItem, type: "move" | "rotate") => {
    if (type !== "move" || item.type !== "note" || operations.some(o => o.entityId === item.id)) return;
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({ id: item.id, startX: e.clientX, startY: e.clientY, x: item.x, y: item.y });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const item = items.find(i => i.id === dragging?.id);
    if (dragging && item) change({ ...item, x: clamp(dragging.x + e.clientX - dragging.startX), y: clamp(dragging.y + e.clientY - dragging.startY) });
  };
  const handlePointerUp = () => setDragging(null);
  return (
    <div 
            className="fixed inset-0 z-50 overflow-hidden select-none touch-none"
      style={{
        backgroundColor: "var(--scene-board)",
        backgroundImage: "radial-gradient(circle, var(--scene-wood) 1px, transparent 1px)",
        backgroundSize: "20px 20px"
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Decorative Frame */}
      <div className="absolute inset-0 pointer-events-none border-[16px] border-[var(--scene-wood)] opacity-80 mix-blend-multiply" />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />

      {/* Toolbar */}
      <div className="absolute top-6 left-6 z-[9999] flex gap-3 shadow-xl rounded-full bg-white/10 backdrop-blur-md p-2 border border-white/20">
        <button 
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center bg-white rounded-full text-xl shadow-sm hover:scale-105 transition-transform"
          title="Trở về"
        >
          ✕
        </button>
        <button 
          onClick={addNote}
          disabled={!ready}
          className="px-6 h-12 flex items-center justify-center bg-[var(--forest)] text-[var(--paper)] rounded-full text-sm font-bold shadow-sm hover:scale-105 transition-transform"
        >
          + Thêm ghi chú
        </button>
      </div>

      <p role="status" className="absolute top-24 left-6 right-6 z-[1000001] rounded bg-[var(--paper)] p-2 text-sm text-[var(--forest)]">{message} <button className="underline" onClick={() => void refresh()}>Thử đồng bộ</button> · <button className="underline" onClick={() => void exportLocal()}>Xuất bản nháp</button></p>
      <div className="w-full h-full relative" style={{ touchAction: "none" }}>
        {items.map(item => {
          const isDragging = dragging?.id === item.id;
          const pending = operations.find(o => o.entityId === item.id);
          return (
            <div
              key={item.id}
              className={`absolute flex flex-col group transition-shadow duration-200 ${
                isDragging ? "shadow-2xl scale-105" : "shadow-md hover:shadow-lg"
              }`}
              style={{
                transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
                zIndex: item.zIndex,
                width: "220px",
                minHeight: "220px",
                backgroundColor: item.type === "note" ? "#fef3c7" : "#e0f2fe", // Amber 100 or Light Blue
                borderRadius: "2px 8px 2px 8px", // Hand-cut paper feel
              }}
            >
              {/* Thumbtack / Pin */}
              <div 
                className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 z-10 pointer-events-none"
                style={{
                  background: "radial-gradient(circle at 30% 30%, #ef4444, #991b1b)",
                  borderRadius: "50%",
                  boxShadow: "2px 4px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(0,0,0,0.3)"
                }}
              />
              {/* Pin shadow */}
              <div 
                className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 z-0 pointer-events-none rounded-full bg-black/20 translate-y-1 translate-x-1 blur-[2px]"
              />

              {/* Drag Handle Area (top bar of note) */}
              <button type="button" aria-label="Di chuyển ghi chú" disabled={!!pending}
                onKeyDown={(e) => { const direction: number[] | undefined = { ArrowLeft: [-10,0], ArrowRight: [10,0], ArrowUp: [0,-10], ArrowDown: [0,10] }[e.key]; if (direction) { e.preventDefault(); change({ ...item, x: clamp(item.x + (direction[0] ?? 0)), y: clamp(item.y + (direction[1] ?? 0)) }); } }}
                onPointerDown={(e) => handlePointerDown(e, item, "move")}
                className="w-full h-8 cursor-grab active:cursor-grabbing bg-black/5"
              />

              {/* Note Content */}
              {item.type === "note" && (
                <textarea 
                  className="flex-1 w-full p-4 pt-1 [font-family:var(--font-display)] text-lg leading-relaxed bg-transparent resize-none border-none outline-none overflow-hidden text-gray-800"
                  aria-label="Nội dung ghi chú"
                  value={typeof item.payload.text === "string" ? item.payload.text : ""}
                  disabled={!!pending}
                  maxLength={10000}
                  placeholder="Viết gì đó..."
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => change({ ...item, payload: { text: e.target.value } })}
                />
              )}

              {item.type === "link" && <a href={String(item.payload.url)} target="_blank" rel="noopener noreferrer" className="p-4 underline text-[var(--forest)]">{String(item.payload.title || item.payload.url)}</a>}
              {item.type !== "note" && item.type !== "link" && <p className="p-4 text-[var(--forest)]">{item.type === "doodle" ? "Bản vẽ đã lưu" : "Tệp riêng tư đã lưu"}</p>}
              {item.type === "note" && <div className="flex flex-wrap gap-2 p-2 text-sm text-gray-800">
                <button disabled={!!pending} className="rounded bg-black/10 p-2" aria-label="Xoay ghi chú" onClick={() => change({ ...item, rotation: angle(item.rotation + 15) })}>↻</button>
                <button disabled={!!pending} className="rounded bg-[var(--forest)] p-2 text-[var(--paper)]" onClick={() => void save(item)}>Lưu ghi chú</button>
                {pending && <span>{pending.state === "conflict" ? "Có hai bản" : "Chờ xác nhận lưu"}</span>}
                {pending?.conflict && !pending.resolutionOperationId && <>
                  <p className="w-full break-words">Bản của Nhà: {remoteText(pending.conflict.remote)}</p>
                  <button className="underline" onClick={() => void resolve(pending, false)}>Giữ bản của Nhà</button>
                  <button className="underline" onClick={() => void resolve(pending, true)}>Dùng bản đang viết</button>
                </>}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
