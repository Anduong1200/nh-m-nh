"use client";
import { applyLetterCommandAction, applyLetterRevealAction, readLetterAction } from "./actions";
import type { LetterTransport } from "./client";
export const letterTransport: LetterTransport = { read: readLetterAction, apply: applyLetterCommandAction, reveal: applyLetterRevealAction };
