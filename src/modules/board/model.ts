import { isUuid } from "@/modules/knocks/model";

export type BoardItem = {
  id: string;
  houseId: string;
  createdBy: string;
  type: "note" | "link";
  payload: Record<string, unknown>;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BoardItemInput = {
  id: string;
  type: "note" | "link";
  payload: Record<string, unknown>;
  x?: number;
  y?: number;
  rotation?: number;
  zIndex?: number;
};

export type BoardItemUpdate = {
  id: string;
  expectedVersion: number;
  payload?: Record<string, unknown>;
  x?: number;
  y?: number;
  rotation?: number;
  zIndex?: number;
  deleted?: boolean;
};

/** Validate the optional Home data boundary; never cast untrusted database rows to a DTO. */
export function boardItemFromRow(input: unknown): BoardItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const coordinate = (value: unknown) => typeof value === "number" ? value
    : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  const x = coordinate(row.x), y = coordinate(row.y), rotation = coordinate(row.rotation);
  const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!isUuid(row.id) || !isUuid(row.house_id) || !isUuid(row.created_by) ||
    (row.type !== "note" && row.type !== "link") || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload) ||
    ![x, y, rotation].every(Number.isFinite) || typeof row.z_index !== "number" || !Number.isInteger(row.z_index) ||
    typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 ||
    !validTime(row.created_at) || !validTime(row.updated_at) || (row.deleted_at !== null && !validTime(row.deleted_at))) return null;
  return { id: row.id, houseId: row.house_id, createdBy: row.created_by, type: row.type,
    payload: row.payload as Record<string, unknown>, x, y, rotation, zIndex: row.z_index, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at };
}

export function parseBoardItemInput(input: unknown): { value?: BoardItemInput; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Dữ liệu không hợp lệ" };
  const row = input as Record<string, unknown>;
  if (!isUuid(row.id) || (row.type !== "note" && row.type !== "link") || typeof row.payload !== "object" || row.payload === null || Array.isArray(row.payload)) {
    return { error: "Dữ liệu không hợp lệ" };
  }
  
  const value: BoardItemInput = { 
    id: row.id, 
    type: row.type, 
    payload: row.payload as Record<string, unknown>,
  };
  
  if (typeof row.x === "number") value.x = row.x;
  if (typeof row.y === "number") value.y = row.y;
  if (typeof row.rotation === "number") value.rotation = row.rotation;
  if (typeof row.zIndex === "number") value.zIndex = Math.floor(row.zIndex);

  return { value };
}

export function parseBoardItemUpdate(input: unknown): { value?: BoardItemUpdate; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Dữ liệu không hợp lệ" };
  const row = input as Record<string, unknown>;
  if (!isUuid(row.id) || typeof row.expectedVersion !== "number" || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 1) {
    return { error: "Dữ liệu không hợp lệ" };
  }
  
  const value: BoardItemUpdate = {
    id: row.id,
    expectedVersion: row.expectedVersion,
  };

  if (typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload)) {
    value.payload = row.payload as Record<string, unknown>;
  }
  if (typeof row.x === "number") value.x = row.x;
  if (typeof row.y === "number") value.y = row.y;
  if (typeof row.rotation === "number") value.rotation = row.rotation;
  if (typeof row.zIndex === "number") value.zIndex = Math.floor(row.zIndex);
  if (typeof row.deleted === "boolean") value.deleted = row.deleted;

  return { value };
}
