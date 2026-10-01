import { isUuid } from "@/modules/knocks/model";

export const BOARD_SCHEMA_VERSION = 2;
export const BOARD_TYPES = ["note", "link", "doodle", "photo", "voice"] as const;
export type BoardType = typeof BOARD_TYPES[number];
export type BoardContext = { accountId: string; houseId: string };
export type BoardItem = {
  id: string; houseId: string; createdBy: string; type: BoardType;
  payload: Record<string, unknown>; mediaId?: string | null;
  x: number; y: number; rotation: number; zIndex: number; version: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
};
export type BoardItemInput = {
  operationId: string; id: string; type: BoardType; payload: Record<string, unknown>;
  mediaId?: string | null; x?: number; y?: number; rotation?: number; zIndex?: number;
};
export type BoardItemUpdate = {
  operationId: string; id: string; expectedVersion: number;
  payload?: Record<string, unknown>; mediaId?: string | null;
  x?: number; y?: number; rotation?: number; zIndex?: number; deleted?: boolean;
};
export type BoardMutation = { operationId: string; id: string; mutation: "append" | "update" | "trash" | "restore"; expectedVersion: number; data: Record<string, unknown> };
export type BoardReceipt = { operationId: string; actorId: string; houseId: string; outcome: "applied" | "conflict"; item: BoardItem };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => Object.keys(v).every((k) => allowed.includes(k));
const bounded = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const safeText = (v: unknown, max: number, multiline = true) => typeof v === "string" && [...v].length <= max && !(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u).test(v);
const version = (v: unknown, min = 1): v is number => Number.isInteger(v) && bounded(v, min, 2147483647);
export function parseBoardContext(input: unknown): BoardContext | null {
  return object(input) && keys(input, ["accountId", "houseId"]) && isUuid(input.accountId) && isUuid(input.houseId)
    ? { accountId: input.accountId, houseId: input.houseId } : null;
}
export function validBoardPayload(type: unknown, payload: unknown, mediaId: unknown = null): payload is Record<string, unknown> {
  if (!object(payload)) return false;
  try { if (new TextEncoder().encode(JSON.stringify(payload)).length > 262144) return false; } catch { return false; }
  if (type === "note") return mediaId == null && keys(payload, ["text"]) && safeText(payload.text, 10000);
  if (type === "link") {
    if (mediaId != null || !keys(payload, ["url", "title"]) || !safeText(payload.url, 2048, false) || !/^https?:\/\/[^/?#\s@]+([/?#][^\s]*)?$/u.test(payload.url as string)) return false;
    try { const url = new URL(payload.url as string); if (url.username || url.password || !url.hostname) return false; } catch { return false; }
    return !Object.hasOwn(payload, "title") || safeText(payload.title, 200, false);
  }
  if (type === "photo" || type === "voice") return isUuid(mediaId) && keys(payload, ["caption"]) && (!Object.hasOwn(payload, "caption") || safeText(payload.caption, 1000));
  if (type !== "doodle" || mediaId != null || !keys(payload, ["schemaVersion", "strokes"]) || payload.schemaVersion !== 1 || !Array.isArray(payload.strokes) || payload.strokes.length > 256) return false;
  let count = 0;
  return payload.strokes.every((stroke: unknown) => {
    if (!object(stroke) || !keys(stroke, ["color", "width", "points"]) || typeof stroke.color !== "string" || !/^#[a-f\d]{6}$/iu.test(stroke.color) || !bounded(stroke.width, .5, 32) || !Array.isArray(stroke.points)) return false;
    count += stroke.points.length;
    return count <= 10000 && stroke.points.every((point: unknown) => Array.isArray(point) && point.length === 2 && point.every((n) => bounded(n, -10000, 10000)));
  });
}
function layout(row: Record<string, unknown>) {
  return ["x", "y", "rotation", "zIndex"].every((k) => !Object.hasOwn(row, k) || (k === "zIndex" ? Number.isInteger(row[k]) && bounded(row[k], 0, 1000000) : bounded(row[k], k === "rotation" ? -180 : -10000, k === "rotation" ? 180 : 10000)));
}
export function parseBoardItemInput(input: unknown): { value?: BoardItemInput; error?: string } {
  if (!object(input) || !keys(input, ["operationId", "id", "type", "payload", "mediaId", "x", "y", "rotation", "zIndex"]) || !isUuid(input.operationId) || !isUuid(input.id) || !layout(input) || !validBoardPayload(input.type, input.payload, input.mediaId)) return { error: "Nội dung bảng không hợp lệ." };
  try { return { value: structuredClone(input) as BoardItemInput }; } catch { return { error: "Nội dung bảng không hợp lệ." }; }
}
export function parseBoardItemUpdate(input: unknown): { value?: BoardItemUpdate; error?: string } {
  if (!object(input) || !keys(input, ["operationId", "id", "expectedVersion", "payload", "mediaId", "x", "y", "rotation", "zIndex", "deleted"]) || !isUuid(input.operationId) || !isUuid(input.id) || !version(input.expectedVersion) || !layout(input) ||
    (Object.hasOwn(input, "payload") && !object(input.payload)) || (Object.hasOwn(input, "mediaId") && input.mediaId !== null && !isUuid(input.mediaId)) || (Object.hasOwn(input, "deleted") && typeof input.deleted !== "boolean") || Object.keys(input).length <= 3 ||
    (Object.hasOwn(input, "deleted") && Object.keys(input).length !== 4)) return { error: "Thay đổi bảng không hợp lệ." };
  try { if (new TextEncoder().encode(JSON.stringify(input)).length > 300000) return { error: "Thay đổi quá lớn." }; } catch { return { error: "Thay đổi bảng không hợp lệ." }; }
  try { return { value: structuredClone(input) as BoardItemUpdate }; } catch { return { error: "Thay đổi bảng không hợp lệ." }; }
}
export function boardItemFromRow(input: unknown): BoardItem | null {
  if (!object(input)) return null;
  const number = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/u.test(v) ? Number(v) : NaN;
  const coords = { x: number(input.x), y: number(input.y), rotation: number(input.rotation), zIndex: input.z_index };
  const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
  const mediaId = input.media_id ?? null;
  if (!isUuid(input.id) || !isUuid(input.house_id) || !isUuid(input.created_by) || !layout(coords) || !version(input.version) || !validBoardPayload(input.type, input.payload, mediaId) || !time(input.created_at) || !time(input.updated_at) || (input.deleted_at !== null && !time(input.deleted_at))) return null;
  return { id: input.id, houseId: input.house_id, createdBy: input.created_by, type: input.type as BoardType, payload: input.payload, mediaId: mediaId as string | null, ...coords, zIndex: input.z_index as number, version: input.version, createdAt: input.created_at, updatedAt: input.updated_at, deletedAt: input.deleted_at as string | null };
}
export function boardReceiptFromData(input: unknown, context: BoardContext, operation: BoardMutation): BoardReceipt | null {
  if (!object(input)) return null;
  const item = boardItemFromRow(input.item);
  if (!item || input.operation_id !== operation.operationId || input.actor_id !== context.accountId || input.house_id !== context.houseId || item.houseId !== context.houseId || item.id !== operation.id || (input.outcome !== "applied" && input.outcome !== "conflict") || (operation.mutation === "append" && input.outcome === "applied" && item.createdBy !== context.accountId)) return null;
  if (input.outcome === "applied") {
    if ((operation.mutation === "trash" || operation.mutation === "restore") && item.createdBy !== context.accountId) return null;
    if (item.version !== operation.expectedVersion + 1) return null;
    if (operation.mutation === "append" && item.type !== operation.data.type) return null;
    if (Object.hasOwn(operation.data, "payload") && !sameBoardJson(item.payload, operation.data.payload)) return null;
    for (const k of ["x", "y", "rotation", "zIndex"] as const) {
      if ((operation.mutation === "append" || Object.hasOwn(operation.data, k)) && item[k] !== (operation.data[k] ?? 0)) return null;
    }
    if ((operation.mutation === "append" || Object.hasOwn(operation.data, "mediaId")) && item.mediaId !== (operation.data.mediaId ?? null)) return null;
    if (operation.mutation === "trash" ? item.deletedAt === null : item.deletedAt !== null) return null;
  } else if (operation.mutation === "append" || item.version === operation.expectedVersion) return null;
  return { operationId: input.operation_id as string, actorId: context.accountId, houseId: context.houseId, outcome: input.outcome, item };
}

export function sameBoardJson(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : object(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
