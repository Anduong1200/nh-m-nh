import type { BoardContext, BoardMutation } from "@/modules/board/model";
function suffix() { const p = new URLSearchParams(location.search); return "?session=" + encodeURIComponent(p.get("session") ?? "default") + "&actor=" + (p.get("actor") ?? "0"); }
export async function getBoardSnapshotAction() { return (await fetch("/api/board/snapshot" + suffix(), { cache: "no-store" })).json(); }
async function apply(operation: BoardMutation, context: BoardContext) { return (await fetch("/api/board/apply" + suffix(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, context }) })).json(); }
export async function appendBoardObjectAction(input: BoardMutation["data"] & { id: string; operationId: string }, context: BoardContext) {
  const { id, operationId, ...data } = input;
  return apply({ id, operationId, expectedVersion: 0, mutation: "append", data }, context);
}
export async function updateBoardObjectAction(input: BoardMutation["data"] & { id: string; operationId: string; expectedVersion: number }, context: BoardContext) {
  const { id, operationId, expectedVersion, ...data } = input;
  return apply({ id, operationId, expectedVersion, mutation: "update", data }, context);
}
