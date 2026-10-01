import type { ValidationResult } from "@/modules/presence/model";

export const KNOCK_STICKERS = ["leaf", "star", "tea", "hug"] as const;
export type KnockSticker = (typeof KNOCK_STICKERS)[number];
export const KNOCK_STICKER_LABELS: Record<KnockSticker, string> = {
  leaf: "Một chiếc lá nhỏ 🍃", star: "Một ngôi sao ✨", tea: "Một tách trà 🍵", hug: "Một cái ôm 🫂",
};
export type KnockInput = { operationId: string; kind: "note" | "sticker"; content: string };
export type Knock = {
  id: string;
  senderId: string;
  recipientId: string;
  kind: "note" | "sticker";
  content: string;
  createdAt: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseKnockInput(input: unknown): ValidationResult<KnockInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Cú gõ cửa chưa hợp lệ." };
  const row = input as Record<string, unknown>;
  if (!isUuid(row.operationId) || (row.kind !== "note" && row.kind !== "sticker") || typeof row.content !== "string") {
    return { error: "Cú gõ cửa chưa hợp lệ." };
  }
  const content = row.content.trim();
  if (
    !content || Array.from(content).length > 160 || /[\u0000-\u001f\u007f]/.test(content) ||
    (row.kind === "sticker" && !KNOCK_STICKERS.includes(content as KnockSticker))
  ) return { error: "Chọn một nhãn dán hoặc viết một lời nhắn ngắn, tối đa 160 ký tự nhé." };
  return { value: { operationId: row.operationId, kind: row.kind, content } };
}

export function knockFromRow(row: Record<string, unknown>): Knock | null {
  if (!isUuid(row.id) || typeof row.sender_id !== "string" || typeof row.recipient_id !== "string" ||
    (row.kind !== "note" && row.kind !== "sticker") || typeof row.content !== "string" ||
    typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) return null;
  const parsed = parseKnockInput({ operationId: row.id, kind: row.kind, content: row.content });
  if (!parsed.value || row.sender_id === row.recipient_id) return null;
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, kind: row.kind, content: parsed.value.content, createdAt: row.created_at };
}
