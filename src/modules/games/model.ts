import { parseBoardContext, sameBoardJson, validBoardPayload, type BoardContext } from "@/modules/board/model";
import { isUuid } from "@/modules/knocks/model";

export const GAME_SCHEMA_VERSION = 1;
export const GAME_TYPES = ["doodle-relay", "draw-guess", "one-line-story", "photo-mission"] as const;
export const GAME_DEFAULT_TURNS = {"doodle-relay":6,"draw-guess":4,"one-line-story":8,"photo-mission":2} as const;
export type GameType = typeof GAME_TYPES[number];
export type GameContext = BoardContext;
export type Player = { userId: string; seat: 0 | 1 };
export type Turn = { number: number; userId: string; phase: "doodle" | "drawing" | "guess" | "line" | "photo" };
export type GameMove =
  | { kind: "doodle"; payload: { schemaVersion: 1; strokes: { color: string; width: number; points: number[][] }[] } }
  | { kind: "line" | "guess"; payload: { text: string } }
  | { kind: "photo"; payload: { mediaId: string; caption: string } };
export type GameEvent = GameMove & { sequence: number; actorId: string; operationId: string; createdAt: string };
export type Artifact = { sessionId: string; gameType: GameType; events: GameEvent[]; answer: string | null };
export type GameSession = {
  id: string; houseId: string; gameType: GameType; createdBy: string; prompt: string; turnLimit: number;
  players: [Player, Player]; status: "active" | "completed"; version: number;
  turn: Turn | null; events: GameEvent[]; answer: string | null; artifact: Artifact | null;
};
export type GameCommand =
  | { operationId: string; sessionId: string; expectedVersion: 0; kind: "create"; payload: { gameType: GameType; prompt: string; turnLimit: number } }
  | ({ operationId: string; sessionId: string; expectedVersion: number } & GameMove);
