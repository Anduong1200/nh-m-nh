import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createStorageSchema } from "../../../tests/fixtures/storage-schema";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { gameReceipt,parseGameSession,type GameCommand,type GameReceipt } from "@/modules/games/model";
import { createGame,doodleMove,gameActors } from "@/modules/games/test-fixtures";
let db: PGlite;
const [a,b] = gameActors;
const outsider = "44444444-4444-4444-8444-444444444444";
const other = "55555555-5555-4555-8555-555555555555";
let house: string; let otherHouse: string;
async function asUser<T = Record<string,unknown>>(actor: string | null,sql: string,params: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec(actor ? "set local role authenticated" : "set local role anon");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor ?? ""]);
    return (await tx.query<T>(sql,params)).rows;
  });
}
async function apply(actor: string,command: GameCommand,houseId = house) {
  return (await asUser<{r: GameReceipt}>(actor,"select public.apply_game_command($1,$2) as r",[houseId,command]))[0]!.r;
}
const move = (sid: string,version: number,text: string,kind: "line" | "guess" = "line"): GameCommand => ({operationId:crypto.randomUUID(),sessionId:sid,expectedVersion:version,kind,payload:{text}});
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  await createStorageSchema(db);
  for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec(await readFile("supabase/migrations/"+name,"utf8"));
  for (const id of [a,b,outsider,other]) await db.query("insert into auth.users(id) values($1)",[id]);
  house = (await asUser<{id:string}>(a,"select public.create_house_with_owner() as id"))[0]!.id;
  await asUser(a,"select public.create_pairing_invite($1,now()+interval '1 hour')",["a".repeat(64)]);
  await asUser(b,"select public.accept_pairing_invite($1)",["a".repeat(64)]);
  otherHouse = (await asUser<{id:string}>(outsider,"select public.create_house_with_owner() as id"))[0]!.id;
  await asUser(outsider,"select public.create_pairing_invite($1,now()+interval '1 hour')",["b".repeat(64)]);
  await asUser(other,"select public.accept_pairing_invite($1)",["b".repeat(64)]);
},60000);
afterAll(async () => {if (db) await db.close();});
describe("real PostgreSQL game authorization and transitions",() => {
  it.each(["doodle-relay","one-line-story"] as const)("completes %s with ordered immutable shared artifact",async type => {
    const c = createGame(type); const created = await apply(a,c);
    expect(gameReceipt(created,{accountId:a,houseId:house},c)).toEqual(created);
    const contribution: Exclude<GameCommand,{kind:"create"}> = type === "one-line-story" ? {operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,kind:"line",payload:{text:"Thỏ tới."}} : {operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,...doodleMove};
    const first = await apply(a,contribution);
    expect(first.snapshot.turn?.userId).toBe(b);
    const second = {...contribution,operationId:crypto.randomUUID(),expectedVersion:2};
    const last = await apply(b,second);
    expect(last.snapshot).toMatchObject({status:"completed",version:3,turn:null});
    expect(last.snapshot.events.map(e => e.actorId)).toEqual([a,b]);
    expect(last.snapshot.artifact?.events).toEqual(last.snapshot.events);
    expect(parseGameSession(last.snapshot)).toEqual(last.snapshot);
    expect(await apply(a,contribution)).toEqual(first);
    const after = await apply(a,{...contribution,operationId:crypto.randomUUID(),expectedVersion:3});
    expect(after.outcome).toBe("conflict"); expect(after.snapshot.version).toBe(3);
  });
  it("wrong player and stale versions cannot append; conflicts replay even after another turn",async () => {
    const c = createGame(); await apply(a,c);
    const wrong = move(c.sessionId,1,"Không phải lượt.");
    const conflict = await apply(b,wrong); expect(conflict.outcome).toBe("conflict"); expect(conflict.snapshot.events).toEqual([]);
    await apply(a,move(c.sessionId,1,"Thỏ mở cửa."));
    expect(await apply(b,wrong)).toEqual(conflict);
    expect((await apply(a,move(c.sessionId,1,"Lượt cũ."))).outcome).toBe("conflict");
  });
  it("two submissions using the same version produce one event and one conflict",async () => {
    const c = createGame(); await apply(a,c);
    const results = await Promise.all([apply(a,move(c.sessionId,1,"Một.")),apply(a,move(c.sessionId,1,"Hai."))]);
    expect(results.map(r => r.outcome).sort()).toEqual(["applied","conflict"]);
    expect((await asUser<{n:number}>(a,"select count(*)::integer n from public.game_events where session_id=$1",[c.sessionId]))[0]!.n).toBe(1);
  });
  it("simultaneous exact retry preserves one session and two fixed players",async () => {
    const c = createGame(); const results = await Promise.all([apply(a,c),apply(a,c)]);
    expect(results[0]).toEqual(results[1]);
    expect((await asUser(a,"select * from public.game_players where session_id=$1",[c.sessionId])).length).toBe(2);
    await expect(apply(a,{...c,payload:{...c.payload,prompt:"đổi"}})).rejects.toThrow("identity mismatch");
    await expect(apply(b,c)).rejects.toThrow("identity mismatch");
  });
  it.each([true,false])("Draw & Guess hides answers and finishes with correct guess=%s",async correct => {
    const c = createGame("draw-guess"); const created = await apply(a,c);
    expect(created.snapshot.answer).toBe("thỏ"); expect(created.snapshot.prompt).toBe("");
    expect(await asUser(b,"select * from public.game_answers where session_id=$1",[c.sessionId])).toEqual([]);
    expect(await asUser(b,"select * from public.game_operations where session_id=$1",[c.sessionId])).toEqual([]);
    await apply(a,{operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,...doodleMove});
    const read = (await asUser<{r:unknown}>(b,"select public.get_game_session($1,$2) r",[house,c.sessionId]))[0]!.r;
    expect(parseGameSession(read)).toMatchObject({answer:null,turn:{phase:"guess",userId:b}});
    let guessed = await apply(b,move(c.sessionId,2,correct ? "thỏ" : "cú","guess"));
    if (!correct) {
      expect(guessed.snapshot.answer).toBeNull();
      guessed = await apply(b,move(c.sessionId,3,"cú","guess"));
      expect(guessed.snapshot.status).toBe("active");
      guessed = await apply(b,move(c.sessionId,4,"cú","guess"));
    }
    expect(guessed.snapshot).toMatchObject({status:"completed",answer:"thỏ",turn:null,artifact:{answer:"thỏ"}});
    expect(await asUser(b,"select answer from public.game_answers where session_id=$1",[c.sessionId])).toEqual([{answer:"thỏ"}]);
  });
  it("photo missions require owned ready photos in this House",async () => {
    const c = createGame("photo-mission"); await apply(a,c);
    const photos = [crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
    for (const [i,id] of photos.entries()) await db.query("insert into public.media_objects(id,house_id,owner_id,media_type,bucket_id,storage_path,state,mime_type,size_bytes) values($1,$2,$3,'photo','nha-minh-private',$4,$5,'image/jpeg',100)",[id,i===3 ? otherHouse : house,i===1 ? b : i===3 ? outsider : a,(i===3 ? otherHouse : house)+"/"+id,i===2 ? "pending" : "ready"]);
    const command: GameCommand = {operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,kind:"photo",payload:{mediaId:photos[0]!,caption:"Một chiếc lá"}};
    for (const id of photos.slice(1)) await expect(apply(a,{...command,operationId:crypto.randomUUID(),payload:{mediaId:id,caption:""}})).rejects.toThrow("Ready owned House photo required");
    expect((await apply(a,command)).snapshot.turn?.userId).toBe(b);
    const last = await apply(b,{...command,operationId:crypto.randomUUID(),expectedVersion:2,payload:{mediaId:photos[1]!,caption:"Bầu trời"}});
    expect(last.snapshot.artifact?.events.map(e => e.payload)).toEqual([command.payload,{mediaId:photos[1],caption:"Bầu trời"}]);
  });
  it("SQL and browser codecs use the same ordinary-space answer matching",async () => {
    const c = createGame("draw-guess");await apply(a,c);
    await apply(a,{operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,...doodleMove});
    const miss = await apply(b,move(c.sessionId,2,"\u00a0thỏ\u00a0","guess"));expect(miss.snapshot.status).toBe("active");
    const owner = (await asUser<{r:unknown}>(a,"select public.get_game_session($1,$2) r",[house,c.sessionId]))[0]!.r;
    expect(parseGameSession(owner)).toMatchObject({status:"active",version:3,answer:"thỏ"});
    const found = await apply(b,move(c.sessionId,3," thỏ ","guess"));expect(found.snapshot.status).toBe("completed");
    expect(parseGameSession(found.snapshot)).toEqual(found.snapshot);
  });
  it("denies every direct write and cross-House read including secret/receipt projections",async () => {
    const c = createGame("draw-guess"); await apply(a,c);
    for (const table of ["game_sessions","game_players","game_events","game_answers","game_artifacts","game_operations"]) {
      expect(await asUser(outsider,`select * from public.${table} where ${table === "game_sessions" ? "id" : "session_id"}=$1`,[c.sessionId])).toEqual([]);
      await expect(asUser(a,`delete from public.${table}`)).rejects.toThrow("permission denied");
      await expect(asUser(a,`update public.${table} set house_id=$1`,[otherHouse])).rejects.toThrow("permission denied");
      await expect(asUser(a,`insert into public.${table} default values`)).rejects.toThrow("permission denied");
      await expect(asUser(null,`select * from public.${table}`)).rejects.toThrow("permission denied");
    }
    await expect(apply(outsider,move(c.sessionId,1,"steal"),house)).rejects.toThrow("House required");
    await expect(asUser(outsider,"select public.get_game_session($1,$2)",[house,c.sessionId])).rejects.toMatchObject({code:"42501"});
    await expect(asUser(b,"select public.game_snapshot($1,$2)",[c.sessionId,a])).rejects.toThrow("permission denied");
    const catalog = await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname like 'game_%' and relkind='r'");
    expect(catalog.rows.length).toBe(6); expect(catalog.rows.every(r => r.relrowsecurity)).toBe(true);
  });
  it("SQL rejects newline, unbounded payload and a move for the wrong phase",async () => {
    const c = createGame(); await apply(a,c);
    for (const value of ["two\nlines","x".repeat(501),"bad\u2028line","\u00a0\u00a0","\u2000\u2000"]) await expect(apply(a,move(c.sessionId,1,value))).rejects.toThrow("Invalid move");
    await expect(apply(a,{operationId:crypto.randomUUID(),sessionId:c.sessionId,expectedVersion:1,...doodleMove})).rejects.toThrow("Wrong move for phase");
  });
  it("anonymous, unpaired and archived-House requests cannot create or replay games",async () => {
    await expect(asUser(null,"select public.apply_game_command($1,$2)",[house,createGame()])).rejects.toMatchObject({code:"42501"});
    const solo = crypto.randomUUID();await db.query("insert into auth.users(id) values($1)",[solo]);
    const soloHouse = (await asUser<{id:string}>(solo,"select public.create_house_with_owner() id"))[0]!.id;
    await expect(apply(solo,createGame(),soloHouse)).rejects.toMatchObject({code:"42501"});
    const c = createGame();await apply(a,c);
    await db.query("update public.houses set state='archived' where id=$1",[house]);
    try {
      expect(await asUser(b,"select * from public.game_sessions where id=$1",[c.sessionId])).toEqual([]);
      await expect(apply(a,c)).rejects.toMatchObject({code:"42501"});
      await expect(asUser(a,"select public.get_game_session($1,$2)",[house,c.sessionId])).rejects.toMatchObject({code:"42501"});
    } finally {await db.query("update public.houses set state='active' where id=$1",[house]);}
  });
});
