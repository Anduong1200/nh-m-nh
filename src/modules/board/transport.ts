"use client";
import { appendBoardObjectAction, getBoardSnapshotAction, updateBoardObjectAction } from "@/modules/board/actions";
import type { BoardSyncTransport } from "./sync";
export const boardActionTransport: BoardSyncTransport = {
  snapshot: getBoardSnapshotAction,
  apply: (operation, context) => operation.mutation === "append"
    ? appendBoardObjectAction({ ...operation.data, id: operation.id, operationId: operation.operationId }, context)
    : updateBoardObjectAction({ ...operation.data, id: operation.id, operationId: operation.operationId, expectedVersion: operation.expectedVersion, ...(operation.mutation === "trash" ? { deleted: true } : operation.mutation === "restore" ? { deleted: false } : {}) }, context),
};