export type GameReceipt = {
  operationId: string; actorId: string; houseId: string; request: GameCommand;
  outcome: "applied" | "conflict"; snapshot: GameSession;
};
export const parseGameContext = parseBoardContext;
export const gameLocalId = (sessionId: string) => `game:${sessionId}`;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && [...v].length <= max && !/[\u0000-\u001F\u007F\u2028\u2029]/u.test(v);
const nonempty = (v: unknown, max: number): v is string => text(v,max) && v.trim().length > 0;
const trimOrdinarySpaces = (value: string) => value.replace(/^ +| +$/gu,"");
export function parseGameMove(input: unknown): GameMove | null {
  if (!object(input) || !object(input.payload)) return null;
  const p = input.payload;
  if (input.kind === "line" || input.kind === "guess") return keys(p,["text"]) && nonempty(p.text,input.kind === "line" ? 500 : 100) ? {kind:input.kind,payload:{text:p.text}} : null;
  if (input.kind === "photo") return keys(p,["mediaId","caption"]) && isUuid(p.mediaId) && text(p.caption,500) ? {kind:"photo",payload:{mediaId:p.mediaId,caption:p.caption}} : null;
  if (input.kind === "doodle" && validBoardPayload("doodle",p) && Array.isArray(p.strokes) && p.strokes.length > 0 && p.strokes.every(s => object(s) && Array.isArray(s.points) && s.points.length > 0) && new TextEncoder().encode(JSON.stringify(p)).length <= 65536) return {kind:"doodle",payload:structuredClone(p) as Extract<GameMove,{kind:"doodle"}>["payload"]};
  return null;
}
export function parseGameCommand(input: unknown): GameCommand | null {
  try {
    if (!object(input) || !keys(input,["operationId","sessionId","expectedVersion","kind","payload"]) || !isUuid(input.operationId) || !isUuid(input.sessionId) || !integer(input.expectedVersion,0,2147483646)) return null;
    if (input.kind === "create") {
      const p = input.payload;
      if (input.expectedVersion !== 0 || !object(p) || !keys(p,["gameType","prompt","turnLimit"]) || !GAME_TYPES.includes(p.gameType as GameType) || !nonempty(p.prompt,p.gameType === "draw-guess" ? 100 : 500) || !integer(p.turnLimit,2,12)) return null;
      if ((p.gameType === "photo-mission" && p.turnLimit !== 2) || (p.gameType === "draw-guess" && p.turnLimit !== 4)) return null;
      return {operationId:input.operationId,sessionId:input.sessionId,expectedVersion:0,kind:"create",payload:{gameType:p.gameType as GameType,prompt:p.prompt,turnLimit:p.turnLimit}};
    }
    const move = parseGameMove(input);
    return move && input.expectedVersion >= 1 ? {operationId:input.operationId,sessionId:input.sessionId,expectedVersion:input.expectedVersion,...move} : null;
  } catch { return null; }
}
/** The server decides completion; the guesser never receives the active session's answer. */
export function nextTurn(session: GameSession, move: GameMove, actorId: string): { turn: Turn | null; completed: boolean } {
  if (session.status !== "active" || !session.turn || session.turn.userId !== actorId) throw new Error("Wrong player or completed session");
  const phase = session.turn.phase;
  if (!(phase === "drawing" && move.kind === "doodle" || phase === move.kind)) throw new Error("Wrong move for this turn");
  const count = session.events.length + 1;
  const completed = session.gameType === "draw-guess" ? move.kind === "guess" && (trimOrdinarySpaces(move.payload.text) === (session.answer === null ? null : trimOrdinarySpaces(session.answer)) || count >= 4) : count >= session.turnLimit;
  const partner = session.players.find(p => p.userId !== actorId);
  if (!partner) throw new Error("Two players required");
  return {completed,turn:completed ? null : {number:count+1,userId:session.gameType === "draw-guess" && move.kind === "guess" ? actorId : partner.userId,phase:session.gameType === "draw-guess" ? "guess" : phase}};
}
export function parseGameSession(input: unknown): GameSession | null {
  try {
    if (!object(input) || !keys(input,["id","houseId","gameType","createdBy","prompt","turnLimit","players","status","version","turn","events","answer","artifact"]) || !isUuid(input.id) || !isUuid(input.houseId) || !isUuid(input.createdBy) || !GAME_TYPES.includes(input.gameType as GameType) || !text(input.prompt,500) || !integer(input.turnLimit,2,12) || !integer(input.version,1,13) || !Array.isArray(input.players) || input.players.length !== 2 || !Array.isArray(input.events) || input.events.length > 12 || input.version !== input.events.length + 1) return null;
    const players = input.players;
    if (!players.every((p,i) => object(p) && keys(p,["userId","seat"]) && isUuid(p.userId) && p.seat === i) || players[0].userId !== input.createdBy || players[0].userId === players[1].userId || !(input.status === "active" || input.status === "completed") || !(input.answer === null || nonempty(input.answer,100))) return null;
    const events = input.events;
    if (!events.every((e,i) => object(e) && keys(e,["sequence","actorId","operationId","createdAt","kind","payload"]) && e.sequence === i+1 && isUuid(e.actorId) && players.some(p => p.userId === e.actorId) && isUuid(e.operationId) && typeof e.createdAt === "string" && Number.isFinite(Date.parse(e.createdAt)) && parseGameMove(e))) return null;
    if (new Set(events.map(e => e.operationId)).size !== events.length) return null;
    if (input.gameType === "draw-guess" ? input.prompt !== "" || input.turnLimit !== 4 : input.answer !== null || !nonempty(input.prompt,500)) return null;
    if (input.gameType === "photo-mission" && input.turnLimit !== 2) return null;
    const phase = input.gameType === "doodle-relay" ? "doodle" : input.gameType === "one-line-story" ? "line" : input.gameType === "photo-mission" ? "photo" : events.length === 0 ? "drawing" : "guess";
    if (events.some((e,i) => e.kind !== (input.gameType === "draw-guess" ? i === 0 ? "doodle" : "guess" : phase) || e.actorId !== players[input.gameType === "draw-guess" ? i === 0 ? 0 : 1 : i % 2].userId)) return null;
    if (events.length > input.turnLimit) return null;
    const correct = input.gameType === "draw-guess" && events.length >= 2 && input.answer !== null && trimOrdinarySpaces(events.at(-1)?.payload.text) === trimOrdinarySpaces(input.answer);
    if (input.gameType !== "draw-guess" ? (input.status === "completed") !== (events.length === input.turnLimit) : input.status === "completed" ? !(correct || events.length === 4) : events.length === 4 || correct) return null;
    if (input.status === "active") {
      const t = input.turn;
      if (!object(t) || !keys(t,["number","userId","phase"]) || t.number !== events.length+1 || !players.some(p => p.userId === t.userId) || !["doodle","drawing","guess","line","photo"].includes(String(t.phase)) || input.artifact !== null) return null;
      if (t.phase !== phase || t.userId !== players[input.gameType === "draw-guess" ? events.length === 0 ? 0 : 1 : events.length % 2].userId) return null;
      if (input.gameType === "draw-guess" && input.answer !== null && input.createdBy !== t.userId && events.length === 0) return null;
    } else if (input.turn !== null || !object(input.artifact) || !sameBoardJson(input.artifact,{sessionId:input.id,gameType:input.gameType,events,answer:input.answer}) || input.gameType === "draw-guess" && input.answer === null) return null;
    return structuredClone(input) as GameSession;
  } catch { return null; }
}
export function gameReceipt(input: unknown, context: GameContext, command: GameCommand): GameReceipt | null {
  if (!object(input) || !keys(input,["operationId","actorId","houseId","request","outcome","snapshot"]) || input.operationId !== command.operationId || input.actorId !== context.accountId || input.houseId !== context.houseId || !sameBoardJson(input.request,command) || !["applied","conflict"].includes(String(input.outcome))) return null;
  const snapshot = parseGameSession(input.snapshot);
  if (!snapshot || snapshot.id !== command.sessionId || snapshot.houseId !== context.houseId || !snapshot.players.some(p => p.userId === context.accountId) || snapshot.gameType === "draw-guess" && snapshot.status === "active" && snapshot.createdBy !== context.accountId && snapshot.answer !== null) return null;
  if (input.outcome === "applied") {
    if (snapshot.version !== command.expectedVersion+1) return null;
    if (command.kind === "create") {
      if (snapshot.createdBy !== context.accountId || snapshot.gameType !== command.payload.gameType || snapshot.turnLimit !== command.payload.turnLimit || (snapshot.gameType === "draw-guess" ? snapshot.answer !== command.payload.prompt : snapshot.prompt !== command.payload.prompt)) return null;
    } else {
      const e = snapshot.events.at(-1);
      if (!e || e.operationId !== command.operationId || e.actorId !== context.accountId || e.kind !== command.kind || !sameBoardJson(e.payload,command.payload)) return null;
    }
  }
  return {...input,snapshot} as GameReceipt;
}
