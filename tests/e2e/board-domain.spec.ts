import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type {} from "../ui-fixture/board-domain";
const url = (session: string, actor = 0) => `http://127.0.0.1:3103/?board-domain=1&session=${session}&actor=${actor}`;

test("offline note and doodle survive closing the tab; lost commit response retries exactly once", async ({ page, context }) => {
  const session = randomUUID();
  await page.goto(url(session));
  await expect(page.getByRole("heading", { name: "Kiểm thử Board domain" })).toBeVisible();
  await context.setOffline(true);
  const ids = await page.evaluate(async () => {
    const note = await window.boardDomainTest.enqueue("note", { text: "Để lại cho người kia" });
    const doodle = await window.boardDomainTest.enqueue("doodle", { schemaVersion: 1, strokes: [{ color: "#123456", width: 2, points: [[1, 2], [3, 4]] }] });
    await window.boardDomainTest.drain();
    return [note.operationId, doodle.operationId];
  });
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto(url(session));
  await expect(reopened.getByRole("heading")).toBeVisible();
  expect(await reopened.evaluate(async () => (await window.boardDomainTest.inspect()).operations.map((o) => o.operationId).sort())).toEqual([...ids].sort());
  await reopened.evaluate(() => window.boardDomainTest.loseResponse());
  expect((await reopened.evaluate(() => window.boardDomainTest.drain())).acknowledged).toEqual([]);
  expect((await reopened.evaluate(() => window.boardDomainTest.remote())).length).toBe(1);
  await reopened.reload();
  await expect(reopened.getByRole("heading")).toBeVisible();
  expect((await reopened.evaluate(() => window.boardDomainTest.drain())).acknowledged).toEqual(ids);
  expect((await reopened.evaluate(() => window.boardDomainTest.remote())).length).toBe(2);
  expect((await reopened.evaluate(() => window.boardDomainTest.inspect())).operations).toEqual([]);
  expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("two tabs replay one operation and partner changes require explicit conflict resolution", async ({ page, context }) => {
  const session = randomUUID(), second = await context.newPage();
  await page.goto(url(session)); await second.goto(url(session));
  await expect(page.getByRole("heading")).toBeVisible(); await expect(second.getByRole("heading")).toBeVisible();
  const create = await page.evaluate(() => window.boardDomainTest.enqueue("note", { text: "Ban đầu" }));
  await Promise.all([page.evaluate(() => window.boardDomainTest.drain()), second.evaluate(() => window.boardDomainTest.drain())]);
  expect((await page.evaluate(() => window.boardDomainTest.remote())).length).toBe(1);
  expect((await page.evaluate(() => window.boardDomainTest.inspect())).operations).toEqual([]);
  const local = await page.evaluate((id) => window.boardDomainTest.enqueue("note", { text: "Bản đang viết" }, id, 1), create.entityId);
  await second.goto(url(session, 1)); await expect(second.getByRole("heading")).toBeVisible();
  await second.evaluate(async (id) => { await window.boardDomainTest.enqueue("note", { text: "Bản của người kia" }, id, 1); await window.boardDomainTest.drain(); }, create.entityId);
  expect((await page.evaluate(() => window.boardDomainTest.drain())).conflicts).toEqual([local.operationId]);
  await page.reload(); await expect(page.getByRole("heading")).toBeVisible();
  const conflict = (await page.evaluate(() => window.boardDomainTest.inspect())).operations[0];
  expect(conflict?.conflict?.local).toEqual({ payload: { text: "Bản đang viết" } });
  expect((await page.evaluate(() => window.boardDomainTest.remote()))[0]?.payload).toEqual({ text: "Bản của người kia" });
  const replacement = await page.evaluate((id) => window.boardDomainTest.replace(id, { payload: { text: "Bản chọn giữ" } }, 2), local.operationId);
  expect((await page.evaluate(() => window.boardDomainTest.inspect())).operations.length).toBe(2);
  expect((await page.evaluate(() => window.boardDomainTest.drain())).acknowledged).toEqual([replacement.operationId]);
  expect((await page.evaluate(() => window.boardDomainTest.inspect())).operations).toEqual([]);
  expect((await page.evaluate(() => window.boardDomainTest.remote()))[0]?.payload).toEqual({ text: "Bản chọn giữ" });
});

test("logout in another tab invalidates existing handles and cannot repopulate private content", async ({ page, context }) => {
  const session = randomUUID(), second = await context.newPage();
  await page.goto(url(session)); await second.goto(url(session));
  await expect(page.getByRole("heading")).toBeVisible(); await expect(second.getByRole("heading")).toBeVisible();
  await page.evaluate(() => window.boardDomainTest.enqueue("note", { text: "Nội dung riêng" }));
  await second.evaluate(() => window.boardDomainTest.clear());
  expect(await page.evaluate(async () => { try { await window.boardDomainTest.inspect(); return false; } catch { return true; } })).toBe(true);
  expect((await page.evaluate(() => window.boardDomainTest.drain())).acknowledged).toEqual([]);
  await page.reload(); await expect(page.getByRole("heading")).toBeVisible();
  expect(await page.evaluate(() => window.boardDomainTest.inspect())).toEqual({ operations: [], recent: [], drafts: [] });
});
