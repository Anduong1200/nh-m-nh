"use client";

import React, { ReactNode } from "react";
import { MascotOwl, MascotRabbit } from "./mascots";

export function HomeInteractiveRoom({
  statusesNode,
  knocksNode,
  openBoard,
  openPresence,
  openSettings,
  openKnock,
}: {
  statusesNode?: ReactNode;
  knocksNode?: ReactNode;
  openBoard: () => void;
  openPresence: () => void;
  openSettings: () => void;
  openKnock: () => void;
}) {
  return (
    <div className="relative w-full max-w-5xl mx-auto aspect-[16/9] min-h-[600px] bg-[var(--paper)] rounded-2xl shadow-sm border border-[var(--line)] overflow-hidden flex flex-col sm:flex-row transition-colors duration-500">
      
      {/* Background pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(var(--forest) 1px, transparent 1px)",
          backgroundSize: "24px 24px"
        }}
      />
      
      {/* Left Column: Window & Fridge */}
      <div className="flex-1 flex flex-col p-6 gap-6 z-10 border-r border-[var(--line)]">
        
        {/* Window */}
        <div className="relative h-48 w-full rounded-t-full border-8 border-[var(--scene-wood)] overflow-hidden bg-gradient-to-b from-[var(--scene-sky-start)] to-[var(--scene-sky-end)] shadow-inner transition-colors duration-1000">
          <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-full blur-md" />
          <div className="absolute bottom-0 w-full h-16 bg-[var(--scene-hill-front)] rounded-t-[100%]" />
          <div className="absolute bottom-4 -right-4 w-3/4 h-20 bg-[var(--scene-hill-back)] rounded-t-[100%] opacity-80" />
        </div>

        {/* Fridge (Knock Shelf) */}
        <div className="relative flex-1 bg-[var(--scene-cream)] border-2 border-[var(--line)] rounded-lg shadow-sm p-4 overflow-y-auto">
          <div className="absolute top-2 right-2 flex gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] opacity-50" />
          </div>
          <h3 className="[font-family:var(--font-display)] text-lg text-[var(--forest)] mb-4">Góc gõ cửa</h3>
          <div id="knock-container" className="flex flex-col gap-3">
            {knocksNode}
          </div>
          <button 
            onClick={openKnock}
            className="mt-6 w-full py-2 border-2 border-dashed border-[var(--forest)] text-[var(--forest)] rounded-md hover:bg-[var(--forest)] hover:text-white transition-colors"
          >
            + Gõ cửa một chút
          </button>
        </div>
      </div>

      {/* Right Column: Board & Desk */}
      <div className="flex-[1.5] flex flex-col relative z-10 p-6 gap-6">
        
        {/* Board */}
        <div 
          onClick={openBoard}
          className="relative flex-1 bg-[var(--scene-board)] rounded-lg border-4 border-[var(--scene-wood)] shadow-md cursor-pointer group overflow-hidden"
        >
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="bg-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm text-[var(--forest)]">
              Mở Bảng Chung
            </span>
          </div>
          <div className="absolute top-4 left-4 w-3 h-3 rounded-full bg-red-400 shadow-sm" />
          <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-red-400 shadow-sm" />
          
          {/* Decorative polaroids on board */}
          <div className="absolute top-12 right-12 w-24 h-24 bg-white p-2 shadow-sm rotate-6">
            <div className="w-full h-16 bg-gray-200" />
          </div>
          <div className="absolute bottom-12 left-12 w-20 h-20 bg-[#FFF9C4] p-3 shadow-sm -rotate-3 [font-family:var(--font-display)] text-sm text-gray-800">
            Note nhỏ...
          </div>
        </div>

        {/* Drawer / Desk (Presence & Statuses) */}
        <div className="relative h-48 bg-[var(--paper-raised)] border-t-2 border-[var(--scene-wood)] p-4 flex gap-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="absolute -top-12 left-8">
            <MascotRabbit />
          </div>
          <div className="absolute -top-14 right-8">
            <MascotOwl />
          </div>
          
          <div className="w-full h-full flex items-center justify-between px-4">
            <div id="presence-container" className="flex-1 flex gap-4 overflow-x-auto">
              {statusesNode}
            </div>
            
            <div className="flex flex-col gap-2 ml-4">
              <button 
                onClick={openPresence}
                className="w-12 h-12 rounded-full bg-[var(--forest)] text-white flex items-center justify-center shadow-md hover:-translate-y-1 transition-transform"
                title="Trạng thái của mình"
              >
                ☀
              </button>
              <button 
                onClick={openSettings}
                className="w-12 h-12 rounded-full bg-[var(--paper)] border border-[var(--line)] text-[var(--forest)] flex items-center justify-center shadow-sm hover:-translate-y-1 transition-transform"
                title="Cài đặt"
              >
                ⚙
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
