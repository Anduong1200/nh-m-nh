"use client";

import { SharedIsland, type MemoryPoint } from "@/components/phase4/shared-island";

const DEMO_MEMORIES: MemoryPoint[] = [
  { id: "m1", label: "Lần đầu ghép Nhà", x: 48, y: 48, icon: "🏠", date: "2026-09-30", unlocked: true },
  { id: "m2", label: "Bức tranh đầu tiên", x: 30, y: 58, icon: "🎨", date: "2026-10-01", unlocked: true },
  { id: "m3", label: "Câu chuyện kỳ lạ", x: 65, y: 55, icon: "📝", date: "2026-10-02", unlocked: true },
  { id: "m4", label: "Ảnh trời chiều", x: 72, y: 40, icon: "📸", unlocked: false },
  { id: "m5", label: "Bí mật nhỏ", x: 25, y: 40, icon: "✨", unlocked: false },
];

export default function IslandPreviewPage() {
  return (
    <SharedIsland
      memories={DEMO_MEMORIES}
      onAreaClick={(area) => console.log("area:", area)}
      onMemoryClick={(mem) => console.log("memory:", mem)}
      onClose={() => window.history.back()}
    />
  );
}
