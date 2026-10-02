"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════ Types ═══════════════════════ */

export type LetterState = "drafting" | "sealed" | "sent" | "delivered" | "opened";
export type DeliveryMode = "immediate" | "scheduled";

export type Letter = {
  id: string;
  from: string;
  to: string;
  content: string;
  clue?: string;
  state: LetterState;
  deliveryMode: DeliveryMode;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  revealTogether: boolean;
};

/* ═══════════════════ CSS KEYFRAMES ═══════════════════ */

const LETTER_STYLES = `
@keyframes letter-float-in {
  0% { opacity: 0; transform: translateY(40px) rotate(-5deg) scale(0.8); }
  60% { opacity: 1; transform: translateY(-8px) rotate(1deg) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) rotate(0) scale(1); }
}
@keyframes envelope-flap-open {
  0% { transform: rotateX(0deg); }
  100% { transform: rotateX(180deg); }
}
@keyframes envelope-flap-close {
  0% { transform: rotateX(180deg); }
  100% { transform: rotateX(0deg); }
}
@keyframes paper-rise {
  0% { transform: translateY(0); opacity: 0.5; }
  100% { transform: translateY(-120px); opacity: 1; }
}
@keyframes seal-break {
  0% { transform: scale(1) rotate(0deg); opacity: 1; }
  50% { transform: scale(1.3) rotate(15deg); opacity: 0.8; }
  100% { transform: scale(0) rotate(45deg); opacity: 0; }
}
@keyframes letter-unfold {
  0% { max-height: 0; opacity: 0; transform: scaleY(0); }
  100% { max-height: 800px; opacity: 1; transform: scaleY(1); }
}
@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes quill-write {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
`;

/* ═══════════════ ENVELOPE COMPONENT ═══════════════ */

function Envelope({
  letter,
  onClick,
  isSealed = false,
}: {
  letter: Letter;
  onClick: () => void;
  isSealed?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="relative w-72 h-48 cursor-pointer group transition-all duration-300"
      style={{
        transform: hovered ? "translateY(-8px) rotate(-1deg)" : "translateY(0)",
        filter: hovered ? "drop-shadow(0 12px 20px rgba(0,0,0,0.2))" : "drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
      }}
      aria-label={`Thư từ ${letter.from}`}
    >
      {/* Envelope body */}
      <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ backgroundColor: "#f0e6d2", border: "2px solid #d4c4a8" }}>
        {/* Envelope texture */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 8px, #c4a87020 8px, #c4a87020 9px)",
        }} />

        {/* Inner flap shadow */}
        <div className="absolute top-0 left-0 right-0 h-20"
          style={{
            background: "linear-gradient(180deg, #e8dcc4 0%, transparent 100%)",
            clipPath: "polygon(0 0, 50% 70%, 100% 0)",
          }}
        />

        {/* Decorative border */}
        <div className="absolute inset-3 border border-dashed border-[#c4a87040] rounded" />

        {/* Clue text */}
        {letter.clue && (
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <p className="text-sm text-[#8a7a60] italic [font-family:var(--font-display)]">{letter.clue}</p>
          </div>
        )}

        {/* From label */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center">
          <p className="text-xs text-[#a0906e] uppercase tracking-widest font-semibold">Từ</p>
          <p className="text-lg text-[#6a5a40] [font-family:var(--font-display)] font-bold">{letter.from}</p>
        </div>
      </div>

      {/* Wax Seal */}
      {isSealed && (
        <div
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center z-20"
          style={{
            background: "radial-gradient(circle at 35% 35%, #c0392b, #922b21)",
            boxShadow: "0 4px 12px rgba(146,43,33,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)",
          }}
        >
          <span className="text-white text-xl" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>♥</span>
        </div>
      )}

      {/* New letter indicator */}
      {letter.state === "delivered" && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-md z-20">
          <span className="text-white text-xs font-bold">!</span>
        </div>
      )}
    </button>
  );
}

/* ═══════════════ SEAL BREAK ANIMATION ═══════════════ */

