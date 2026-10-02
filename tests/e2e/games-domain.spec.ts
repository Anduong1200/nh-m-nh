import { randomUUID } from "node:crypto";
import { expect,test,type Page } from "@playwright/test";
import { doodleMove } from "../../src/modules/games/test-fixtures";
import type { GameSession,GameType } from "../../src/modules/games/model";
import type { GameProposal } from "../../src/modules/games/sync";
const fixture = "http://127.0.0.1:3103";
function path(scope: string,actor = 0) {return `${fixture}/?games=1&session=${scope}&actor=${actor}`;}
async function open(page: Page,scope: string,actor = 0) {await page.goto(path(scope,actor));await expect(page.getByText("Games domain browser harness ready")).toBeVisible();}
async function call<T>(page: Page,method: string,...args: unknown[]): Promise<T> {
  return page.evaluate(async ({method,args}) => {
    const harness = (window as unknown as {gameHarness:Record<string,(...args: unknown[]) => Promise<unknown>>}).gameHarness;
    return harness[method]!(...args);
  },{method,args}) as Promise<T>;
}
function proposal(type: GameType,id = randomUUID()): GameProposal {return {sessionId:id,expectedVersion:0,kind:"create",payload:{gameType:type,prompt:type === "draw-guess" ? "thỏ" : "Chuyến đi nhỏ",turnLimit:type === "draw-guess" ? 4 : 2}};}
test.afterEach(async ({page}) => {await page.evaluate(async () => {const h = (window as unknown as {gameHarness?:{logout():Promise<void>}}).gameHarness;if(h) await h.logout();}).catch(() => {});});
for (const type of ["doodle-relay","draw-guess","one-line-story","photo-mission"] as const) {
  test(`${type} produces a shared ordered artifact asynchronously`,async ({page,context}) => {
    const scope = randomUUID();await open(page,scope);const c = proposal(type);await call(page,"queue",c);await call(page,"drain");
    const partner = await context.newPage();await open(partner,scope,1);
    const initial = await call<GameSession>(partner,"read",c.sessionId);if (type === "draw-guess") expect(initial.answer).toBeNull();
    const first: GameProposal = type === "one-line-story" ? {sessionId:c.sessionId,expectedVersion:1,kind:"line",payload:{text:"Thỏ mang theo một chiếc lá."}} : type === "photo-mission" ? {sessionId:c.sessionId,expectedVersion:1,kind:"photo",payload:{mediaId:randomUUID(),caption:"Chiếc lá"}} : {sessionId:c.sessionId,expectedVersion:1,...doodleMove};
    await call(page,"queue",first);await call(page,"drain");
    const state = await call<GameSession>(partner,"read",c.sessionId);expect(state.version).toBe(2);
    const second: GameProposal = type === "draw-guess" ? {sessionId:c.sessionId,expectedVersion:2,kind:"guess",payload:{text:"thỏ"}} : {...first,expectedVersion:2};
    await call(partner,"queue",second);await call(partner,"drain");
    const completed = await call<GameSession>(page,"read",c.sessionId);expect(completed.status).toBe("completed");expect(completed.artifact?.events).toHaveLength(2);
    expect(completed.events.map(e => e.sequence)).toEqual([1,2]);if (type === "draw-guess") expect(completed.artifact?.answer).toBe("thỏ");
    await partner.close();
  });
}
test("offline draft and contribution survive reload; reconnect syncs exactly once",async ({page,context}) => {
  const scope = randomUUID();await open(page,scope);const c = proposal("one-line-story");await call(page,"queue",c);await call(page,"drain");
  await context.setOffline(true);
  await call(page,"draft",c.sessionId,{text:"Câu chuyện vẫn ở đây."},null);
  const row = await call<{operationId:string}>(page,"queue",{sessionId:c.sessionId,expectedVersion:1,kind:"line",payload:{text:"Câu chuyện vẫn ở đây."}});
  expect((await call<{acknowledged:string[]}>(page,"drain")).acknowledged).toEqual([]);
  await context.setOffline(false);await page.reload();await expect(page.getByText("Games domain browser harness ready")).toBeVisible();
  expect((await call<{payload:unknown}>(page,"getDraft",c.sessionId)).payload).toEqual({text:"Câu chuyện vẫn ở đây."});
  expect((await call<{operationId:string}[]>(page,"operations"))[0]?.operationId).toBe(row.operationId);
  await context.setOffline(true);await call(page,"watch",c.sessionId);await context.setOffline(false);
  await expect.poll(async () => (await call<unknown[]>(page,"operations")).length).toBe(0);
  await call(page,"drain");expect((await call<GameSession>(page,"read",c.sessionId)).events).toHaveLength(1);
});
test("another device's turn preserves conflict and local text without an automatic rewrite",async ({page,context}) => {
  const scope = randomUUID();await open(page,scope);const c = proposal("one-line-story");await call(page,"queue",c);await call(page,"drain");
  const otherDevice = await context.newPage();await open(otherDevice,scope);
  await call(page,"queue",{sessionId:c.sessionId,expectedVersion:1,kind:"line",payload:{text:"Nháp trên máy đầu."}});
  // A direct HTTP submission models another device without this page's IndexedDB queue.
  const applied = await page.request.post(`${fixture}/api/games/apply?session=${scope}&actor=0`,{data:{operationId:randomUUID(),sessionId:c.sessionId,expectedVersion:1,kind:"line",payload:{text:"Đã gửi từ máy khác."}}});expect(applied.ok()).toBe(true);
  const report = await call<{conflicts:string[]}>(page,"drain");expect(report.conflicts).toHaveLength(1);
  const rows = await call<{conflict:{local:{payload:{text:string}};remote:GameSession};operationId:string}[]>(page,"operations");
  expect(rows[0]?.conflict.local.payload.text).toBe("Nháp trên máy đầu.");expect(rows[0]?.conflict.remote.events[0]?.payload).toEqual({text:"Đã gửi từ máy khác."});
  await call(page,"keepRemote",rows[0]!.operationId);expect(await call(page,"operations")).toEqual([]);await otherDevice.close();
});
test("logout clears cached game and drafts; fresh login cannot recover old sensitive content",async ({page}) => {
  const scope = randomUUID();await open(page,scope);const c = proposal("draw-guess");await call(page,"queue",c);await call(page,"drain");await call(page,"draft",c.sessionId,{text:"private draft"},null);
  await call(page,"logout");await page.reload();await expect(page.getByText("Games domain browser harness ready")).toBeVisible();
  expect(await call(page,"cached",c.sessionId)).toBeNull();expect(await call(page,"getDraft",c.sessionId)).toBeUndefined();expect(await call(page,"operations")).toEqual([]);
});
