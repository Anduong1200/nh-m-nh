"use client";

import { useState } from "react";
import { Mailbox, LetterCompose, LetterReveal, type Letter, type DeliveryMode } from "@/components/phase4/letters";

const DEMO_LETTERS: Letter[] = [
  {
    id: "l1",
    from: "Người thương",
    to: "Mình",
    content: "Anh ơi,\n\nHôm nay em nhớ anh nhiều lắm. Trời Sài Gòn mưa to, em ngồi trong quán cà phê và nghĩ về lần mình cùng ngồi đây.\n\nNhớ anh thật nhiều.\n\n— Em",
    clue: "Mở khi trời mưa ☔",
    state: "delivered",
    deliveryMode: "immediate",
    sentAt: "2026-10-02T14:00:00Z",
    deliveredAt: "2026-10-02T14:00:00Z",
    revealTogether: false,
  },
  {
    id: "l2",
    from: "Mình",
    to: "Người thương",
    content: "Em yêu,\n\nAnh gửi lá thư này hẹn ngày gặp lại. 100 ngày nữa mình sẽ cùng nhau ăn phở nhé.\n\nYêu em!\n\n— Anh",
    clue: "Mở ngày kỷ niệm 💕",
    state: "sent",
    deliveryMode: "scheduled",
    scheduledAt: "2027-01-10T08:00:00Z",
    sentAt: "2026-10-02T10:00:00Z",
    revealTogether: true,
  },
  {
    id: "l3",
    from: "Người thương",
    to: "Mình",
    content: "Đêm nay sao sáng quá. Em đứng trên ban công nhìn lên và nghĩ rằng anh cũng đang nhìn cùng bầu trời. Chúc anh ngủ ngon nhé 🌙",
    state: "opened",
    deliveryMode: "immediate",
    sentAt: "2026-10-01T22:00:00Z",
    deliveredAt: "2026-10-01T22:00:00Z",
    openedAt: "2026-10-01T22:05:00Z",
    revealTogether: false,
  },
];

export default function LettersPreviewPage() {
  const [view, setView] = useState<"mailbox" | "compose" | "reveal">("mailbox");
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      {view === "mailbox" && (
        <Mailbox
          letters={DEMO_LETTERS}
          onCompose={() => setView("compose")}
          onOpenLetter={(letter) => { setSelectedLetter(letter); setView("reveal"); }}
          onClose={() => window.history.back()}
        />
      )}

      {view === "compose" && (
        <LetterCompose
          senderName="Mình"
          onSend={(data) => { console.log("Sent:", data); setView("mailbox"); }}
          onClose={() => setView("mailbox")}
        />
      )}

      {view === "reveal" && selectedLetter && (
        <LetterReveal
          letter={selectedLetter}
          onClose={() => { setSelectedLetter(null); setView("mailbox"); }}
        />
      )}
    </div>
  );
}
