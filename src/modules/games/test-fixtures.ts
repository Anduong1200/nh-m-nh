import type { GameCommand, GameMove, GameSession, GameType } from "./model";
export const gameActors = ["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"] as const;
export const gameHouse = "33333333-3333-4333-8333-333333333333";
export const doodleMove: Extract<GameMove,{kind:"doodle"}> = {kind:"doodle",payload:{schemaVersion:1,strokes:[{color:"#335445",width:3,points:[[1,2],[4,5]]}]}};
export function createGame(gameType: GameType = "one-line-story",sessionId = crypto.randomUUID()): Extract<GameCommand,{kind:"create"}> {
  return {operationId:crypto.randomUUID(),sessionId,expectedVersion:0,kind:"create",payload:{gameType,prompt:gameType === "draw-guess" ? "thỏ" : "Một chuyến đi nhỏ",turnLimit:gameType === "draw-guess" ? 4 : 2}};
}
export function initialGame(command = createGame()): GameSession {
  const type = command.payload.gameType;
  return {id:command.sessionId,houseId:gameHouse,gameType:type,createdBy:gameActors[0],prompt:type === "draw-guess" ? "" : command.payload.prompt,turnLimit:command.payload.turnLimit,
    players:[{userId:gameActors[0],seat:0},{userId:gameActors[1],seat:1}],status:"active",version:1,turn:{number:1,userId:gameActors[0],phase:type === "doodle-relay" ? "doodle" : type === "draw-guess" ? "drawing" : type === "photo-mission" ? "photo" : "line"},events:[],answer:type === "draw-guess" ? command.payload.prompt : null,artifact:null};
}
