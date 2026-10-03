// Simulated HTTP database for browser persistence QA. Real SQL/RLS is tested separately.
import { gameActors,initialGame } from "../../src/modules/games/test-fixtures";
import { nextTurn,parseGameCommand,type GameCommand,type GameReceipt,type GameSession } from "../../src/modules/games/model";
import type { IncomingMessage,ServerResponse } from "node:http";
const rooms = new Map<string,Map<string,GameSession>>();
const receipts = new Map<string,GameReceipt>();
const house = "33333333-3333-4333-8333-333333333333";
function projection(state: GameSession,actor: string) {
  const clone = structuredClone(state);
  if (clone.gameType === "draw-guess" && clone.status === "active" && clone.createdBy !== actor) clone.answer = null;
  return clone;
}
function json(response: ServerResponse,value: unknown,status = 200) {response.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});response.end(JSON.stringify(value));}
export async function handleGameFixture(request: IncomingMessage,response: ServerResponse,url: URL) {
  if (!url.pathname.startsWith("/api/games/")) return false;
  const actor = gameActors[Number(url.searchParams.get("actor") ?? 0)];
  const scope = url.searchParams.get("session") ?? "default";
  if (!actor) {json(response,{blocked:true},403);return true;}
  const context = {accountId:actor,houseId:house};
  const sessions = rooms.get(scope) ?? new Map<string,GameSession>(); rooms.set(scope,sessions);
  if (url.pathname === "/api/games/list") {json(response,{context,sessions:[...sessions.values()].map(state=>projection(state,actor))});return true;}
  if (url.pathname === "/api/games/read") {
    const state = sessions.get(url.searchParams.get("id") ?? "");json(response,state ? {context,snapshot:projection(state,actor)} : {error:"No game"});return true;
  }
  try {
    let body = "";for await (const chunk of request) body += chunk;
    const command = parseGameCommand(JSON.parse(body));if (!command) {json(response,{error:"Invalid command"},400);return true;}
    const key = scope+":"+command.operationId;const previous = receipts.get(key);
    if (previous) {
      if (previous.actorId !== actor || JSON.stringify(previous.request) !== JSON.stringify(command)) json(response,{blocked:true},403);
      else json(response,{receipt:previous});return true;
    }
    let state = sessions.get(command.sessionId);let outcome: "applied" | "conflict" = "applied";
    if (state && (command.kind === "create" || state.version !== command.expectedVersion || state.turn?.userId !== actor || state.status === "completed")) outcome = "conflict";
    if (outcome === "applied") {
      if (command.kind === "create") {
        state = initialGame(command);state.createdBy = actor;state.players = [{userId:actor,seat:0},{userId:gameActors.find(p => p !== actor)!,seat:1}];state.turn!.userId = actor;
      } else {
        if (!state) {json(response,{error:"No game"},404);return true;}
        const next = nextTurn(state,command,actor);
        state.events.push({kind:command.kind,payload:command.payload,sequence:state.version,actorId:actor,operationId:command.operationId,createdAt:new Date().toISOString()} as GameSession["events"][number]);
        state.version++;state.turn = next.turn;state.status = next.completed ? "completed" : "active";
        if (next.completed) state.artifact = {sessionId:state.id,gameType:state.gameType,events:structuredClone(state.events),answer:state.answer};
      }
      sessions.set(command.sessionId,state);
    }
    if (!state) throw new Error("Unavailable");
    const receipt: GameReceipt = {operationId:command.operationId,actorId:actor,houseId:house,request:command as GameCommand,outcome,snapshot:projection(state,actor)};
    receipts.set(key,receipt);json(response,{receipt});
  } catch {json(response,{error:"Fixture rejected command"},400);}
  return true;
}
