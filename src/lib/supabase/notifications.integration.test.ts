import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createLettersDatabase, letterActors, letterAsUser, makeLetterDue } from "../../../tests/fixtures/letters-db";
import { createStorageSchema } from "../../../tests/fixtures/storage-schema";
import { makeLetterSchedule } from "@/modules/letters/schedule";
import { createGame } from "@/modules/games/test-fixtures";
let fixture: Awaited<ReturnType<typeof createLettersDatabase>>, token: string;
const endpoint = "https://fcm.googleapis.com/send/test-notifications";
const p256dh = Buffer.from([4,...Array<number>(64).fill(2)]).toString("base64url"), auth = Buffer.alloc(16,3).toString("base64url");
beforeAll(async()=>{fixture=await createLettersDatabase();await createStorageSchema(fixture.db);await fixture.db.exec(await readFile("supabase/install-notifications.sql","utf8"));token=(await letterAsUser<{id:string}>(fixture.db,letterActors[1],"select public.enroll_push_subscription($1,$2,$3,$4) id",[fixture.house,endpoint,p256dh,auth]))[0]!.id;},60000);
afterAll(async()=>{await fixture?.db.close();});
async function asService(sql:string,params:unknown[]=[]){return fixture.db.transaction(async tx=>{await tx.exec("set local role service_role");return (await tx.query<{r:Record<string,unknown>}>(sql,params)).rows;});}
it("isolates device credentials and denies direct writes and privileged dispatch RPCs",async()=>{
  expect(await letterAsUser(fixture.db,letterActors[1],"select id from public.push_subscriptions")).toEqual([{id:token}]);
  for(const actor of [letterActors[0],letterActors[2]]) expect(await letterAsUser(fixture.db,actor,"select id from public.push_subscriptions")).toEqual([]);
  for(const actor of [null,...letterActors]) { await expect(letterAsUser(fixture.db,actor,"select * from public.push_outbox")).rejects.toThrow(/permission denied/);await expect(letterAsUser(fixture.db,actor,"select public.claim_push_deliveries(8)")).rejects.toThrow(/permission denied/); }
  await expect(letterAsUser(fixture.db,letterActors[1],"update public.push_subscriptions set active=false")).rejects.toThrow(/permission denied/);
  await expect(letterAsUser(fixture.db,letterActors[2],"select public.enroll_push_subscription($1,$2,$3,$4)",[fixture.house,endpoint,p256dh,auth])).rejects.toThrow(/House denied/);
  await expect(letterAsUser(fixture.db,letterActors[0],"select public.enroll_push_subscription($1,$2,$3,$4)",[fixture.house,endpoint,p256dh,auth])).rejects.toThrow(/another account/);
});
it("claims each explicit Knock once with no content and cancels a leased job on disable",async()=>{
  const id=crypto.randomUUID();await fixture.db.query("insert into public.knocks(id,house_id,sender_id,recipient_id,kind,content) values($1,$2,$3,$4,'note','Nội dung rất riêng tư')",[id,fixture.house,letterActors[0],letterActors[1]]);
  const jobs=await asService("select public.claim_push_deliveries(8) r");expect(jobs).toHaveLength(1);expect(JSON.stringify(jobs)).not.toContain("Nội dung");expect(await asService("select public.claim_push_deliveries(8) r")).toEqual([]);
  const row=jobs[0]!.r;await letterAsUser(fixture.db,letterActors[1],"select public.disable_push_subscription($1,$2)",[fixture.house,token]);
  expect((await asService("select public.push_delivery_ready($1,$2) r",[row.outbox_id,row.lease_token]))[0]!.r).toBe(false);
  expect((await asService("select public.finish_push_delivery($1,$2,'sent') r",[row.outbox_id,row.lease_token]))[0]!.r).toBe(false);
});
it("rejects unsafe endpoints and refuses repeated installer without changing devices",async()=>{
  for(const url of ["http://fcm.googleapis.com/send/x","https://localhost/a","https://user@fcm.googleapis.com/a"]) await expect(letterAsUser(fixture.db,letterActors[1],"select public.enroll_push_subscription($1,$2,$3,$4)",[fixture.house,url,p256dh,auth])).rejects.toThrow(/Invalid subscription/);
  await expect(fixture.db.exec(await readFile("supabase/install-notifications.sql","utf8"))).rejects.toThrow(/already exists/);await fixture.db.exec("rollback");expect((await fixture.db.query("select id from public.push_subscriptions")).rows).toEqual([{id:token}]);
});
it("does not deliver a future letter or an obsolete game turn, and never copies their content",async()=>{
  await letterAsUser(fixture.db,letterActors[1],"select public.enroll_push_subscription($1,$2,$3,$4)",[fixture.house,endpoint,p256dh,auth]);
  const letterId=crypto.randomUUID(), command={operationId:crypto.randomUUID(),letterId,kind:"send",payload:{content:"Secret scheduled body",clue:"Secret clue",delivery:makeLetterSchedule("2030-10-03T12:00","UTC"),revealTogether:false}};
  await letterAsUser(fixture.db,letterActors[0],"select public.apply_letter_command($1,$2)",[fixture.house,command]);
  expect(await asService("select public.claim_push_deliveries(8) r")).toEqual([]);
  const game=createGame("one-line-story");await letterAsUser(fixture.db,letterActors[0],"select public.apply_game_command($1,$2)",[fixture.house,game]);
  for(const [index,actor] of letterActors.slice(0,2).entries())await letterAsUser(fixture.db,actor,"select public.apply_game_command($1,$2)",[fixture.house,{operationId:crypto.randomUUID(),sessionId:game.sessionId,expectedVersion:index+1,kind:"line",payload:{text:"Secret story line"}}]);
  expect(await asService("select public.claim_push_deliveries(8) r")).toEqual([]);
  // Explicit test clock advancement of both DB eligibility fields; never a browser clock.
  await makeLetterDue(fixture.db,letterId);await fixture.db.query("update public.push_outbox set not_before=clock_timestamp()-interval '1 second' where source_id=$1",[letterId]);
  const jobs=await asService("select public.claim_push_deliveries(8) r");expect(jobs).toHaveLength(1);expect(jobs[0]!.r.kind).toBe("letter-delivered");expect(JSON.stringify(jobs)).not.toContain("Secret");
});
