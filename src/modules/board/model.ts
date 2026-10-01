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
