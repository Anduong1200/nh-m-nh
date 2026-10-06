import type { BoardItem } from "@/modules/board/model";

/** Display coordinates only: persisted negative positions remain editable. */
export function boardOrigin(items: Pick<BoardItem, "x" | "y">[]) {
  return { x: 48 - Math.min(0, ...items.map(item => item.x)), y: 80 - Math.min(0, ...items.map(item => item.y)) };
}
