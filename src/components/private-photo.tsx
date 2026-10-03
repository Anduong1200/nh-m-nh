"use client";
import { useState } from "react";

/** Same-origin authorized bytes; no user-provided URLs and no optimized-image cache. */
export function PrivatePhoto({ mediaId, houseId, alt = "Ảnh của hai đứa" }: { mediaId: string; houseId: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status">Chưa tải được ảnh riêng tư. Thử lại khi có mạng.</p>;
  // eslint-disable-next-line @next/next/no-img-element -- private no-store endpoint must bypass image optimization.
  return <img src={`/media/${encodeURIComponent(mediaId)}?house=${encodeURIComponent(houseId)}`} alt={alt} loading="lazy" onError={() => setFailed(true)} className="max-h-80 max-w-full rounded object-contain" />;
}
