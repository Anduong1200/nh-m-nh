import type { JsonValue } from "@/lib/offline/store";
import { boardItemFromRow, parseBoardItemInput, type BoardItem } from "@/modules/board/model";
import { isUuid } from "@/modules/knocks/model";
export const boardJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
export const boardData = (item: BoardItem) => ({ payload: item.payload, mediaId: item.mediaId ?? null, x: item.x, y: item.y, rotation: item.rotation, zIndex: item.zIndex });
export const boardKind = (item: Pick<BoardItem, "type">): "note" | "doodle" | "board" => item.type === "note" || item.type === "doodle" ? item.type : "board";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function cachedBoardItem(value: unknown): BoardItem | null {
  if (!object(value)) return null;
  return boardItemFromRow({ id: value.id, house_id: value.houseId, created_by: value.createdBy, type: value.type, payload: value.payload,
    media_id: value.mediaId ?? null, x: value.x, y: value.y, rotation: value.rotation, z_index: value.zIndex, version: value.version,
    created_at: value.createdAt, updated_at: value.updatedAt, deleted_at: value.deletedAt });
}
export function localBoardItem(value: JsonValue, accountId: string, houseId: string): BoardItem | null {
  if (!object(value) || value.archived || !object(value.item)) return null;
  const item = value.item;
  if (item.houseId !== houseId || typeof item.version !== "number" || !Number.isInteger(item.version) || item.version < 0 || item.version > 2147483647) return null;
  const parsed = parseBoardItemInput({ operationId: crypto.randomUUID(), id: item.id, type: item.type, ...boardData(item as unknown as BoardItem) }).value;
  if (!parsed || !isUuid(item.createdBy) || (item.version === 0 && item.createdBy !== accountId)) return null;
  const now = new Date().toISOString();
  return { ...parsed, houseId, createdBy: item.createdBy, version: item.version, createdAt: typeof item.createdAt === "string" ? item.createdAt : now, updatedAt: now, deletedAt: null } as BoardItem;
}