function SealBreakOverlay({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"waiting" | "breaking" | "done">("waiting");

  const handleBreak = () => {
    setPhase("breaking");
    setTimeout(() => {
      setPhase("done");
      setTimeout(onComplete, 300);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="text-center mb-8">
        <p className="text-white/80 text-lg [font-family:var(--font-display)]">Lá thư đang được niêm phong</p>
        <p className="text-white/50 text-sm mt-1">Nhấn vào dấu niêm để mở</p>
      </div>

      {/* Sealed envelope visual */}
      <div className="relative">
        <div className="w-80 h-52 rounded-lg" style={{ backgroundColor: "#f0e6d2", border: "2px solid #d4c4a8" }}>
          {/* Flap */}
          <div className="absolute top-0 left-0 right-0 h-24"
            style={{
              background: "#e8dcc4",
              clipPath: "polygon(0 0, 50% 90%, 100% 0)",
              transformOrigin: "top center",
              animation: phase === "breaking" ? "envelope-flap-open 0.6s ease-in-out forwards" : undefined,
            }}
          />
        </div>

        {/* Wax seal button */}
        {phase !== "done" && (
          <button
            type="button"
            onClick={handleBreak}
            disabled={phase === "breaking"}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full z-10 cursor-pointer hover:scale-110 transition-transform"
            style={{
              background: "radial-gradient(circle at 35% 35%, #c0392b, #922b21)",
              boxShadow: "0 6px 20px rgba(146,43,33,0.5), inset 0 -3px 6px rgba(0,0,0,0.3)",
              animation: phase === "breaking" ? "seal-break 0.8s ease-in-out forwards" : undefined,
            }}
          >
            <span className="text-white text-3xl" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>♥</span>
          </button>
        )}

        {/* Sparkles on break */}
        {phase === "breaking" && (
          <>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="absolute w-3 h-3 text-yellow-300"
                style={{
                  left: `${45 + Math.cos(i * Math.PI / 3) * 60}%`,
                  top: `${45 + Math.sin(i * Math.PI / 3) * 60}%`,
                  animation: `sparkle 0.6s ${i * 0.1}s ease-out forwards`,
                }}
              >
                ✦
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ LETTER REVEAL (READING) ═══════════════ */

export function LetterReveal({
  letter,
  onClose,
}: {
  letter: Letter;
  onClose: () => void;
}) {
  const [showSeal, setShowSeal] = useState(letter.state === "delivered" || letter.state === "sealed");
  const [revealed, setRevealed] = useState(letter.state === "opened");
  const [paperVisible, setPaperVisible] = useState(false);

  const handleSealBroken = () => {
    setShowSeal(false);
    // Short delay then show paper rising from envelope
    setTimeout(() => setPaperVisible(true), 200);
    setTimeout(() => setRevealed(true), 800);
  };

  if (showSeal) {
    return (
      <>
        <style>{LETTER_STYLES}</style>
        <SealBreakOverlay onComplete={handleSealBroken} />
      </>
    );
  }

  return (
    <>
      <style>{LETTER_STYLES}</style>
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="relative max-w-lg w-full"
          onClick={e => e.stopPropagation()}
          style={{ animation: revealed ? undefined : "letter-float-in 0.8s ease-out" }}
        >
          {/* Paper rising animation */}
          {paperVisible && !revealed && (
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[85%] h-40 rounded-t-lg z-10"
              style={{
                background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-raised) 100%)",
                animation: "paper-rise 0.6s ease-out forwards",
                boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
              }}
            />
          )}

          {/* Letter paper */}
          <div
            className="relative bg-[var(--paper)] rounded-xl shadow-2xl overflow-hidden"
            style={{
              animation: revealed ? "letter-unfold 0.6s ease-out" : undefined,
              transformOrigin: "top center",
            }}
          >
            {/* Top decorative tape */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--accent)] opacity-60" />

            {/* Ornamental header */}
            <div className="px-8 pt-8 pb-4 text-center border-b border-dashed border-[var(--line)]">
              <p className="text-xs text-[var(--muted)] uppercase tracking-[0.3em] font-semibold">Lá thư từ</p>
              <p className="text-2xl text-[var(--forest)] [font-family:var(--font-display)] font-bold mt-1">{letter.from}</p>
              {letter.deliveredAt && (
                <p className="text-xs text-[var(--muted)] mt-2">
                  Gửi đến lúc {new Date(letter.deliveredAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            {/* Letter content */}
            <div className="px-8 py-6 min-h-[200px]">
              <div
                className="text-[var(--ink)] leading-[2] text-lg [font-family:var(--font-display)] whitespace-pre-wrap"
                style={{
                  backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, var(--line) 31px, var(--line) 32px)",
                  paddingTop: "4px",
                }}
              >
                {letter.content}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 pb-8 pt-4 border-t border-dashed border-[var(--line)] flex justify-between items-center">
              <div className="flex items-center gap-2 text-[var(--muted)] text-sm">
                <span>📬</span>
                <span>{letter.revealTogether ? "Mở cùng nhau" : "Gửi riêng"}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-[var(--forest)] text-[var(--paper)] rounded-full text-sm font-bold shadow-md hover:scale-105 transition-transform"
              >
                Cất thư lại
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════ LETTER WRITING UX ═══════════════ */

export function LetterCompose({
  senderName,
  onSend,
  onClose,
}: {
  senderName: string;
  onSend: (data: { content: string; clue: string; deliveryMode: DeliveryMode; scheduledAt?: string | undefined; revealTogether: boolean }) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [clue, setClue] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [revealTogether, setRevealTogether] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [isWriting, setIsWriting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const writeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_CHARS = 2000;

  const handleContentChange = useCallback((value: string) => {
    if (value.length <= MAX_CHARS) {
      setContent(value);
      setCharCount(value.length);
      setIsWriting(true);

      if (writeTimeoutRef.current) clearTimeout(writeTimeoutRef.current);
      writeTimeoutRef.current = setTimeout(() => setIsWriting(false), 1500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (writeTimeoutRef.current) clearTimeout(writeTimeoutRef.current);
    };
  }, []);

  const handleSend = () => {
    if (!content.trim()) return;
    onSend({
      content: content.trim(),
      clue: clue.trim(),
      deliveryMode,
      scheduledAt: deliveryMode === "scheduled" ? scheduledAt : undefined,
      revealTogether,
    });
  };

  return (
    <>
      <style>{LETTER_STYLES}</style>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
        <div
          className="relative max-w-lg w-full my-8"
          style={{ animation: "letter-float-in 0.6s ease-out" }}
        >
          {/* Writing desk surface */}
          <div className="bg-[var(--scene-wood)] rounded-2xl p-3 shadow-2xl">

            {/* Paper */}
            <div className="bg-[var(--paper)] rounded-xl overflow-hidden shadow-inner">

              {/* Ornamental header */}
              <div className="px-6 pt-6 pb-3 flex items-center justify-between border-b border-dashed border-[var(--line)]">
                <div>
                  <p className="text-xs text-[var(--muted)] uppercase tracking-[0.3em] font-semibold">Viết thư</p>
                  <p className="text-lg text-[var(--forest)] [font-family:var(--font-display)] font-bold">Gửi người thương</p>
                </div>
                {/* Quill pen icon */}
                <div
                  className="text-3xl"
                  style={{ animation: isWriting ? "quill-write 0.5s ease-in-out infinite" : undefined }}
                >
                  🪶
                </div>
              </div>

              {/* Clue input */}
              <div className="px-6 pt-4">
                <label className="block text-xs text-[var(--muted)] font-semibold mb-1.5 uppercase tracking-wider">
                  Gợi ý trên phong bì <span className="normal-case">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  value={clue}
                  onChange={e => setClue(e.target.value)}
                  maxLength={80}
                  placeholder="VD: Mở khi nhớ anh..."
                  className="w-full px-4 py-2 bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg text-sm text-[var(--ink)] placeholder-[var(--muted)] outline-none focus:border-[var(--forest)] transition-colors [font-family:var(--font-display)]"
                />
              </div>

              {/* Content textarea */}
              <div className="px-6 pt-4">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => handleContentChange(e.target.value)}
                  rows={8}
                  placeholder="Viết những gì muốn nói..."
                  className="w-full p-4 bg-[var(--paper-raised)] rounded-lg text-[var(--ink)] text-lg leading-[2] resize-none outline-none border border-[var(--line)] focus:border-[var(--forest)] transition-colors [font-family:var(--font-display)]"
                  style={{
                    backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, var(--line) 31px, var(--line) 32px)",
                    backgroundPositionY: "8px",
                  }}
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${charCount > MAX_CHARS * 0.9 ? "text-red-500" : "text-[var(--muted)]"}`}>
                    {charCount}/{MAX_CHARS}
                  </span>
                </div>
              </div>

              {/* Delivery options */}
              <div className="px-6 pt-2 pb-2 space-y-3">
                {/* Delivery mode */}
                <div>
                  <label className="block text-xs text-[var(--muted)] font-semibold mb-2 uppercase tracking-wider">
                    Cách gửi
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("immediate")}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        deliveryMode === "immediate"
                          ? "bg-[var(--forest)] text-[var(--paper)] shadow-md"
                          : "bg-[var(--paper-raised)] text-[var(--muted)] border border-[var(--line)]"
                      }`}
                    >
                      📮 Gửi ngay
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("scheduled")}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        deliveryMode === "scheduled"
                          ? "bg-[var(--forest)] text-[var(--paper)] shadow-md"
                          : "bg-[var(--paper-raised)] text-[var(--muted)] border border-[var(--line)]"
                      }`}
                    >
                      ⏰ Hẹn giờ
                    </button>
                  </div>
                </div>

                {/* Scheduled date picker */}
                {deliveryMode === "scheduled" && (
                  <div style={{ animation: "letter-float-in 0.3s ease-out" }}>
                    <label className="block text-xs text-[var(--muted)] font-semibold mb-1.5">
                      Giao thư lúc
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg text-sm text-[var(--ink)] outline-none focus:border-[var(--forest)]"
                    />
                  </div>
                )}

                {/* Reveal together toggle */}
                <label className="flex items-center gap-3 py-2 cursor-pointer group">
                  <div
                    className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${
                      revealTogether ? "bg-[var(--forest)]" : "bg-[var(--line)]"
                    }`}
                    onClick={() => setRevealTogether(!revealTogether)}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200"
                      style={{ transform: revealTogether ? "translateX(22px)" : "translateX(2px)" }}
                    />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[var(--ink)]">Mở cùng nhau</span>
                    <p className="text-xs text-[var(--muted)]">Cả hai đều cần ở đây khi mở thư</p>
                  </div>
                </label>
              </div>

              {/* Action buttons */}
              <div className="px-6 py-5 border-t border-dashed border-[var(--line)] flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-[var(--paper-raised)] text-[var(--muted)] rounded-xl font-semibold border border-[var(--line)] hover:bg-[var(--paper)] transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!content.trim()}
                  className="flex-1 py-3 bg-[var(--forest)] text-[var(--paper)] rounded-xl font-bold shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  <span>✉️</span>
                  <span>Niêm phong & Gửi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════ MAILBOX (LETTER LIST) ═══════════════ */

export function Mailbox({
  letters,
  onCompose,
  onOpenLetter,
  onClose,
}: {
  letters: Letter[];
  onCompose: () => void;
  onOpenLetter: (letter: Letter) => void;
  onClose: () => void;
}) {
  const received = letters.filter(l => l.state === "delivered" || l.state === "opened");
  const sent = letters.filter(l => l.state === "sent" || l.state === "sealed");
  const newCount = letters.filter(l => l.state === "delivered").length;

  return (
    <>
      <style>{LETTER_STYLES}</style>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
        <div
          className="relative max-w-2xl w-full my-8"
          style={{ animation: "letter-float-in 0.5s ease-out" }}
        >
          <div className="bg-[var(--paper)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--line)]">

            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between border-b-2 border-dashed border-[var(--line)]">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📬</span>
                <div>
                  <h2 className="text-2xl text-[var(--forest)] font-bold [font-family:var(--font-display)]">Hòm Thư</h2>
                  <p className="text-xs text-[var(--muted)]">
                    {newCount > 0 ? `${newCount} thư mới đang chờ` : "Thư từ của hai đứa"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCompose}
                  className="px-4 py-2.5 bg-[var(--forest)] text-[var(--paper)] rounded-full text-sm font-bold shadow-md hover:scale-105 transition-transform flex items-center gap-2"
                >
                  <span>🪶</span> Viết thư
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center bg-[var(--paper-raised)] rounded-full text-lg hover:bg-[var(--line)] transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Received letters */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>📥</span> Thư đã nhận
                {newCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">{newCount} mới</span>
                )}
              </h3>

              {received.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)]">
                  <p className="text-4xl mb-3">📭</p>
                  <p className="[font-family:var(--font-display)]">Chưa có thư nào. Bắt đầu bằng việc viết lá thư đầu tiên?</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-6 justify-center">
                  {received.map(letter => (
                    <div
                      key={letter.id}
                      style={{ animation: "letter-float-in 0.4s ease-out" }}
                    >
                      <Envelope
                        letter={letter}
                        onClick={() => onOpenLetter(letter)}
                        isSealed={letter.state === "delivered"}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sent letters */}
            {sent.length > 0 && (
              <div className="px-6 pb-6 pt-2">
                <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>📤</span> Thư đã gửi
                </h3>
                <div className="space-y-2">
                  {sent.map(letter => (
                    <div
                      key={letter.id}
                      className="flex items-center gap-3 p-3 bg-[var(--paper-raised)] rounded-lg border border-[var(--line)] hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => onOpenLetter(letter)}
                    >
                      <span className="text-xl">{letter.state === "sealed" ? "🔒" : "✉️"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--ink)] truncate">{letter.content.slice(0, 50)}...</p>
                        <p className="text-xs text-[var(--muted)]">
                          {letter.sentAt
                            ? `Gửi lúc ${new Date(letter.sentAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                            : "Đang chờ gửi"}
                        </p>
                      </div>
                      {letter.clue && <span className="text-xs text-[var(--muted)] italic">"{letter.clue}"</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
