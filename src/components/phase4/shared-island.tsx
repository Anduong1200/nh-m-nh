"use client";

import React, { useState, useRef, useEffect } from "react";
import { MascotRabbit, MascotOwl } from "./mascots";

/* ───────────────────────── Types ───────────────────────── */

export type MemoryPoint = {
  id: string;
  label: string;
  x: number;          // % from left
  y: number;          // % from top
  icon: string;
  date?: string;
  unlocked: boolean;
};

export type IslandArea = "cabin" | "garden" | "campfire" | "lookout" | "dock";

type IslandProps = {
  memories?: MemoryPoint[];
  onAreaClick?: (area: IslandArea) => void;
  onMemoryClick?: (memory: MemoryPoint) => void;
  onClose: () => void;
};

/* ───────────────────── Island Component ────────────────── */

export function SharedIsland({ memories = [], onAreaClick, onMemoryClick, onClose }: IslandProps) {
  const [hoveredArea, setHoveredArea] = useState<IslandArea | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryPoint | null>(null);
  const [easterEggCount, setEasterEggCount] = useState(0);
  const [showScoutSign, setShowScoutSign] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // Scout easter egg: tap the lookout flag 3 times
  useEffect(() => {
    if (easterEggCount >= 3) {
      setShowScoutSign(true);
      const timer = setTimeout(() => { setShowScoutSign(false); setEasterEggCount(0); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [easterEggCount]);

  const handleAreaHover = (area: IslandArea | null) => setHoveredArea(area);

  const handleAreaClick = (area: IslandArea) => {
    if (area === "lookout") setEasterEggCount(c => c + 1);
    onAreaClick?.(area);
  };

  const handleMemoryClick = (mem: MemoryPoint) => {
    setSelectedMemory(mem);
    onMemoryClick?.(mem);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none" style={{ background: "linear-gradient(180deg, var(--scene-sky-start) 0%, var(--scene-sky-end) 40%, #7ab5c5 60%, #4a9ab5 100%)" }}>

      {/* Sky decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Clouds */}
        <div className="absolute top-[8%] left-[10%] w-32 h-12 bg-white/30 rounded-full blur-sm" style={{ animation: "island-cloud-drift 60s linear infinite" }} />
        <div className="absolute top-[12%] left-[50%] w-40 h-14 bg-white/20 rounded-full blur-sm" style={{ animation: "island-cloud-drift 80s linear infinite reverse" }} />
        <div className="absolute top-[5%] right-[15%] w-24 h-10 bg-white/25 rounded-full blur-sm" style={{ animation: "island-cloud-drift 70s linear infinite" }} />
        {/* Birds */}
        <svg className="absolute top-[15%] left-[30%] w-8 h-8 opacity-40" viewBox="0 0 24 24" style={{ animation: "island-bird-fly 12s ease-in-out infinite" }}>
          <path d="M2 12 Q6 6, 12 10 Q18 6, 22 12" fill="none" stroke="var(--scene-outline)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Water / Ocean */}
      <div className="absolute bottom-0 left-0 right-0 h-[35%] pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 1200 300" preserveAspectRatio="none">
          <defs>
            <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6db3c9" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#3a7d94" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path d="M0 80 Q150 60, 300 80 T600 80 T900 80 T1200 80 V300 H0Z" fill="url(#water-grad)">
            <animate attributeName="d" dur="6s" repeatCount="indefinite"
              values="M0 80 Q150 60,300 80 T600 80 T900 80 T1200 80 V300 H0Z;
                      M0 80 Q150 100,300 80 T600 80 T900 80 T1200 80 V300 H0Z;
                      M0 80 Q150 60,300 80 T600 80 T900 80 T1200 80 V300 H0Z" />
          </path>
          {/* Light sparkles on water */}
          <circle cx="200" cy="150" r="2" fill="white" opacity="0.4">
            <animate attributeName="opacity" dur="3s" repeatCount="indefinite" values="0.1;0.6;0.1" />
          </circle>
          <circle cx="800" cy="120" r="1.5" fill="white" opacity="0.3">
            <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="0.1;0.5;0.1" />
          </circle>
          <circle cx="500" cy="180" r="2" fill="white" opacity="0.35">
            <animate attributeName="opacity" dur="2.5s" repeatCount="indefinite" values="0.1;0.7;0.1" />
          </circle>
        </svg>
      </div>

      {/* ── THE ISLAND ── */}
      <div ref={mapRef} className="absolute inset-0 flex items-center justify-center" style={{ touchAction: "manipulation" }}>
        <div className="relative w-[90vw] max-w-[900px] aspect-[4/3]">

          {/* Island landmass SVG */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 900 675" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="island-grad" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="var(--scene-hill-back)" />
                <stop offset="70%" stopColor="var(--scene-hill-front)" />
                <stop offset="100%" stopColor="#3a5f3c" />
              </radialGradient>
              <filter id="island-shadow">
                <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#00000030" />
              </filter>
            </defs>

            {/* Main land shape */}
            <path
              d="M150 580 Q80 500, 120 400 Q140 320, 200 280 Q260 230, 320 220 Q380 200, 450 190 Q520 180, 580 200 Q660 230, 720 280 Q780 340, 800 420 Q820 500, 760 580 Q680 640, 550 650 Q420 670, 300 650 Q200 640, 150 580Z"
              fill="url(#island-grad)"
              filter="url(#island-shadow)"
            />
            {/* Beach / sand edge */}
            <path
              d="M145 585 Q80 510, 115 405 Q130 340, 195 285 L200 295 Q140 335, 125 410 Q90 510, 155 590Z"
              fill="#d4b98a" opacity="0.6"
            />
            <path
              d="M755 585 Q815 510, 795 420 Q785 350, 725 285 L720 295 Q775 345, 790 425 Q810 505, 750 590Z"
              fill="#d4b98a" opacity="0.6"
            />
            <path
              d="M150 585 Q200 640, 300 650 Q420 670, 550 650 Q680 640, 760 585 Q740 620, 680 650 Q580 680, 450 685 Q320 680, 220 650 Q160 620, 150 585Z"
              fill="#d4b98a" opacity="0.7"
            />

            {/* Grass texture dots */}
            {[
              [280, 350], [320, 310], [400, 280], [500, 270], [600, 300], [650, 360],
              [350, 400], [450, 350], [550, 380], [300, 500], [500, 500], [650, 480],
              [400, 450], [250, 420], [580, 440], [420, 530], [340, 560], [560, 550],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={Math.random() * 2 + 1.5} fill="#4a7b52" opacity={0.3 + Math.random() * 0.3} />
            ))}

            {/* ─── CABIN (top center) ─── */}
            <g
              className="cursor-pointer"
              onPointerEnter={() => handleAreaHover("cabin")}
              onPointerLeave={() => handleAreaHover(null)}
              onClick={() => handleAreaClick("cabin")}
              style={{ transition: "transform 0.2s", transform: hoveredArea === "cabin" ? "scale(1.05)" : "scale(1)", transformOrigin: "450px 260px" }}
            >
              {/* Cabin body */}
              <rect x="410" y="250" width="80" height="55" rx="3" fill="var(--scene-wood)" />
              {/* Roof */}
              <polygon points="400,252 450,220 500,252" fill="#7a5a38" />
              {/* Door */}
              <rect x="438" y="275" width="24" height="30" rx="2" fill="#5a3f28" />
              {/* Window */}
              <rect x="420" y="260" width="12" height="12" rx="1" fill="#ffe9a0" opacity="0.8" />
              <rect x="468" y="260" width="12" height="12" rx="1" fill="#ffe9a0" opacity="0.8" />
              {/* Chimney */}
              <rect x="470" y="228" width="10" height="18" fill="#8a6a48" />
              {/* Smoke */}
              <circle cx="475" cy="218" r="4" fill="white" opacity="0.3">
                <animate attributeName="cy" dur="4s" repeatCount="indefinite" values="218;200;218" />
                <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="0.3;0.1;0.3" />
              </circle>
              <circle cx="478" cy="210" r="3" fill="white" opacity="0.2">
                <animate attributeName="cy" dur="5s" repeatCount="indefinite" values="210;190;210" />
                <animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0.2;0.05;0.2" />
              </circle>
              {/* Label */}
              <text x="450" y="325" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity={hoveredArea === "cabin" ? 1 : 0.7}>Nhà nhỏ</text>
            </g>

            {/* ─── GARDEN (left area) ─── */}
            <g
              className="cursor-pointer"
              onPointerEnter={() => handleAreaHover("garden")}
              onPointerLeave={() => handleAreaHover(null)}
              onClick={() => handleAreaClick("garden")}
              style={{ transition: "transform 0.2s", transform: hoveredArea === "garden" ? "scale(1.05)" : "scale(1)", transformOrigin: "250px 440px" }}
            >
              {/* Fence */}
              <line x1="200" y1="420" x2="300" y2="420" stroke="#b09060" strokeWidth="2" />
              <line x1="210" y1="410" x2="210" y2="430" stroke="#b09060" strokeWidth="2" />
              <line x1="250" y1="410" x2="250" y2="430" stroke="#b09060" strokeWidth="2" />
              <line x1="290" y1="410" x2="290" y2="430" stroke="#b09060" strokeWidth="2" />
              {/* Flower plots */}
              <circle cx="220" cy="450" r="6" fill="#e8735a" opacity="0.8" />
              <circle cx="240" cy="445" r="5" fill="#f0b866" opacity="0.8" />
              <circle cx="260" cy="452" r="7" fill="#d86ca8" opacity="0.8" />
              <circle cx="280" cy="448" r="5" fill="#e8735a" opacity="0.8" />
              {/* Stems */}
              <line x1="220" y1="456" x2="220" y2="470" stroke="#4a7b52" strokeWidth="1.5" />
              <line x1="240" y1="450" x2="240" y2="468" stroke="#4a7b52" strokeWidth="1.5" />
              <line x1="260" y1="459" x2="260" y2="475" stroke="#4a7b52" strokeWidth="1.5" />
              <line x1="280" y1="453" x2="280" y2="468" stroke="#4a7b52" strokeWidth="1.5" />
              {/* Leaves */}
              <ellipse cx="223" cy="465" rx="4" ry="2" fill="#5a9a52" />
              <ellipse cx="257" cy="470" rx="4" ry="2" fill="#5a9a52" />
              <text x="250" y="495" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity={hoveredArea === "garden" ? 1 : 0.7}>Vườn nhỏ</text>
            </g>

            {/* ─── CAMPFIRE (center-right) ─── */}
            <g
              className="cursor-pointer"
              onPointerEnter={() => handleAreaHover("campfire")}
              onPointerLeave={() => handleAreaHover(null)}
              onClick={() => handleAreaClick("campfire")}
              style={{ transition: "transform 0.2s", transform: hoveredArea === "campfire" ? "scale(1.05)" : "scale(1)", transformOrigin: "620px 430px" }}
            >
              {/* Log circle */}
              <ellipse cx="620" cy="445" rx="30" ry="10" fill="#8a6a40" />
              <ellipse cx="620" cy="445" rx="20" ry="7" fill="#5a4025" />
              {/* Fire */}
              <path d="M620 420 Q610 435, 615 440 Q620 430, 625 440 Q630 435, 620 420Z" fill="#f5a623" opacity="0.9">
                <animate attributeName="d" dur="1.5s" repeatCount="indefinite"
                  values="M620 420 Q610 435,615 440 Q620 430,625 440 Q630 435,620 420Z;
                          M620 418 Q608 432,614 440 Q620 428,626 440 Q632 432,620 418Z;
                          M620 420 Q610 435,615 440 Q620 430,625 440 Q630 435,620 420Z" />
              </path>
              <path d="M620 425 Q615 435, 618 440 Q620 433, 622 440 Q625 435, 620 425Z" fill="#ff6b35" opacity="0.8">
                <animate attributeName="opacity" dur="1s" repeatCount="indefinite" values="0.6;0.9;0.6" />
              </path>
              {/* Sparks */}
              <circle cx="615" cy="415" r="1.5" fill="#ffd700" opacity="0.6">
                <animate attributeName="cy" dur="2s" repeatCount="indefinite" values="415;405;415" />
                <animate attributeName="opacity" dur="2s" repeatCount="indefinite" values="0.6;0;0.6" />
              </circle>
              <circle cx="625" cy="412" r="1" fill="#ffd700" opacity="0.5">
                <animate attributeName="cy" dur="2.5s" repeatCount="indefinite" values="412;400;412" />
                <animate attributeName="opacity" dur="2.5s" repeatCount="indefinite" values="0.5;0;0.5" />
              </circle>
              {/* Seating logs */}
              <rect x="590" y="455" width="25" height="8" rx="4" fill="#6a5030" transform="rotate(-10 602 459)" />
              <rect x="635" y="455" width="25" height="8" rx="4" fill="#6a5030" transform="rotate(10 647 459)" />
              <text x="620" y="480" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity={hoveredArea === "campfire" ? 1 : 0.7}>Lửa trại</text>
            </g>

            {/* ─── LOOKOUT / FLAG (top right hill) ─── */}
            <g
              className="cursor-pointer"
              onPointerEnter={() => handleAreaHover("lookout")}
              onPointerLeave={() => handleAreaHover(null)}
              onClick={() => handleAreaClick("lookout")}
              style={{ transition: "transform 0.2s", transform: hoveredArea === "lookout" ? "scale(1.05)" : "scale(1)", transformOrigin: "680px 300px" }}
            >
              {/* Hill bump */}
              <ellipse cx="680" cy="320" rx="50" ry="30" fill="#3a6b42" />
              {/* Flagpole */}
              <line x1="680" y1="260" x2="680" y2="320" stroke="#7a5a38" strokeWidth="3" />
              {/* Flag (Scout-inspired) */}
              <polygon points="680,262 710,272 680,282" fill="#d85040">
                <animate attributeName="points" dur="3s" repeatCount="indefinite"
                  values="680,262 710,272 680,282;680,262 712,270 680,282;680,262 710,272 680,282" />
              </polygon>
              {/* Scout fleur-de-lis hint on flag */}
              <circle cx="695" cy="272" r="3" fill="white" opacity="0.6" />
              <text x="680" y="350" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity={hoveredArea === "lookout" ? 1 : 0.7}>Vọng gác</text>
            </g>

            {/* ─── DOCK (bottom center) ─── */}
            <g
              className="cursor-pointer"
              onPointerEnter={() => handleAreaHover("dock")}
              onPointerLeave={() => handleAreaHover(null)}
              onClick={() => handleAreaClick("dock")}
              style={{ transition: "transform 0.2s", transform: hoveredArea === "dock" ? "scale(1.05)" : "scale(1)", transformOrigin: "450px 650px" }}
            >
              {/* Dock planks */}
              <rect x="420" y="645" width="60" height="40" rx="2" fill="#b09060" />
              <line x1="420" y1="655" x2="480" y2="655" stroke="#9a7a50" strokeWidth="1" />
              <line x1="420" y1="665" x2="480" y2="665" stroke="#9a7a50" strokeWidth="1" />
              <line x1="420" y1="675" x2="480" y2="675" stroke="#9a7a50" strokeWidth="1" />
              {/* Dock posts */}
              <rect x="425" y="640" width="5" height="48" fill="#8a6a40" />
              <rect x="470" y="640" width="5" height="48" fill="#8a6a40" />
              <text x="450" y="700" textAnchor="middle" fontSize="11" fill="#7a5a38" fontWeight="bold" opacity={hoveredArea === "dock" ? 1 : 0.6}>Bến nhỏ</text>
            </g>

            {/* ─── TREES scattered ─── */}
            {[
              [180, 350, 1], [200, 310, 0.8], [340, 280, 0.9], [550, 260, 0.85], [700, 380, 0.9],
              [160, 460, 0.7], [730, 450, 0.75], [380, 550, 0.6], [520, 560, 0.65],
            ].map(([x, y, s], i) => (
              <g key={`tree-${i}`} transform={`translate(${x},${y}) scale(${s})`}>
                <polygon points="0,-25 -12,5 12,5" fill="#3a6b42" opacity={0.7 + Math.random() * 0.2} />
                <polygon points="0,-18 -10,5 10,5" fill="#4a8b52" opacity={0.6 + Math.random() * 0.2} />
                <rect x="-2" y="5" width="4" height="8" fill="#6a5030" />
              </g>
            ))}

            {/* ─── PATH (connecting areas) ─── */}
            <path
              d="M450 310 Q400 370, 270 430 M450 310 Q500 370, 620 430 M450 310 L450 600 M620 440 Q660 370, 680 330"
              fill="none" stroke="#c4a870" strokeWidth="3" strokeDasharray="8 6" opacity="0.5"
            />
          </svg>

          {/* ─── MASCOTS on the island ─── */}
          <div className="absolute" style={{ left: "38%", top: "55%", transform: "translate(-50%, -50%)" }}>
            <MascotRabbit className="w-10 h-16 drop-shadow-md" />
          </div>
          <div className="absolute" style={{ left: "55%", top: "53%", transform: "translate(-50%, -50%)" }}>
            <MascotOwl className="w-10 h-10 drop-shadow-md" />
          </div>

          {/* ─── MEMORY POINTS ─── */}
          {memories.map(mem => (
            <button
              key={mem.id}
              className={`absolute flex flex-col items-center gap-1 transition-all duration-300 group ${
                mem.unlocked ? "opacity-100 hover:scale-110" : "opacity-40 cursor-default"
              }`}
              style={{
                left: `${mem.x}%`,
                top: `${mem.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() => mem.unlocked && handleMemoryClick(mem)}
              disabled={!mem.unlocked}
              title={mem.unlocked ? mem.label : "Chưa mở khóa"}
            >
              <span className={`text-2xl drop-shadow-md ${mem.unlocked ? "animate-bounce" : ""}`} style={{ animationDuration: "3s" }}>
                {mem.icon}
              </span>
              <span className="text-[10px] font-bold bg-white/80 px-2 py-0.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-gray-700">
                {mem.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── SCOUT EASTER EGG OVERLAY ─── */}
      {showScoutSign && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none animate-in fade-in duration-500">
          <div className="bg-[var(--paper)] p-8 rounded-2xl shadow-2xl transform rotate-1 max-w-sm text-center">
            <p className="text-5xl mb-4">⚜️</p>
            <p className="text-2xl font-bold text-[var(--forest)] [font-family:var(--font-display)]">Sắp Sẵn — Luôn Sẵn</p>
            <p className="text-gray-600 mt-2 text-sm italic">Dấu hiệu Hướng Đạo • TNTT • PSVN</p>
            <div className="mt-4 flex justify-center gap-2">
              <span className="px-3 py-1 bg-amber-100 rounded-full text-xs font-bold text-amber-800">Tráng</span>
              <span className="px-3 py-1 bg-green-100 rounded-full text-xs font-bold text-green-800">Thiếu</span>
              <span className="px-3 py-1 bg-blue-100 rounded-full text-xs font-bold text-blue-800">Kha</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── MEMORY DETAIL POPUP ─── */}
      {selectedMemory && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedMemory(null)}>
          <div className="bg-[var(--paper)] p-6 rounded-2xl shadow-2xl max-w-sm w-[90vw] transform -rotate-1" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-5xl block mb-3">{selectedMemory.icon}</span>
              <h3 className="text-xl font-bold text-[var(--forest)] [font-family:var(--font-display)]">{selectedMemory.label}</h3>
              {selectedMemory.date && <p className="text-sm text-gray-500 mt-1">{selectedMemory.date}</p>}
            </div>
            <div className="mt-6 aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-gray-400 text-sm">Kỷ niệm sẽ hiện ở đây</p>
            </div>
            <button
              onClick={() => setSelectedMemory(null)}
              className="mt-4 w-full py-2 bg-[var(--forest)] text-[var(--paper)] rounded-xl font-bold hover:scale-[1.02] transition-transform"
            >
              Đóng lại
            </button>
          </div>
        </div>
      )}

      {/* ─── TOOLBAR ─── */}
      <div className="absolute top-6 left-6 z-[9999] flex gap-3">
        <button
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center bg-white/90 rounded-full text-xl shadow-lg hover:scale-105 transition-transform backdrop-blur-md"
          title="Trở về"
          aria-label="Trở về phòng"
        >
          ✕
        </button>
      </div>

      {/* ─── ISLAND TITLE ─── */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[9998] text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white [font-family:var(--font-display)] drop-shadow-lg">
          Hòn đảo của hai đứa
        </h2>
        <p className="text-sm text-white/70 mt-1 drop-shadow">Khám phá kỷ niệm và phiêu lưu cùng nhau</p>
      </div>

      {/* ─── LEGEND (bottom-right) ─── */}
      <div className="absolute bottom-6 right-6 z-[9998] bg-white/80 backdrop-blur-md rounded-xl p-3 shadow-lg text-xs text-gray-700 space-y-1 border border-white/50">
        <p className="font-bold text-gray-800 mb-1">Bản đồ</p>
        <p>🏠 Nhà nhỏ · trung tâm</p>
        <p>🌸 Vườn nhỏ · kỷ niệm</p>
        <p>🔥 Lửa trại · chưa mở</p>
        <p>🚩 Vọng gác · khám phá</p>
        <p>⛵ Bến nhỏ · bắt đầu</p>
      </div>

      {/* ─── CSS ANIMATIONS ─── */}
      <style>{`
        @keyframes island-cloud-drift {
          0% { transform: translateX(-10vw); }
          100% { transform: translateX(110vw); }
        }
        @keyframes island-bird-fly {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(40px, -10px); }
          50% { transform: translate(80px, 5px); }
          75% { transform: translate(40px, -5px); }
        }
      `}</style>
    </div>
  );
}
