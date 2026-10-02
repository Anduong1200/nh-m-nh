"use client";
import { getWhiteboardSnapshotAction, saveWhiteboardSnapshotAction } from "@/modules/whiteboard/actions";
import type { WhiteboardTransport } from "./sync";
export const whiteboardActionTransport: WhiteboardTransport = { snapshot: getWhiteboardSnapshotAction, save: saveWhiteboardSnapshotAction };
