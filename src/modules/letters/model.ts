import { isUuid } from "@/modules/knocks/model";
import { parseLetterDelivery, type LetterDelivery } from "./schedule";
export const LETTER_SCHEMA_VERSION = 1;
export const REVEAL_HEARTBEAT_MS = 5000;
export const REVEAL_PRESENCE_TTL_MS = 15000;
export const REVEAL_SESSION_TTL_MS = 120000;
export type LetterContext = { accountId: string; houseId: string };
export type LetterCommand =
  | { operationId: string; letterId: string; kind: "send"; payload: { content: string; clue: string; delivery: LetterDelivery; revealTogether: boolean } }
  | { operationId: string; letterId: string; kind: "open" };
export type RevealCommand = { letterId: string; kind: "join"; sessionId: null } | { letterId: string; kind: "heartbeat" | "ready" | "leave"; sessionId: string };
export type Letter = {
  id: string; houseId: string; senderId: string; recipientId: string;
  delivery: LetterDelivery; deliverAt: string; createdAt: string; clue: string; revealTogether: boolean;
  state: "scheduled" | "sent" | "sealed" | "opened"; version: 1 | 2;
  content: string | null; canOpen: boolean; canJoin: boolean;
};
export type LetterReceipt = { operationId: string; actorId: string; houseId: string; letterId: string; snapshot: Letter };
export type RevealSession = { sessionId: string; letterId: string; houseId: string; expiresAt: string; status: "active" | "expired" | "revealed"; connectedPlayers: number; ownReady: boolean; ownPresent: boolean; snapshot: Letter };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string) => Object.keys(value).sort().join() === expected;
const time = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) && Number.isFinite(Date.parse(value));
export function letterText(value: unknown, max: number, required = true): value is string {
  return typeof value === "string" && Array.from(value).length <= max && (!required || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}
export function parseLetterContext(value: unknown): LetterContext | null {
  return object(value) && keys(value, "accountId,houseId") && isUuid(value.accountId) && isUuid(value.houseId) ? { accountId: value.accountId.toLowerCase(), houseId: value.houseId.toLowerCase() } : null;
}
export function parseLetterCommand(value: unknown): LetterCommand | null {
  if (!object(value) || !isUuid(value.operationId) || !isUuid(value.letterId)) return null;
  if (value.kind === "open" && keys(value, "kind,letterId,operationId")) return { operationId: value.operationId.toLowerCase(), letterId: value.letterId.toLowerCase(), kind: "open" };
  if (value.kind !== "send" || !keys(value, "kind,letterId,operationId,payload") || !object(value.payload) || !keys(value.payload, "clue,content,delivery,revealTogether") || !letterText(value.payload.content, 2000) || !letterText(value.payload.clue, 80, false) || /[\r\n\t]/u.test(value.payload.clue) || typeof value.payload.revealTogether !== "boolean") return null;
  const delivery = parseLetterDelivery(value.payload.delivery);
  return delivery ? { operationId: value.operationId.toLowerCase(), letterId: value.letterId.toLowerCase(), kind: "send", payload: { content: value.payload.content, clue: value.payload.clue, delivery, revealTogether: value.payload.revealTogether } } : null;
}
export function parseRevealCommand(value: unknown): RevealCommand | null {
  if (!object(value) || !keys(value, "kind,letterId,sessionId") || !isUuid(value.letterId)) return null;
  if (value.kind === "join" && value.sessionId === null) return { kind: "join", letterId: value.letterId.toLowerCase(), sessionId: null };
  if (!["heartbeat", "ready", "leave"].includes(String(value.kind)) || !isUuid(value.sessionId)) return null;
  return { kind: value.kind as "heartbeat" | "ready" | "leave", letterId: value.letterId.toLowerCase(), sessionId: value.sessionId.toLowerCase() };
}
export function parseLetter(value: unknown, context: LetterContext): Letter | null {
  if (!object(value) || !keys(value, "canJoin,canOpen,clue,content,createdAt,deliverAt,delivery,houseId,id,recipientId,revealTogether,senderId,state,version") || !isUuid(value.id) || value.houseId !== context.houseId || !isUuid(value.senderId) || !isUuid(value.recipientId) || value.senderId === value.recipientId || ![value.senderId, value.recipientId].includes(context.accountId) || !time(value.deliverAt) || !time(value.createdAt) || !letterText(value.clue, 80, false) || typeof value.revealTogether !== "boolean" || typeof value.canOpen !== "boolean" || typeof value.canJoin !== "boolean" || !["scheduled", "sent", "sealed", "opened"].includes(String(value.state)) || ![1, 2].includes(Number(value.version))) return null;
  const delivery = parseLetterDelivery(value.delivery);
  if (!delivery || (delivery.mode === "scheduled" && Date.parse(delivery.deliverAt) !== Date.parse(value.deliverAt))) return null;
  const author = value.senderId === context.accountId;
  if (author && !value.revealTogether && !["scheduled", "sent"].includes(String(value.state))) return null;
  if (value.content !== null && !letterText(value.content, 2000)) return null;
  if (author && value.content === null || !author && ((value.state === "opened") !== (value.content !== null) || ["sent", "scheduled"].includes(String(value.state)))) return null;
  if (value.state === "scheduled" && !author || value.state === "sent" && (!author || value.revealTogether) || value.state === "opened" && value.version !== 2 || value.state !== "opened" && value.version !== 1) return null;
  if (value.canOpen !== (!author && !value.revealTogether && value.state === "sealed") || value.canJoin !== (value.revealTogether && value.state === "sealed")) return null;
  return { ...(value as Letter), delivery };
}
export function parseLetterReceipt(value: unknown, context: LetterContext, command: LetterCommand): LetterReceipt | null {
  if (!object(value) || !keys(value, "actorId,houseId,letterId,operationId,snapshot") || value.operationId !== command.operationId || value.actorId !== context.accountId || value.houseId !== context.houseId || value.letterId !== command.letterId) return null;
  const snapshot = parseLetter(value.snapshot, context);
  if (!snapshot || snapshot.id !== command.letterId || command.kind === "send" && (snapshot.senderId !== context.accountId || snapshot.content !== command.payload.content || snapshot.clue !== command.payload.clue || snapshot.revealTogether !== command.payload.revealTogether || JSON.stringify(snapshot.delivery) !== JSON.stringify(command.payload.delivery)) || command.kind === "open" && (snapshot.recipientId !== context.accountId || snapshot.revealTogether || snapshot.state !== "opened")) return null;
  return { operationId: command.operationId, actorId: context.accountId, houseId: context.houseId, letterId: command.letterId, snapshot };
}
export function parseRevealSession(value: unknown, context: LetterContext, command: RevealCommand): RevealSession | null {
  if (!object(value) || !keys(value, "connectedPlayers,expiresAt,houseId,letterId,ownPresent,ownReady,sessionId,snapshot,status") || !isUuid(value.sessionId) || value.letterId !== command.letterId || value.houseId !== context.houseId || command.sessionId !== null && command.sessionId !== value.sessionId || !time(value.expiresAt) || !["active", "expired", "revealed"].includes(String(value.status)) || !Number.isInteger(value.connectedPlayers) || Number(value.connectedPlayers) < 0 || Number(value.connectedPlayers) > 2 || typeof value.ownReady !== "boolean" || typeof value.ownPresent !== "boolean") return null;
  const snapshot = parseLetter(value.snapshot, context);
  if (!snapshot || !snapshot.revealTogether || snapshot.id !== command.letterId || (value.status === "revealed") !== (snapshot.state === "opened") || value.ownReady && !value.ownPresent || value.ownPresent && value.connectedPlayers === 0 || value.status === "expired" && (value.ownPresent || value.ownReady || value.connectedPlayers !== 0)) return null;
  return { ...(value as RevealSession), snapshot };
}
