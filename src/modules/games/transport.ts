"use client";
import { applyGameCommandAction, readGameSessionAction } from "./actions";
import type { GameTransport } from "./sync";
export const gameActionTransport: GameTransport = {read:readGameSessionAction,apply:applyGameCommandAction};
