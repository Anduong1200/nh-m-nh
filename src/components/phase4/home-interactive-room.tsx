"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { MascotOwl, MascotRabbit } from "./mascots";

export function HomeInteractiveRoom({
  statusesNode,
  knocksNode,
  navigationNode,
  openBoard,
  openPresence,
  openSettings,
  openKnock,
}: {
  statusesNode?: ReactNode;
  knocksNode?: ReactNode;
  navigationNode?: ReactNode;
  openBoard: () => void;
  openPresence: MouseEventHandler<HTMLButtonElement>;
  openSettings: MouseEventHandler<HTMLButtonElement>;
  openKnock: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className="home-interactive-room relative w-full max-w-5xl mx-auto bg-[var(--paper)] rounded-2xl shadow-sm border border-[var(--line)] overflow-hidden flex flex-col lg:flex-row transition-colors duration-500">
      
      {/* Background pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(var(--forest) 1px, transparent 1px)",
          backgroundSize: "24px 24px"
        }}
      />
      
      {/* Left Column: Window & Fridge */}
      <div className="min-w-0 flex-1 flex flex-col p-4 sm:p-6 gap-6 z-10 lg:border-r border-[var(--line)]">
        
        {/* Window */}
        <div aria-hidden="true" className="relative h-48 w-full rounded-t-full border-8 border-[var(--scene-wood)] overflow-hidden bg-gradient-to-b from-[var(--scene-sky-start)] to-[var(--scene-sky-end)] shadow-inner transition-colors duration-1000">
          <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-full blur-md" />
          <div className="absolute bottom-0 w-full h-16 bg-[var(--scene-hill-front)] rounded-t-[100%]" />
          <div className="absolute bottom-4 -right-4 w-3/4 h-20 bg-[var(--scene-hill-back)] rounded-t-[100%] opacity-80" />
        </div>

        {/* Fridge (Knock Shelf) */}
        <div className="relative flex-1 bg-[var(--paper-raised)] border-2 border-[var(--line)] rounded-lg shadow-sm p-4">
          <div className="absolute top-2 right-2 flex gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] opacity-50" />
          </div>
          <h3 className="[font-family:var(--font-display)] text-lg text-[var(--forest)] mb-4">Góc gõ cửa</h3>
          <div id="knock-container" className="flex flex-col gap-3">
            {knocksNode}
          </div>
          <button 
            type="button"
            aria-label="Gõ cửa một chút"
            data-room-control
            onClick={openKnock}
            className="mt-6 min-h-11 w-full py-2 border-2 border-dashed border-[var(--forest)] text-[var(--forest)] rounded-md hover:bg-[var(--forest)] hover:text-[var(--paper)] transition-colors"
          >
            + Gõ cửa một chút
          </button>
        </div>
      </div>

      {/* Right Column: Board & Desk */}
      <div className="min-w-0 flex-[1.5] flex flex-col relative z-10 p-4 sm:p-6 gap-6">
        
        {/* Board */}
        <button
          type="button"
          aria-label="Mở Bảng Chung"
          data-room-control
          onClick={openBoard}
          className="relative min-h-64 flex-1 bg-[var(--scene-board)] rounded-lg border-4 border-[var(--scene-wood)] shadow-md cursor-pointer group overflow-hidden"
        >
          <span className="absolute inset-0 bg-black/5 flex items-center justify-center">
            <span className="relative z-10 bg-[var(--paper-raised)] px-4 py-2 rounded-full text-sm font-semibold shadow-sm text-[var(--forest)]">
              Mở Bảng Chung
            </span>
          </span>
          <span aria-hidden="true" className="absolute top-4 left-4 w-3 h-3 rounded-full bg-red-400 shadow-sm" />
          <span aria-hidden="true" className="absolute top-4 right-4 w-3 h-3 rounded-full bg-red-400 shadow-sm" />
          
          {/* Decorative polaroids on board */}
          <span aria-hidden="true" className="absolute top-6 right-6 w-20 h-20 bg-white p-2 shadow-sm rotate-6">
            <span className="block w-full h-12 bg-gray-200" />
          </span>
          <span aria-hidden="true" className="absolute bottom-6 left-6 w-16 h-16 bg-[#FFF9C4] p-3 shadow-sm -rotate-3" />
        </button>

        {navigationNode}
        {/* Drawer / Desk (Presence & Statuses) */}
        <div className="relative bg-[var(--paper-raised)] border-t-2 border-[var(--scene-wood)] p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div aria-hidden="true" className="home-room-mascots flex items-end justify-between px-2 mb-4">
            <MascotRabbit />
            <MascotOwl />
          </div>
          
          <div className="w-full min-w-0 flex flex-col gap-5">
            <div id="presence-container" data-room-presence className="min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 pt-2">
              {statusesNode}
            </div>
            
            <div className="flex flex-wrap justify-end gap-2">
              <button 
                type="button"
                aria-label="Trạng thái của mình"
                data-room-control
                onClick={openPresence}
                className="w-12 h-12 rounded-full bg-[var(--forest)] text-[var(--paper)] flex items-center justify-center shadow-md hover:-translate-y-1 transition-transform"
                title="Trạng thái của mình"
              >
                ☀
              </button>
              <button 
                type="button"
                aria-label="Nhịp thông báo"
                data-room-control
                onClick={openSettings}
                className="w-12 h-12 rounded-full bg-[var(--paper)] border border-[var(--line)] text-[var(--forest)] flex items-center justify-center shadow-sm hover:-translate-y-1 transition-transform"
                title="Nhịp thông báo"
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
