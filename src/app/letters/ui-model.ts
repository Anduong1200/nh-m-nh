import { letterText, parseLetterCommand, type Letter, type LetterCommand } from "@/modules/letters/model";
import { makeLetterSchedule, resolveLetterTime } from "@/modules/letters/schedule";
export type LetterForm = { content: string; clue: string; mode: "immediate" | "scheduled"; localDateTime: string; timeZone: string; dst: "" | "earlier" | "later"; together: boolean };
export type ComposerDraft = { form: LetterForm; pending: LetterCommand | null };
export const emptyLetterForm = (timeZone = "Asia/Ho_Chi_Minh"): LetterForm => ({ content: "", clue: "", mode: "immediate", localDateTime: "", timeZone, dst: "", together: false });
/** Immutable letters can advance delivery/opening, but late reads never undo an accepted projection. */
export function preferLetterProjection(current: Letter | undefined, incoming: Letter): Letter {
  if (!current || current.id !== incoming.id || current.houseId !== incoming.houseId) return incoming;
  if (current.version > incoming.version || current.version === incoming.version && current.state !== "scheduled" && incoming.state === "scheduled") return current;
  return incoming;
}
export function parseComposerDraft(input: unknown): ComposerDraft | null {
  if (!input || typeof input !== "object" || !("form" in input) || !("pending" in input)) return null;
  const raw = input as Record<string, unknown>;
  if (!raw.form || typeof raw.form !== "object") return null;
  const form = raw.form as Record<string, unknown>;
  if (typeof form.content !== "string" || Array.from(form.content).length > 2000 || typeof form.clue !== "string" || Array.from(form.clue).length > 80 || !["immediate", "scheduled"].includes(String(form.mode)) || typeof form.localDateTime !== "string" || form.localDateTime.length > 30 || typeof form.timeZone !== "string" || form.timeZone.length > 100 || !["", "earlier", "later"].includes(String(form.dst)) || typeof form.together !== "boolean") return null;
  const pending = raw.pending === null ? null : parseLetterCommand(raw.pending);
  if (raw.pending !== null && (!pending || pending.kind !== "send")) return null;
  return { form: form as LetterForm, pending };
}
export function composeCommand(form: LetterForm, ids: { operationId: string; letterId: string }, now = Date.now()): LetterCommand {
  if (!letterText(form.content, 2000) || !letterText(form.clue, 80, false) || /[\r\n\t]/u.test(form.clue)) throw new Error("Nội dung hoặc gợi ý chưa hợp lệ. Thư tối đa 2.000 ký tự; gợi ý một dòng tối đa 80 ký tự.");
  let delivery;
  if (form.mode === "immediate") delivery = { mode: "immediate" as const };
  else {
    const resolution = resolveLetterTime(form.localDateTime, form.timeZone);
    if (resolution.kind === "gap") throw new Error("Giờ này không tồn tại trong múi giờ đã chọn. Chọn một giờ khác nhé.");
    if (resolution.kind !== "valid") throw new Error("Kiểm tra ngày giờ và múi giờ IANA, ví dụ Asia/Ho_Chi_Minh.");
    if (resolution.instants.length > 1 && !form.dst) throw new Error("Giờ này xuất hiện hai lần. Chọn lần sớm hoặc muộn để hẹn chính xác.");
    delivery = makeLetterSchedule(form.localDateTime, form.timeZone, form.dst || undefined);
    if (Date.parse(delivery.deliverAt) <= now) throw new Error("Chọn giờ giao thư trong tương lai. Bản đang viết vẫn có thể chỉnh lại.");
  }
  return { ...ids, kind: "send", payload: { content: form.content, clue: form.clue, delivery, revealTogether: form.together } };
}
