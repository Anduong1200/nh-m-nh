import React, { useState } from "react";

// --- Types for UI ---
export type GameType = "doodle" | "draw_guess" | "story" | "photo";

// --- Game Lobby ---
export function GameLobby({ 
  onSelectGame, 
  onViewHistory 
}: { 
  onSelectGame: (type: GameType) => void;
  onViewHistory: () => void;
}) {
  const games = [
    { id: "doodle", name: "Doodle Relay", desc: "Vẽ tiếp sức cùng nhau", icon: "🎨", color: "bg-orange-100" },
    { id: "draw_guess", name: "Draw & Guess", desc: "Người vẽ, người đoán", icon: "🤔", color: "bg-blue-100" },
    { id: "story", name: "One-line Story", desc: "Mỗi người viết một câu", icon: "✍️", color: "bg-amber-100" },
    { id: "photo", name: "Photo Mission", desc: "Chia sẻ một khoảnh khắc", icon: "📸", color: "bg-green-100" }
  ];

  return (
    <div className="w-full max-w-3xl mx-auto bg-[var(--paper)] rounded-2xl shadow-xl overflow-hidden border border-gray-200/60 p-6 md:p-8 font-sans">
      <div className="flex justify-between items-end mb-8 border-b-2 border-dashed border-gray-300 pb-4">
        <div>
          <h2 className="text-3xl text-[var(--forest)] font-bold [font-family:var(--font-display)]">Hộp Trò Chơi</h2>
          <p className="text-gray-600 mt-2">Cùng nhau tạo ra những kỷ niệm nhỏ.</p>
        </div>
        <button 
          onClick={onViewHistory}
          className="text-sm font-semibold text-[var(--forest)] underline decoration-wavy underline-offset-4 hover:text-[var(--accent)] transition-colors"
        >
          Xem kỷ vật
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          Đến lượt của bạn (1)
        </h3>
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl shadow-sm border border-yellow-100">
              🤔
            </div>
            <div>
              <p className="font-bold text-gray-800">Draw & Guess</p>
              <p className="text-sm text-gray-600">Người thương vừa vẽ xong. Bạn đoán thử nhé!</p>
            </div>
          </div>
          <button className="px-4 py-2 bg-[var(--forest)] text-[var(--paper)] rounded-full text-sm font-bold shadow-md hover:scale-105 transition-transform">
            Chơi ngay
          </button>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-700 mb-4">Bắt đầu màn mới</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {games.map(game => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id as GameType)}
            className={`group flex items-start gap-4 p-4 rounded-xl border-2 border-transparent hover:border-gray-200 ${game.color} transition-all hover:scale-[1.02] hover:shadow-md text-left`}
          >
            <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center text-2xl shadow-sm group-hover:bg-white transition-colors">
              {game.icon}
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-lg group-hover:text-[var(--forest)] transition-colors">{game.name}</h4>
              <p className="text-sm text-gray-700 mt-1">{game.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Custom Prompt UI ---
export function CustomPromptUI({
  gameType,
  onStart
}: {
  gameType: GameType;
  onStart: (prompt: string, turns: number) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState(6);

  const getPlaceholder = () => {
    switch (gameType) {
      case "draw_guess": return "Nhập từ khóa bí mật để người ấy đoán...";
      case "story": return "Câu mở đầu cho câu chuyện...";
      case "photo": return "Chủ đề bức ảnh hôm nay là...";
      default: return "Nhập chủ đề...";
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl p-6 border-4 border-[var(--scene-wood)] transform -rotate-1">
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-8 bg-white/50 border border-gray-200 shadow-sm transform rotate-2" style={{ maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)" }}></div>
      
      <h3 className="text-2xl font-bold text-[var(--forest)] [font-family:var(--font-display)] mb-4">
        Bắt đầu {gameType === 'draw_guess' ? 'Draw & Guess' : 'Trò chơi mới'}
      </h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Chủ đề / Từ khóa bí mật</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={getPlaceholder()}
            className="w-full p-4 bg-[var(--paper)] border-2 border-dashed border-gray-300 rounded-xl focus:border-[var(--forest)] focus:ring-0 outline-none resize-none h-24 text-gray-800 placeholder-gray-400"
          />
          <p className="text-xs text-gray-500 mt-2 italic">Người ấy sẽ không thấy từ khóa này cho đến khi kết thúc!</p>
        </div>

        {gameType !== "photo" && gameType !== "draw_guess" && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Số lượt chơi: {turns}</label>
            <input 
              type="range" 
              min="2" max="12" step="2"
              value={turns}
              onChange={(e) => setTurns(Number(e.target.value))}
              className="w-full accent-[var(--forest)]"
            />
          </div>
        )}

        <button 
          onClick={() => onStart(prompt, turns)}
          disabled={!prompt.trim()}
          className="w-full mt-4 py-3 bg-[var(--forest)] text-[var(--paper)] rounded-xl font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          Tạo màn & Gửi lời mời
        </button>
      </div>
    </div>
  );
}

// --- Turn Screen ---
export function TurnScreen({ gameType, isPartnerTurn = false }: { gameType: GameType, isPartnerTurn?: boolean }) {
  return (
    <div className="w-full max-w-4xl mx-auto bg-[#F4F1EA] rounded-3xl shadow-2xl overflow-hidden border border-gray-300 flex flex-col h-[80vh]">
      {/* Header */}
      <div className="bg-white/50 backdrop-blur-md border-b border-gray-200 p-4 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--forest)] rounded-full flex items-center justify-center text-white font-bold">
            2/6
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Doodle Relay</h3>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Chủ đề: Con mèo béo</p>
          </div>
        </div>
        <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-sm font-semibold hover:bg-gray-300 transition-colors">
          Bỏ cuộc
        </button>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center p-6">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #8C7A6B 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
        
        <div className="relative w-full max-w-2xl aspect-video bg-white rounded-2xl shadow-lg border-2 border-gray-100 flex items-center justify-center overflow-hidden group">
          {/* Mock previous drawing */}
          <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M20,50 Q40,20 60,50 T80,50" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
          
          {isPartnerTurn ? (
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <span className="text-4xl">🦉</span>
              <p className="text-gray-500 font-medium">Người ấy đang vẽ...</p>
            </div>
          ) : (
            <div className="text-gray-300 font-[var(--font-display)] text-2xl select-none">
              Canvas Placeholder
            </div>
          )}
        </div>
      </div>

      {/* Tools / Action Footer */}
      {!isPartnerTurn && (
        <div className="bg-white border-t border-gray-200 p-4 pb-8 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-black ring-2 ring-offset-2 ring-gray-300"></button>
            <button className="w-10 h-10 rounded-full bg-red-500"></button>
            <button className="w-10 h-10 rounded-full bg-blue-500"></button>
            <div className="w-px h-10 bg-gray-300 mx-2"></div>
            <button className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center text-xl hover:bg-gray-100">✏️</button>
            <button className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center text-xl hover:bg-gray-100">🧽</button>
          </div>
          <button className="px-8 py-3 bg-[var(--accent)] text-white rounded-full font-bold shadow-lg hover:scale-105 transition-transform">
            Hoàn thành lượt
          </button>
        </div>
      )}
    </div>
  );
}

// --- Reveal Animation / Winner ---
export function RevealScreen({ artifactType = "drawing" }: { artifactType?: string }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="animate-in zoom-in duration-500 flex flex-col items-center">
        <h2 className="text-4xl md:text-6xl text-white font-[var(--font-display)] mb-8 animate-bounce" style={{ textShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          It's a match! 🎉
        </h2>
        
        <div className="relative bg-[var(--paper)] p-4 pb-12 rounded-sm shadow-2xl transform -rotate-2 hover:rotate-0 transition-transform duration-300 max-w-lg w-full">
          {/* Polaroid style */}
          <div className="aspect-square bg-gray-100 rounded-sm mb-4 border border-gray-200 flex items-center justify-center overflow-hidden relative">
             <div className="absolute inset-0 bg-blue-50/50 mix-blend-multiply pointer-events-none"></div>
             <span className="text-6xl animate-spin" style={{ animationDuration: '10s' }}>🎨</span>
          </div>
          <div className="absolute bottom-4 left-0 w-full text-center">
             <p className="font-[var(--font-display)] text-xl text-gray-800">"Con mèo béo"</p>
             <p className="text-xs text-gray-500 mt-1">Hoàn thành lúc 14:30 • 2026-10-02</p>
          </div>
        </div>
        
        <div className="mt-12 flex gap-4">
          <button className="px-6 py-3 bg-white/20 text-white rounded-full font-semibold hover:bg-white/30 backdrop-blur-md transition-colors">
            Đóng
          </button>
          <button className="px-6 py-3 bg-[var(--forest)] text-[var(--paper)] rounded-full font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
            <span>📌</span> Lưu vào kỷ vật
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Artifact Display (History) ---
export function ArtifactHistory() {
  const artifacts = [
    { id: 1, type: "draw_guess", title: "Cái cốc cà phê", date: "Hôm qua" },
    { id: 2, type: "story", title: "Chuyến đi kỳ lạ", date: "Tuần trước" },
    { id: 3, type: "photo", title: "Bầu trời chiều", date: "Tháng trước" },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <h2 className="text-3xl text-[var(--forest)] font-bold [font-family:var(--font-display)] mb-8 flex items-center gap-3">
        <span>🏺</span> Kỷ vật Trò chơi
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {artifacts.map(art => (
          <div key={art.id} className="group relative bg-white p-3 rounded-lg shadow-md border border-gray-200 hover:shadow-xl transition-shadow cursor-pointer">
             <div className="aspect-square bg-gray-100 rounded mb-3 flex items-center justify-center text-4xl group-hover:scale-105 transition-transform">
               {art.type === 'draw_guess' ? '🎨' : art.type === 'story' ? '📝' : '📸'}
             </div>
             <p className="font-bold text-gray-800 truncate">{art.title}</p>
             <p className="text-xs text-gray-500">{art.date}</p>
             
             {/* Hover Pin */}
             <div className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
               <span className="text-red-500 drop-shadow-md text-xl">📌</span>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
