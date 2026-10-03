"use client";
import { applyGameCommandAction, readGameSessionAction } from "@/modules/games/actions";
import type { GameTransport } from "./sync";
export const gameActionTransport: GameTransport = {read:readGameSessionAction,apply:applyGameCommandAction};
