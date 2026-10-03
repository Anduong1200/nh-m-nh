import "fake-indexeddb/auto";
import {afterEach,expect,it,vi} from "vitest";
import {AccountOfflineStore,clearAccountOfflineData,type JsonValue} from "@/lib/offline/store";
import {createGame,doodleMove,gameActors,gameHouse,initialGame} from "@/modules/games/test-fixtures";
import {gameLocalId,type GameReceipt,type GameSession} from "@/modules/games/model";
import type {GameTransport} from "@/modules/games/sync";
import {GamesWorkspace,type GameList} from "./workspace";
const context={accountId:gameActors[0],houseId:gameHouse};
afterEach(async()=>{await clearAccountOfflineData(context.accountId);vi.restoreAllMocks();});
function setup(type: "one-line-story"|"doodle-relay"="one-line-story"){
  const store=new AccountOfflineStore(context.accountId),command=createGame(type),snapshot=initialGame(command);
  const transport:GameTransport={read:vi.fn(async()=>({context,snapshot})),apply:vi.fn(async command=>({receipt:{operationId:command.operationId,actorId:context.accountId,houseId:context.houseId,request:command,outcome:"applied",snapshot} as GameReceipt}))};
  const list:GameList=vi.fn(async()=>({context,sessions:[snapshot]}));
  const {operationId,...proposal}=command;void operationId;
  return {store,command,snapshot,transport,list,proposal};
}
it("offline UI preserves create draft and immutable pending operation across reopen",async()=>{
  const s=setup();let online=false;let w=new GamesWorkspace(context,s.store,s.transport,s.list,[],()=>online);await w.open();
  expect(await w.saveDraft(s.command.sessionId,{mode:"create",prompt:"Một chuyến đi"})).toBe(true);await w.submit(s.proposal);
  expect(w.getState().operations).toHaveLength(1);expect(s.transport.apply).not.toHaveBeenCalled();const operation=w.getState().operations[0]!.operationId;w.close();
  const nextStore=new AccountOfflineStore(context.accountId);w=new GamesWorkspace(context,nextStore,s.transport,s.list,[],()=>online);await w.open();
  expect(w.getState().drafts[0]?.payload).toEqual({mode:"create",prompt:"Một chuyến đi"});expect(w.getState().operations[0]?.operationId).toBe(operation);
  online=true;await w.refresh();expect(w.getState().operations).toEqual([]);expect(w.getState().sessions[0]?.id).toBe(s.command.sessionId);w.close();
});
function advanced(initial:GameSession,firstText="Sent from another device"):GameSession {
  const next=structuredClone(initial);next.turnLimit=4;next.version=3;
  next.turn={number:3,userId:gameActors[0],phase:initial.gameType==="doodle-relay"?"doodle":"line"};
  next.events=gameActors.map((actorId,index)=>({sequence:index+1,actorId,operationId:crypto.randomUUID(),createdAt:new Date().toISOString(),...(initial.gameType==="doodle-relay"?doodleMove:{kind:"line" as const,payload:{text:index===0?firstText:"Partner continued"}})}));
  return next;
}
it.each(["one-line-story","doodle-relay"] as const)("%s preserves the old draft across a second-device turn, new edits, and reopen",async type=>{
  const s=setup(type);s.snapshot.turnLimit=4;
  const w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  const old:JsonValue={mode:"move",serverVersion:1,text:"My unfinished old line",doodle:{schemaVersion:1,strokes:[{color:"#335445",width:3,points:[[91,92],[93,94]]}]}};
  await w.saveDraft(s.snapshot.id,old);const next=advanced(s.snapshot);vi.mocked(s.list).mockResolvedValue({context,sessions:[next]});await w.refresh();await w.refresh();
  const recovery=()=>w.getState().drafts.filter(d=>d.id.startsWith("game-recovery:"));
  expect(recovery()).toHaveLength(1);expect(recovery()[0]?.payload).toMatchObject({sourceVersion:1,content:old});
  const fresh:JsonValue={mode:"move",serverVersion:3,text:"New turn stays separate",doodle:{schemaVersion:1,strokes:[{color:"#335445",width:3,points:[[10,11],[12,13]]}]}};
  expect(await w.saveDraft(s.snapshot.id,fresh)).toBe(true);expect(recovery()).toHaveLength(1);
  expect((await s.store.getDraft(gameLocalId(s.snapshot.id)))?.payload).toEqual(fresh);w.close();
  const reopened=new AccountOfflineStore(context.accountId),again=new GamesWorkspace(context,reopened,s.transport,s.list);await again.open();
  const exported=JSON.stringify(await again.exportLocal());expect(exported).toContain("My unfinished old line");expect(exported).toContain("New turn stays separate");expect(exported).toContain("[91,92]");again.close();
});
it("a draft already confirmed as the actor's exact contribution is not labeled unsent",async()=>{
  const s=setup();s.snapshot.turnLimit=4;const w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:1,text:"Already sent"});
  vi.mocked(s.list).mockResolvedValue({context,sessions:[advanced(s.snapshot,"Already sent")]});await w.refresh();
  expect(w.getState().drafts.filter(d=>d.id.startsWith("game-recovery:"))).toEqual([]);
  expect(await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:3,text:"A new contribution"})).toBe(true);
  expect(w.getState().drafts.filter(d=>d.id.startsWith("game-recovery:"))).toEqual([]);w.close();
});
it("failed recovery blocks a different-version overwrite even while the editor still shows the old turn",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();const old={mode:"move",serverVersion:1,text:"Keep the original"};await w.saveDraft(s.snapshot.id,old);
  const save=s.store.saveDraft.bind(s.store);vi.spyOn(s.store,"saveDraft").mockImplementation(input=>input.id.startsWith("game-recovery:")?Promise.reject(new Error("Disk full")):save(input));
  expect(await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:3,text:"A different turn"})).toBe(false);
  expect((await s.store.getDraft(gameLocalId(s.snapshot.id)))?.payload).toEqual(old);w.close();
});
it.each([null,"legacy"])("missing or malformed server version %s gets a lossless recovery before a numeric-version edit",async version=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  const old:JsonValue={mode:"move",text:"A legacy contribution",...(version===null?{}:{serverVersion:version})};
  await s.store.saveDraft({id:gameLocalId(s.snapshot.id),houseId:gameHouse,kind:"game",schemaVersion:1,expectedVersion:null,payload:old});
  expect(await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:1,text:"Current contribution"})).toBe(true);
  const recovered=w.getState().drafts.find(d=>d.id.startsWith("game-recovery:"));expect(recovered?.payload).toMatchObject({sourceVersion:null,content:old});w.close();
});
it("corrupted undefined JSON is retained in place instead of being silently erased by serialization",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  const old={mode:"move",serverVersion:1,text:"Corrupted but preserved",extra:undefined} as unknown as JsonValue;
  await s.store.saveDraft({id:gameLocalId(s.snapshot.id),houseId:gameHouse,kind:"game",schemaVersion:1,expectedVersion:null,payload:old});
  expect(await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:3,text:"New turn"})).toBe(false);
  expect((await s.store.getDraft(gameLocalId(s.snapshot.id)))?.payload).toEqual(old);expect(w.getState().error).toContain("Chưa lưu");w.close();
});
it.each(["one-line-story","doodle-relay"] as const)("%s captures edits made while a newer server version is being fetched",async type=>{
  const s=setup(type);s.snapshot.turnLimit=4;const w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  await w.saveDraft(s.snapshot.id,{mode:"move",serverVersion:1,text:"Before fetch",doodle:doodleMove.payload});
  let release!:(value:{context:typeof context;sessions:GameSession[]})=>void;let started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});vi.mocked(s.list).mockImplementation(()=>new Promise(resolve=>{release=resolve;started();}));
  const refreshing=w.refresh();await waiting;
  const latest:JsonValue={mode:"move",serverVersion:1,text:"Last characters during fetch",doodle:{schemaVersion:1,strokes:[{color:"#335445",width:3,points:[[71,72],[73,74]]}]}};
  w.stageDraft(s.snapshot.id,latest);release({context,sessions:[advanced(s.snapshot)]});await refreshing;
  expect(w.getState().sessions[0]?.version).toBe(3);
  expect(w.getState().drafts.some(d=>d.id.startsWith("game-recovery:")&&JSON.stringify(d.payload).includes("Last characters during fetch")&&JSON.stringify(d.payload).includes("[71,72]"))).toBe(true);w.close();
});
it("holds local draft conflicts and refuses an automatic overwrite from another tab",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();await w.saveDraft(s.command.sessionId,{text:"First"});
  const second=new AccountOfflineStore(context.accountId);const d=await second.getDraft(gameLocalId(s.command.sessionId));await second.saveDraft({id:d!.id,houseId:gameHouse,kind:"game",schemaVersion:1,expectedVersion:d!.version,payload:{text:"Other tab"}});
  expect(await w.saveDraft(s.command.sessionId,{text:"Old editor"})).toBe(false);expect((await second.getDraft(gameLocalId(s.command.sessionId)))?.payload).toEqual({text:"Other tab"});expect(w.getState().error).toContain("tab khác");w.close();second.close();
});
it("blocked authorization closes visible snapshots without removing drafts",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list,[s.snapshot]);await w.open();await w.saveDraft(s.command.sessionId,{text:"Keep this"});vi.mocked(s.list).mockResolvedValue({blocked:true});await w.refresh();
  expect(w.getState().blocked).toBe(true);expect(w.getState().sessions).toEqual([]);expect((await s.store.listDrafts())[0]?.payload).toEqual({text:"Keep this"});await expect(w.submit(s.proposal)).rejects.toThrow();w.close();
});
it("rejects foreign-House and premature-answer snapshots from list or initial bootstrap",async()=>{
  const s=setup();const leaked=initialGame(createGame("draw-guess"));leaked.createdBy=gameActors[1];leaked.players=[{userId:gameActors[1],seat:0},{userId:gameActors[0],seat:1}];leaked.turn!.userId=gameActors[1];
  vi.mocked(s.list).mockResolvedValue({context,sessions:[leaked]});const w=new GamesWorkspace(context,s.store,s.transport,s.list,[leaked,{...s.snapshot,houseId:crypto.randomUUID()}]);await w.open();expect(w.getState().sessions).toEqual([]);expect(await s.store.listRecent()).toEqual([]);w.close();
});
it("late authorized list after logout cannot repopulate UI or IndexedDB",async()=>{
  const s=setup();let release!:(r:{context:typeof context;sessions:typeof s.snapshot[]})=>void;let started!:()=>void;
  const wait=new Promise<void>(resolve=>{started=resolve;});vi.mocked(s.list).mockImplementation(()=>new Promise(resolve=>{release=resolve;started();}));
  const w=new GamesWorkspace(context,s.store,s.transport,s.list);const open=w.open();await wait;await clearAccountOfflineData(context.accountId);w.close();release({context,sessions:[s.snapshot]});await open;
  const fresh=new AccountOfflineStore(context.accountId);expect(await fresh.listRecent()).toEqual([]);expect(w.getState().sessions).toEqual([]);fresh.close();
});
it("preserves both versions of a rejected turn and explicitly archives the proposal",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  vi.mocked(s.transport.apply).mockImplementation(async c=>({receipt:{operationId:c.operationId,actorId:context.accountId,houseId:gameHouse,request:c,outcome:"conflict",snapshot:s.snapshot}}));
  await w.submit({sessionId:s.snapshot.id,expectedVersion:1,kind:"line",payload:{text:"My unsent line"}});const conflict=w.getState().operations[0]!;
  expect(conflict.conflict?.local).toMatchObject({payload:{text:"My unsent line"}});expect(conflict.conflict?.remote).toEqual(s.snapshot as unknown as JsonValue);
  await w.keepRemote(conflict.operationId);expect(w.getState().operations).toEqual([]);expect(JSON.stringify(await w.exportLocal())).toContain("My unsent line");w.close();
});
it("immediate staged edits flush the latest revision before editor navigation or close",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();
  w.stageDraft(s.command.sessionId,{mode:"create",prompt:"First"});w.stageDraft(s.command.sessionId,{mode:"create",prompt:"Last characters survive"});
  expect(await w.flushDrafts()).toBe(true);expect(w.hasUnflushedDraft()).toBe(false);w.close();
  const reopened=new AccountOfflineStore(context.accountId);expect((await reopened.getDraft(gameLocalId(s.command.sessionId)))?.payload).toEqual({mode:"create",prompt:"Last characters survive"});reopened.close();
});
it("failed durable flush retains unsaved editor text, blocks refresh, and exports both drafts",async()=>{
  const s=setup(),w=new GamesWorkspace(context,s.store,s.transport,s.list);await w.open();await w.saveDraft(s.command.sessionId,{text:"Original"});
  const second=new AccountOfflineStore(context.accountId),draft=(await second.getDraft(gameLocalId(s.command.sessionId)))!;
  await second.saveDraft({id:draft.id,houseId:gameHouse,kind:"game",schemaVersion:1,expectedVersion:draft.version,payload:{text:"Other tab"}});
  w.stageDraft(s.command.sessionId,{text:"Typing that must stay visible"});expect(await w.flushDrafts()).toBe(false);expect(w.hasUnflushedDraft()).toBe(true);
  vi.mocked(s.list).mockClear();await w.refresh();expect(s.list).not.toHaveBeenCalled();expect((await second.getDraft(draft.id))?.payload).toEqual({text:"Other tab"});
  const exported=JSON.stringify(await w.exportLocal());expect(exported).toContain("Other tab");expect(exported).toContain("Typing that must stay visible");w.close();second.close();
});
