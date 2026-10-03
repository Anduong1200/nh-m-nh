"use client";
import type { IslandView } from "@/modules/island/client";
import { MascotRabbit, MascotOwl } from "./mascots";
const gameNames = { "doodle-relay": "Vẽ tiếp sức", "draw-guess": "Vẽ và đoán", "one-line-story": "Chuyện từng dòng", "photo-mission": "Nhiệm vụ ảnh" } as const;
const gameIcons = { "doodle-relay": "🎨", "draw-guess": "✏️", "one-line-story": "📝", "photo-mission": "📷" } as const;
const positions = [[22, 68], [77, 65], [40, 78], [75, 32], [22, 30], [57, 27]];
type IslandProps = { view: IslandView | null; cached: boolean; busy: boolean; error: string | null; blocked?: boolean; onRefresh: () => void };
/** Renders trusted history. No control mutates world progress. */
export function SharedIsland({ view, cached, busy, error, blocked = false, onRefresh }: IslandProps) {
  const artifacts = view?.artifacts ?? [];
  return (
    <main id="main-content" className="island-world relative min-h-dvh overflow-x-hidden pb-8" style={{ background: "linear-gradient(180deg, var(--scene-sky-start), var(--scene-sky-end) 40%, #7ab5c5 80%, #4a9ab5)" }}>
      <header className="relative z-10 mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
        <a href="/house" className="inline-flex min-h-11 items-center rounded-full bg-white/95 px-4 font-bold text-[var(--forest)] shadow focus-visible:outline-2 focus-visible:outline-offset-4">← Về Nhà</a>
        <div className="order-3 w-full text-center sm:order-none sm:w-auto">
          <h1 className="text-2xl font-bold text-[var(--forest)] [font-family:var(--font-display)] sm:text-3xl">Hòn đảo của hai đứa</h1>
          <p className="mt-1 text-sm text-[var(--forest)]">Những điều hai đứa đã làm cùng nhau ở lại đây.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={busy || blocked} className="min-h-11 rounded-full bg-white/95 px-4 font-bold text-[var(--forest)] shadow disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4">{busy ? "Đang tải…" : "Làm mới Đảo"}</button>
      </header>
      <div className="relative z-10 mx-auto mt-3 max-w-3xl px-4 text-center" aria-live="polite">
        {cached && <p className="rounded-xl bg-[var(--paper)] p-2 text-sm text-[var(--forest)]">Đang xem bản đã lưu trên thiết bị. Đảo sẽ làm mới khi có kết nối.</p>}
        {error && <p role="alert" className="mt-2 rounded-xl bg-[var(--paper)] p-3 text-[var(--forest)]">{error} {blocked && <a href="/house" className="underline">Về Nhà để xác nhận phiên.</a>}</p>}
      </div>
      <div className="relative mx-auto flex max-w-5xl items-center justify-center py-2" style={{ touchAction: "manipulation" }}>
        <div className="relative w-[90vw] max-w-[900px] aspect-[4/3]">
          {/* Island landmass SVG */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 900 675" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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
              <circle key={i} cx={cx} cy={cy} r={1.5 + (i % 3) * 0.5} fill="#4a7b52" opacity={0.3 + (i % 4) * 0.075} />
            ))}

            {/* ─── CABIN (top center) ─── */}
            <g
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


              </circle>
              <circle cx="478" cy="210" r="3" fill="white" opacity="0.2">


              </circle>
              {/* Label */}
              <text x="450" y="325" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity="0.9">Nhà nhỏ</text>
            </g>

            {/* Garden reacts only to confirmed memory evidence. */}
            <g opacity={view?.state.world.memories ? 1 : 0.65}
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
              <text x="250" y="495" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity="0.9">Vườn nhỏ</text>
            </g>

            {/* ─── CAMPFIRE (center-right) ─── */}
            <g
            >
              {/* Log circle */}
              <ellipse cx="620" cy="445" rx="30" ry="10" fill="#8a6a40" />
              <ellipse cx="620" cy="445" rx="20" ry="7" fill="#5a4025" />
              {/* Fire */}
              <path d="M620 420 Q610 435, 615 440 Q620 430, 625 440 Q630 435, 620 420Z" fill="#f5a623" opacity="0.9">

              </path>
              <path d="M620 425 Q615 435, 618 440 Q620 433, 622 440 Q625 435, 620 425Z" fill="#ff6b35" opacity="0.8">

              </path>
              {/* Sparks */}
              <circle cx="615" cy="415" r="1.5" fill="#ffd700" opacity="0.6">


              </circle>
              <circle cx="625" cy="412" r="1" fill="#ffd700" opacity="0.5">


              </circle>
              {/* Seating logs */}
              <rect x="590" y="455" width="25" height="8" rx="4" fill="#6a5030" transform="rotate(-10 602 459)" />
              <rect x="635" y="455" width="25" height="8" rx="4" fill="#6a5030" transform="rotate(10 647 459)" />
              <text x="620" y="480" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity="0.9">Lửa trại</text>
            </g>

            {/* ─── LOOKOUT / FLAG (top right hill) ─── */}
            <g
            >
              {/* Hill bump */}
              <ellipse cx="680" cy="320" rx="50" ry="30" fill="#3a6b42" />
              {/* Flagpole */}
              <line x1="680" y1="260" x2="680" y2="320" stroke="#7a5a38" strokeWidth="3" />
              {/* Flag (Scout-inspired) */}
              <polygon points="680,262 710,272 680,282" fill="#d85040">

              </polygon>
              {/* Scout fleur-de-lis hint on flag */}
              <circle cx="695" cy="272" r="3" fill="white" opacity="0.6" />
              <text x="680" y="350" textAnchor="middle" fontSize="12" fill="var(--scene-outline)" fontWeight="bold" opacity="0.9">Vọng gác</text>
            </g>

            {/* ─── DOCK (bottom center) ─── */}
            <g
            >
              {/* Dock planks */}
              <rect x="420" y="645" width="60" height="40" rx="2" fill="#b09060" />
              <line x1="420" y1="655" x2="480" y2="655" stroke="#9a7a50" strokeWidth="1" />
              <line x1="420" y1="665" x2="480" y2="665" stroke="#9a7a50" strokeWidth="1" />
              <line x1="420" y1="675" x2="480" y2="675" stroke="#9a7a50" strokeWidth="1" />
              {/* Dock posts */}
              <rect x="425" y="640" width="5" height="48" fill="#8a6a40" />
              <rect x="470" y="640" width="5" height="48" fill="#8a6a40" />
              <text x="450" y="670" textAnchor="middle" fontSize="11" fill="#7a5a38" fontWeight="bold" opacity="0.9">Bến nhỏ</text>
            </g>

            {/* ─── TREES scattered ─── */}
            {[
              [180, 350, 1], [200, 310, 0.8], [340, 280, 0.9], [550, 260, 0.85], [700, 380, 0.9],
              [160, 460, 0.7], [730, 450, 0.75], [380, 550, 0.6], [520, 560, 0.65],
            ].map(([x, y, s], i) => (
              <g key={`tree-${i}`} transform={`translate(${x},${y}) scale(${s})`}>
                <polygon points="0,-25 -12,5 12,5" fill="#3a6b42" opacity={0.7 + (i % 3) * 0.05} />
                <polygon points="0,-18 -10,5 10,5" fill="#4a8b52" opacity={0.6 + (i % 3) * 0.05} />
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

          {artifacts.slice(0, 6).map((artifact, index) => (
            <a key={artifact.id} href={`/games?session=${encodeURIComponent(artifact.id)}`}
              className="absolute flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--paper)] text-2xl shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--forest)]"
              style={{ left: `${positions[index]![0]}%`, top: `${positions[index]![1]}%`, transform: "translate(-50%, -50%)" }}
              aria-label={`Xem tác phẩm: ${gameNames[artifact.gameType]}`}><span aria-hidden="true">{gameIcons[artifact.gameType]}</span></a>
          ))}
        </div>
      </div>
      <section className="relative z-10 mx-auto grid max-w-4xl gap-4 px-4 sm:grid-cols-[1fr_2fr]" aria-label="Dấu vết trên Đảo">
        <div className="rounded-2xl border border-[var(--forest)]/20 bg-[var(--paper)] p-4 text-[var(--forest)] shadow">
          <h2 className="font-bold [font-family:var(--font-display)]">Bản đồ nhỏ</h2>
          <p className="mt-2 text-sm">🏠 Nhà nhỏ · chỗ trở về</p>
          <p className="mt-2 text-sm">🌸 Vườn · {view?.state.world.memories ? "có kỷ niệm đã xác nhận" : "trang trí"}</p>
          <p className="mt-2 text-sm">🔥 Lửa trại · trang trí, chưa mở</p>
          <p className="mt-2 text-sm">⚜️ Cờ Hướng Đạo · trang trí</p>
          <p className="mt-2 text-sm">⛵ Bến · {view?.state.world.missions ? "đã có tác phẩm nhiệm vụ ảnh" : "trang trí"}</p>
          <p className="mt-3 text-sm">Kỷ niệm và cột mốc chỉ hiện khi có nguồn đã xác nhận. Tác phẩm trò chơi được giữ riêng.</p>
        </div>
        <div className="rounded-2xl border border-[var(--forest)]/20 bg-[var(--paper)] p-4 text-[var(--forest)] shadow">
          <h2 className="text-xl font-bold [font-family:var(--font-display)]">Tác phẩm gần đây</h2>
          {!view && <p className="mt-3">{busy ? "Đang mở bản đồ…" : "Chưa tải được bản đồ. Thử làm mới khi có kết nối nhé."}</p>}
          {view && artifacts.length === 0 && <p className="mt-3">{view.state.world.sharedHistory ? "Dấu vết vẫn được giữ trên Đảo. Chưa có tác phẩm trong danh sách gần đây." : "Đảo còn yên ắng. Một trò chơi nhỏ có thể để lại dấu vết đầu tiên."}</p>}
          {artifacts.length > 0 && <ul className="mt-3 space-y-2">{artifacts.map(artifact => (
            <li key={artifact.id}><a href={`/games?session=${encodeURIComponent(artifact.id)}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--forest)]/20 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 hover:bg-[var(--forest)]/5">
              <span aria-hidden="true">{gameIcons[artifact.gameType]}</span><span><strong className="block">{gameNames[artifact.gameType]}</strong><span className="text-sm">{artifact.gameType === "draw-guess" ? "Bức vẽ và đáp án đã mở" : artifact.prompt}</span></span>
            </a></li>
          ))}</ul>}
          <a href="/games" style={{ color: "var(--paper)" }} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[var(--forest)] px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-4">Ghé hộp trò chơi</a>
          <p className="mt-3 text-sm">Đảo giữ lịch sử, không mất đi khi hai đứa nghỉ một thời gian.</p>
        </div>
      </section>
    </main>
  );
}
