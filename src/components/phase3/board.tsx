"use client";

import { useState, useRef } from "react";
import type { BoardItem } from "@/modules/board/model";
import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import { appendBoardObjectAction, updateBoardObjectAction } from "@/modules/board/actions";

type BoardProps = {
  houseId: string;
  accountId: string;
  initialItems: BoardItem[];
  onClose: () => void;
};

type Point = { x: number; y: number };

type DragState = {
  id: string;
  type: "move" | "rotate";
  startPos: Point;
  startMouse: Point;
  startRotation: number;
  centerX: number;
  centerY: number;
};

export function Board({ houseId, accountId, initialItems, onClose }: BoardProps) {
  const [items, setItems] = useState<BoardItem[]>(initialItems);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Z-index management: track the highest zIndex locally
  const maxZIndex = items.reduce((max, item) => Math.max(max, item.zIndex), 0);

  const getCardCenter = (cardElement: HTMLElement) => {
    const rect = cardElement.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const handlePointerDown = (e: React.PointerEvent, item: BoardItem, type: "move" | "rotate") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    let center = { x: 0, y: 0 };
    if (type === "rotate" && e.currentTarget.parentElement) {
      center = getCardCenter(e.currentTarget.parentElement);
    }

    // Bring to front
    const newZIndex = maxZIndex + 1;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, zIndex: newZIndex } : i));

    setDragging({
      id: item.id,
      type,
      startPos: { x: item.x, y: item.y },
      startMouse: { x: e.clientX, y: e.clientY },
      startRotation: item.rotation,
      centerX: center.x,
      centerY: center.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    
    if (dragging.type === "move") {
      const dx = e.clientX - dragging.startMouse.x;
      const dy = e.clientY - dragging.startMouse.y;
      setItems(prev => prev.map(item => 
        item.id === dragging.id 
          ? { ...item, x: dragging.startPos.x + dx, y: dragging.startPos.y + dy }
          : item
      ));
    } else if (dragging.type === "rotate") {
      const startAngle = Math.atan2(dragging.startMouse.y - dragging.centerY, dragging.startMouse.x - dragging.centerX);
      const currentAngle = Math.atan2(e.clientY - dragging.centerY, e.clientX - dragging.centerX);
      const angleDiff = (currentAngle - startAngle) * (180 / Math.PI);
      
      setItems(prev => prev.map(item => 
        item.id === dragging.id 
          ? { ...item, rotation: dragging.startRotation + angleDiff }
          : item
      ));
    }
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const draggedItem = items.find(i => i.id === dragging.id);
    setDragging(null);
    
    if (draggedItem) {
      const store = new AccountOfflineStore(accountId);
      const updateData = { 
        id: draggedItem.id, 
        expectedVersion: draggedItem.version, 
        x: draggedItem.x, 
        y: draggedItem.y,
        rotation: draggedItem.rotation,
        zIndex: draggedItem.zIndex
      };
      
      try {
        await store.enqueue({
          houseId,
          schemaVersion: 1,
          entityId: draggedItem.id,
          entity: "note",
          mutation: "update",
          baseVersion: draggedItem.version,
          payload: updateData as any
        });
        
        const result = await updateBoardObjectAction(updateData as any);
        if (result.item) {
          setItems(prev => prev.map(item => item.id === result.item!.id ? result.item! : item));
        }
      } catch (err) {
        console.error("Failed to enqueue board item update", err);
      }
    }
  };

  const addNote = async () => {
    const id = crypto.randomUUID();
    const newNote = {
      id,
      houseId,
      createdBy: accountId,
      type: "note" as const,
      payload: { text: "Ghi chú mới" },
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
      rotation: Math.random() * 10 - 5,
      zIndex: maxZIndex + 1,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    
    setItems(prev => [...prev, newNote]);
    
    try {
      const store = new AccountOfflineStore(accountId);
      await store.saveDraft({
        houseId,
        schemaVersion: 1,
        id,
        kind: "note",
        payload: { text: "Ghi chú mới" },
        expectedVersion: null
      });
      await store.enqueue({
        houseId,
        schemaVersion: 1,
        entityId: id,
        entity: "note",
        mutation: "append",
        payload: newNote as any
      });
      const result = await appendBoardObjectAction(newNote as any);
      if (result.item) {
        setItems(prev => prev.map(item => item.id === id ? result.item! : item));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div 
      ref={boardRef}
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
          className="px-6 h-12 flex items-center justify-center bg-[var(--forest)] text-[var(--paper)] rounded-full text-sm font-bold shadow-sm hover:scale-105 transition-transform"
        >
          + Thêm ghi chú
        </button>
      </div>

      <div className="w-full h-full relative" style={{ touchAction: "none" }}>
        {items.map(item => {
          const isDragging = dragging?.id === item.id;
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
              <div 
                onPointerDown={(e) => handlePointerDown(e, item, "move")}
                className="w-full h-8 cursor-grab active:cursor-grabbing bg-black/5"
              />

              {/* Note Content */}
              {item.type === "note" && (
                <textarea 
                  className="flex-1 w-full p-4 pt-1 [font-family:var(--font-display)] text-lg leading-relaxed bg-transparent resize-none border-none outline-none overflow-hidden text-gray-800"
                  defaultValue={(item.payload?.text as string) || ""}
                  placeholder="Viết gì đó..."
                  onPointerDown={(e) => e.stopPropagation()} // Let user click to edit text without dragging
                  onBlur={async (e) => {
                    const newText = e.target.value;
                    if (newText !== item.payload?.text) {
                      const updateData = { 
                        id: item.id, 
                        expectedVersion: item.version,
                        payload: { ...item.payload, text: newText }
                      };
                      
                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, payload: updateData.payload } : i));
                      
                      try {
                        const store = new AccountOfflineStore(accountId);
                        await store.saveDraft({
                          houseId,
                          schemaVersion: 1,
                          id: item.id,
                          kind: "note",
                          payload: updateData.payload as JsonValue,
                          expectedVersion: item.version
                        });
                        await store.enqueue({
                          houseId,
                          schemaVersion: 1,
                          entityId: item.id,
                          entity: "note",
                          mutation: "update",
                          baseVersion: item.version,
                          payload: updateData as any
                        });
                        
                        const result = await updateBoardObjectAction(updateData as any);
                        if (result.item) {
                          setItems(prev => prev.map(i => i.id === result.item!.id ? result.item! : i));
                        }
                      } catch (err) {
                        console.error("Failed to update note text", err);
                      }
                    }
                  }}
                />
              )}

              {/* Rotate Handle */}
              <div 
                onPointerDown={(e) => handlePointerDown(e, item, "rotate")}
                className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/10 flex items-center justify-center cursor-alias opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/20"
                title="Xoay"
              >
                ↻
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
