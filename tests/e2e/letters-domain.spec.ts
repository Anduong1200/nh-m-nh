import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { Letter, LetterCommand, LetterReceipt, RevealSession } from "../../src/modules/letters/model";
import { makeLetterSchedule } from "../../src/modules/letters/schedule";
const fixture = "http://127.0.0.1:3103";
async function open(page: Page, actor = 0) { await page.goto(`${fixture}/?letters=1&actor=${actor}`); await expect(page.getByText("Letters core browser harness ready")).toBeVisible(); }
async function call<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ({ method, args }) => (window as unknown as { letterHarness: Record<string, (...args: unknown[]) => Promise<unknown>> }).letterHarness[method]!(...args), { method, args }) as Promise<T>;
}
function send(together = false, scheduled = false): LetterCommand {
  return { operationId: randomUUID(), letterId: randomUUID(), kind: "send", payload: { content: "Riêng cho Cú.\nMột chiếc lá của Thỏ.", clue: "Nhìn dấu lá", revealTogether: together, delivery: scheduled ? makeLetterSchedule("2027-01-01T09:00", "Asia/Ho_Chi_Minh") : { mode: "immediate" } } };
}
test.afterEach(async ({ page }) => { await call(page, "logout").catch(() => {}); });
test("sealed content is absent from recipient responses; explicit open preserves author privacy", async ({ page, context }) => {
  await open(page); const c = send(); await call(page, "apply", c);
  const partner = await context.newPage(); await open(partner, 1);
  const response = await partner.request.get(`${fixture}/api/letters/read?actor=1&id=${c.letterId}`);
  expect(await response.text()).not.toContain("Riêng cho Cú");
  expect(await call<Letter>(partner, "read", c.letterId)).toMatchObject({ content: null, state: "sealed" });
  const command: LetterCommand = { kind: "open", operationId: randomUUID(), letterId: c.letterId };
  const receipt = await call<LetterReceipt>(partner, "apply", command); expect(receipt.snapshot.content).toContain("Riêng cho Cú");
  expect(await call(partner, "apply", command)).toEqual(receipt);
  expect(await call<Letter>(page, "read", c.letterId)).toMatchObject({ state: "sent", version: 1 });
  await call(partner, "logout"); await partner.close();
});
test("scheduled envelopes become available only after the DB delivery boundary", async ({ page, context }) => {
  await open(page); const c = send(false, true); await call(page, "apply", c);
  const partner = await context.newPage(); await open(partner, 1);
  expect(await call(partner, "read", c.letterId)).toBeNull();
  expect(await call<Letter>(page, "read", c.letterId)).toMatchObject({ state: "scheduled" });
  await page.request.post(`${fixture}/api/letters/control`, { data: { letterId: c.letterId, due: true } });
  expect(await call<Letter>(partner, "read", c.letterId)).toMatchObject({ state: "sealed", content: null });
  await call(partner, "logout"); await partner.close();
});
test("joint reveal requires fresh presence and two confirms in the same session", async ({ page, context }) => {
  await open(page); const c = send(true); await call(page, "apply", c);
  const room = await call<RevealSession>(page, "reveal", { kind: "join", letterId: c.letterId, sessionId: null });
  await call(page, "reveal", { kind: "ready", letterId: c.letterId, sessionId: room.sessionId });
  const partner = await context.newPage(); await open(partner, 1);
  const joined = await call<RevealSession>(partner, "reveal", { kind: "join", letterId: c.letterId, sessionId: null }); expect(joined.sessionId).toBe(room.sessionId);
  await page.request.post(`${fixture}/api/letters/control`, { data: { sessionId: room.sessionId, staleActor: 0 } });
  const blocked = await call<RevealSession>(partner, "reveal", { kind: "ready", letterId: c.letterId, sessionId: room.sessionId }); expect(blocked.status).toBe("active"); expect(blocked.snapshot.content).toBeNull();
  await call(page, "reveal", { kind: "heartbeat", letterId: c.letterId, sessionId: room.sessionId });
  const revealed = await call<RevealSession>(page, "reveal", { kind: "ready", letterId: c.letterId, sessionId: room.sessionId }); expect(revealed.status).toBe("revealed");
  expect((await call<Letter>(partner, "read", c.letterId)).content).toContain("Riêng cho Cú");
  await call(partner, "logout"); await partner.close();
});
test("expired joint session keeps content sealed and starts with fresh consent", async ({ page, context }) => {
  await open(page); const c = send(true); await call(page, "apply", c);
  const old = await call<RevealSession>(page, "reveal", { kind: "join", letterId: c.letterId, sessionId: null });
  await call(page, "reveal", { kind: "ready", letterId: c.letterId, sessionId: old.sessionId });
  await page.request.post(`${fixture}/api/letters/control`, { data: { sessionId: old.sessionId, expire: true } });
  expect((await call<RevealSession>(page, "reveal", { kind: "heartbeat", letterId: c.letterId, sessionId: old.sessionId })).status).toBe("expired");
  const partner = await context.newPage(); await open(partner, 1);
  const fresh = await call<RevealSession>(partner, "reveal", { kind: "join", letterId: c.letterId, sessionId: null }); expect(fresh.sessionId).not.toBe(old.sessionId);
  expect((await call<Letter>(partner, "read", c.letterId)).content).toBeNull();
  await call(partner, "logout"); await partner.close();
});
test("heartbeat reconnect reports lost connectivity and never confirms readiness automatically", async ({ page, context }) => {
  await open(page); const c = send(true); await call(page, "apply", c);
  const room = await call<RevealSession>(page, "reveal", { kind: "join", letterId: c.letterId, sessionId: null });
  await call(page, "watch", c.letterId, room.sessionId);
  await expect.poll(async () => (await call<RevealSession | null>(page, "status"))?.ownPresent).toBe(true);
  await context.setOffline(true);
  await expect.poll(() => call(page, "status")).toBeNull();
  await context.setOffline(false);
  await expect.poll(async () => (await call<RevealSession | null>(page, "status"))?.ownPresent).toBe(true);
  expect((await call<RevealSession>(page, "status")).ownReady).toBe(false);
  const partner = await context.newPage(); await open(partner, 1);
  expect((await call<Letter>(partner, "read", c.letterId)).content).toBeNull(); await call(partner, "logout"); await partner.close();
});
test("draft and authorized recent letter survive reload; logout clears both", async ({ page, context }) => {
  await open(page); const c = send(); await call(page, "draft", c.letterId, { text: "Bản nháp riêng" }, null); await call(page, "apply", c);
  await page.reload(); await expect(page.getByText("Letters core browser harness ready")).toBeVisible();
  expect((await call<{ payload: unknown }>(page, "getDraft", c.letterId)).payload).toEqual({ text: "Bản nháp riêng" });
  await context.setOffline(true); expect((await call<Letter>(page, "read", c.letterId)).content).toContain("Riêng cho Cú");
  await context.setOffline(false); await call(page, "logout"); await page.reload(); await expect(page.getByText("Letters core browser harness ready")).toBeVisible();
  expect(await call(page, "cached", c.letterId)).toBeNull(); expect(await call(page, "getDraft", c.letterId)).toBeUndefined();
});
