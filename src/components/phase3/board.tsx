"use client";

import { useState } from "react";
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

export function Board({ houseId, accountId, initialItems, onClose }: BoardProps) {
  const [items, setItems] = useState<BoardItem[]>(initialItems);
  const [dragging, setDragging] = useState<{ id: string; startPos: Point; startMouse: Point } | null>(null);
  
  // Manage dragging locally
  const handlePointerDown = (e: React.PointerEvent, item: BoardItem) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({
      id: item.id,
      startPos: { x: item.x, y: item.y },
      startMouse: { x: e.clientX, y: e.clientY }
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startMouse.x;
    const dy = e.clientY - dragging.startMouse.y;
    setItems(prev => prev.map(item => 
      item.id === dragging.id 
        ? { ...item, x: dragging.startPos.x + dx, y: dragging.startPos.y + dy }
        : item
    ));
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const draggedItem = items.find(i => i.id === dragging.id);
    setDragging(null);
    
    if (draggedItem) {
      // Save offline draft or enqueue update
      const store = new AccountOfflineStore(accountId);
      const updateData = { 
        id: draggedItem.id, 
        expectedVersion: draggedItem.version, 
        x: draggedItem.x, 
        y: draggedItem.y 
      };
      
      try {
        await store.enqueue({
          houseId,
          schemaVersion: 1,
          entityId: draggedItem.id,
          entity: "note",
          mutation: "update",
          baseVersion: draggedItem.version,
          payload: updateData
        });
        
        // Optimistically fire the API
        const result = await updateBoardObjectAction(updateData);
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
      x: 100,
      y: 100,
      rotation: Math.random() * 10 - 5,
      zIndex: items.length,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    
    // Optimistically update
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
        payload: {
          id, type: "note", payload: { text: "Ghi chú mới" }, x: 100, y: 100, rotation: newNote.rotation, zIndex: newNote.zIndex
        }
      });
      const result = await appendBoardObjectAction({
        id, type: "note", payload: { text: "Ghi chú mới" }, x: 100, y: 100, rotation: newNote.rotation, zIndex: newNote.zIndex
      });
      if (result.item) {
        setItems(prev => prev.map(item => item.id === id ? result.item! : item));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#F4F1EA] overflow-hidden select-none touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-white rounded-full shadow-sm text-sm font-medium hover:bg-gray-50"
        >
          ← Trở về phòng
        </button>
        <button 
          onClick={addNote}
          className="px-4 py-2 bg-[#8C7A6B] text-white rounded-full shadow-sm text-sm font-medium hover:bg-[#7A6A5D]"
        >
          + Thêm ghi chú
        </button>
      </div>

      <div className="w-full h-full relative" style={{ touchAction: "none" }}>
        {items.map(item => (
          <div
            key={item.id}
            onPointerDown={(e) => handlePointerDown(e, item)}
            className="absolute shadow-sm cursor-grab active:cursor-grabbing border-2 border-dashed border-transparent hover:border-gray-300 p-2"
            style={{
              transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
              zIndex: dragging?.id === item.id ? 999 : item.zIndex,
              backgroundColor: item.type === "note" ? "#FFF9C4" : "#E0F7FA",
            }}
          >
            {item.type === "note" && (
              <textarea 
                className="w-48 h-48 p-4 font-handwriting text-lg leading-relaxed bg-transparent resize-none border-none outline-none overflow-hidden"
                defaultValue={(item.payload?.text as string) || ""}
                placeholder="Ghi chú trống..."
                onPointerDown={(e) => e.stopPropagation()}
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
                        payload: updateData as JsonValue
                      });
                      
                      const result = await updateBoardObjectAction(updateData);
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
            {item.type === "link" && (
              <div className="w-48 p-4 bg-white rounded shadow-sm border border-gray-100">
                <a href={item.payload?.url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  {(item.payload?.title as string) || "Liên kết"}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
