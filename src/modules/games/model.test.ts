import { describe,expect,it } from "vitest";
import { gameReceipt,nextTurn,parseGameCommand,parseGameSession } from "./model";
import { createGame,doodleMove,gameActors,gameHouse,initialGame } from "./test-fixtures";
describe("bounded V1 game state machines",() => {
  it.each(["doodle-relay","draw-guess","one-line-story","photo-mission"] as const)("starts %s with two players and its required phase",type => {
    const command = createGame(type);
    expect(parseGameCommand(command)).toEqual(command);
    expect(parseGameSession(initialGame(command))).toEqual(initialGame(command));
  });
  it("keeps line sequence and alternate turn rather than overwriting old text",() => {
    const s = initialGame();
    expect(nextTurn(s,{kind:"line",payload:{text:"Thỏ mở cửa."}},gameActors[0])).toEqual({completed:false,turn:{number:2,userId:gameActors[1],phase:"line"}});
    expect(() => nextTurn(s,{kind:"line",payload:{text:"Cú"}},gameActors[1])).toThrow();
    expect(() => nextTurn(s,doodleMove,gameActors[0])).toThrow();
    expect(s.events).toEqual([]);
  });
  it.each(["x\ny","x\ry","x\u2028y","", " ","x".repeat(501)])("rejects invalid story line %j",text => {
    expect(parseGameCommand({operationId:crypto.randomUUID(),sessionId:crypto.randomUUID(),expectedVersion:1,kind:"line",payload:{text}})).toBeNull();
  });
  it("bounds doodles and does not allow deleted/replaced events or external media URLs",() => {
    const base = {operationId:crypto.randomUUID(),sessionId:crypto.randomUUID(),expectedVersion:1};
    expect(parseGameCommand({...base,...doodleMove})).toBeTruthy();
    expect(parseGameCommand({...base,kind:"doodle",payload:{...doodleMove.payload,strokes:[]}})).toBeNull();
    expect(parseGameCommand({...base,kind:"photo",payload:{mediaId:"https://outside.example/photo.jpg",caption:""}})).toBeNull();
    expect(parseGameCommand({...base,kind:"line",payload:{text:"hi",replaceSequence:1}})).toBeNull();
  });
  it("Draw & Guess moves to the guesser, allows at most three guesses and reveals only at completion",() => {
    const s = initialGame(createGame("draw-guess"));
    const turn = nextTurn(s,doodleMove,gameActors[0]);
    expect(turn.turn).toEqual({number:2,userId:gameActors[1],phase:"guess"});
    s.turn = turn.turn; s.events = [{...doodleMove,sequence:1,actorId:gameActors[0],operationId:crypto.randomUUID(),createdAt:new Date().toISOString()}];
    expect(nextTurn(s,{kind:"guess",payload:{text:"cú"}},gameActors[1])).toMatchObject({completed:false,turn:{userId:gameActors[1]}});
    expect(nextTurn(s,{kind:"guess",payload:{text:"thỏ"}},gameActors[1])).toEqual({completed:true,turn:null});
    expect(nextTurn(s,{kind:"guess",payload:{text:"\u00a0thỏ\u00a0"}},gameActors[1])).toMatchObject({completed:false});
    expect(nextTurn(s,{kind:"guess",payload:{text:" thỏ "}},gameActors[1])).toEqual({completed:true,turn:null});
    s.events = [...s.events,...[2,3].map(sequence => ({kind:"guess" as const,payload:{text:"cú"},sequence,actorId:gameActors[1],operationId:crypto.randomUUID(),createdAt:new Date().toISOString()}))];
    expect(nextTurn(s,{kind:"guess",payload:{text:"cú"}},gameActors[1])).toEqual({completed:true,turn:null});
  });
  it("does not acknowledge receipts for another actor, proposal or session",() => {
    const c = createGame(); const s = initialGame(c);
    const context = {accountId:gameActors[0],houseId:gameHouse};
    const r = {operationId:c.operationId,actorId:context.accountId,houseId:context.houseId,request:c,outcome:"applied",snapshot:s};
    expect(gameReceipt(r,context,c)).toEqual(r);
    expect(gameReceipt({...r,actorId:gameActors[1]},context,c)).toBeNull();
    expect(gameReceipt({...r,request:{...c,payload:{...c.payload,prompt:"other"}}},context,c)).toBeNull();
    expect(gameReceipt({...r,snapshot:{...s,version:2}},context,c)).toBeNull();
  });
});
