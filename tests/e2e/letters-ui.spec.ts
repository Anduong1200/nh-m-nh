import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
const fixture = "http://127.0.0.1:3103";
const clue = () => `Chiếc lá ${randomUUID().slice(0, 8)}`;
async function visit(page: Page, actor = 0) {
  await page.goto(`${fixture}/?letters-ui=1&actor=${actor}`);
  await expect(page.getByRole("heading", { name: "Hòm thư của hai đứa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Viết thư" })).toBeEnabled();
}
async function compose(page: Page, hint: string, body: string, together = false) {
  await page.getByRole("button", { name: "Viết thư" }).click();
  await page.getByLabel("Gợi ý trên phong bì (tùy chọn)").fill(hint);
  await page.getByLabel("Nội dung thư", { exact: true }).fill(body);
  if (together) await page.getByRole("checkbox", { name: "Mở cùng nhau", exact: true }).check();
}
async function send(page: Page) {
  const response = page.waitForResponse(result => result.url().includes("/api/letters/apply") && result.request().method() === "POST");
  await page.getByRole("button", { name: "Niêm phong và gửi", exact: true }).click();
  const value = await (await response).json();
  await expect(page.getByText("Đã gửi lá thư vào Nhà.", { exact: true })).toBeVisible();
  return value.receipt.snapshot.id as string;
}
async function envelope(page: Page, hint: string) { await page.getByRole("button", { name: new RegExp(hint) }).click(); }

test("past schedule stays editable and immediate draft close retains the last characters", async ({ page }) => {
  await visit(page); await compose(page, clue(), "Những chữ cuối vừa nhập");
  await page.getByLabel("Cách gửi").selectOption("scheduled");
  await page.getByLabel("Giao thư lúc").fill("2001-01-01T08:00");
  await page.getByRole("button", { name: "Niêm phong và gửi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("tương lai");
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toBeEnabled();
  await page.getByLabel("Nội dung thư", { exact: true }).fill("Chữ sửa cuối vẫn còn");
  await page.getByRole("button", { name: "Cất bản nháp", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Viết thư" }).click();
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toHaveValue("Chữ sửa cuối vẫn còn");
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toBeEnabled();
});
test("actual mailbox keeps sealed body absent, opens via receipt and supports keyboard/mobile", async ({ page, context }) => {
  const hint = clue(); const body = `Riêng cho Cú ${randomUUID()}\nMột chiếc lá của Thỏ.`;
  await visit(page); await compose(page, hint, body); const id = await send(page);
  const partner = await context.newPage(); await visit(partner, 1);
  const projection = await partner.request.get(`${fixture}/api/letters/read?actor=1&id=${id}`);
  expect(await projection.text()).not.toContain(body.split("\n")[0]!);
  await envelope(partner, hint);
  await expect(partner.getByText("Nội dung còn được niêm phong.", { exact: true })).toBeVisible();
  await expect(partner.getByText(body, { exact: true })).toHaveCount(0);
  await partner.getByRole("button", { name: "Mở lá thư", exact: true }).click();
  await expect(partner.locator(".letter-body")).toHaveText(body);
  expect(await partner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await partner.keyboard.press("Escape");
  await expect(partner.getByRole("dialog")).not.toBeVisible();
  await expect(partner.getByRole("button", { name: new RegExp(hint) })).toBeFocused();
  const authorProjection = await page.request.get(`${fixture}/api/letters/read?actor=0&id=${id}`);
  expect((await authorProjection.json()).letter).toMatchObject({ state: "sent", version: 1 });
  await partner.close();
});
test("joint letter waits for two explicit confirmations in one server session", async ({ page, context }) => {
  const hint = clue(); const body = `Một lá thư mở cùng ${randomUUID()}`;
  await visit(page); await compose(page, hint, body, true); await send(page);
  await envelope(page, hint);
  await page.getByRole("button", { name: "Vào phiên mở cùng nhau" }).click();
  await expect(page.getByText("Có 1/2 người trong phiên này.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mình sẵn sàng mở" }).click();
  const partner = await context.newPage(); await visit(partner, 1); await envelope(partner, hint);
  await expect(partner.locator(".letter-body")).toHaveCount(0);
  await partner.getByRole("button", { name: "Vào phiên mở cùng nhau" }).click();
  await expect(partner.getByText("Có 2/2 người trong phiên này.", { exact: true })).toBeVisible();
  await partner.getByRole("button", { name: "Mình sẵn sàng mở" }).click();
  await expect(partner.locator(".letter-body")).toHaveText(body);
  await partner.close();
});
test("scheduled composer persists a timezone and recipient gets no envelope before DB delivery", async ({ page, context }) => {
  const hint = clue(); const body = `Hẹn giao riêng ${randomUUID()}`;
  await visit(page); await compose(page, hint, body);
  await page.getByLabel("Cách gửi", { exact: true }).selectOption("scheduled");
  await page.getByLabel("Giao thư lúc", { exact: true }).fill("2027-01-10T08:00");
  await page.getByLabel("Múi giờ giao thư", { exact: true }).fill("Asia/Ho_Chi_Minh");
  const id = await send(page);
  await envelope(page, hint); await expect(page.getByText(/Asia\/Ho_Chi_Minh/u)).toBeVisible();
  const partner = await context.newPage(); await visit(partner, 1);
  await expect(partner.getByRole("button", { name: new RegExp(hint) })).toHaveCount(0);
  await page.request.post(`${fixture}/api/letters/control`, { data: { letterId: id, due: true } });
  await partner.getByRole("button", { name: "Làm mới hòm thư" }).click(); await envelope(partner, hint);
  await expect(partner.getByText("Nội dung còn được niêm phong.", { exact: true })).toBeVisible();
  await expect(partner.locator(".letter-body")).toHaveCount(0); await partner.close();
});
test("lost acknowledgement survives reload and retries the exact request once", async ({ page }) => {
  const hint = clue(); const requests: unknown[] = []; let lose = true;
  await page.route("**/api/letters/apply?actor=0", async route => {
    requests.push(route.request().postDataJSON()); const response = await route.fetch();
    if (lose) { lose = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Acknowledgement lost" }) }); }
    else await route.fulfill({ response });
  });
  await visit(page); await compose(page, hint, "Giữ đúng lần gửi này");
  await page.getByRole("button", { name: "Niêm phong và gửi", exact: true }).click();
  await expect(page.getByText(/Chưa nhận được xác nhận gửi/u)).toBeVisible();
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByRole("button", { name: "Viết thư" })).toBeEnabled();
  await page.getByRole("button", { name: "Viết thư" }).click();
  await page.getByRole("button", { name: "Thử gửi lại lá thư này" }).click();
  await expect(page.getByText("Đã gửi lá thư vào Nhà.", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  await expect(page.getByRole("button", { name: new RegExp(hint) })).toHaveCount(1);
});
test("offline drafts survive reload and logout immediately closes authorized content", async ({ page, context }) => {
  const hint = clue(); const body = `Một bản nháp riêng ${randomUUID()}`;
  await visit(page); await context.setOffline(true); await compose(page, hint, body);
  await expect(page.getByRole("button", { name: "Niêm phong và gửi", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cất bản nháp", exact: true }).click();
  await context.setOffline(false); await page.reload(); await expect(page.getByRole("button", { name: "Viết thư" })).toBeEnabled();
  await page.getByRole("button", { name: "Viết thư" }).click();
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toHaveValue(body);
  await send(page); await envelope(page, hint); await expect(page.locator(".letter-body")).toHaveText(body);
  await page.evaluate(async () => (window as unknown as { lettersUiHarness: { logout(): Promise<void> } }).lettersUiHarness.logout());
  await expect(page.getByRole("heading", { name: "Cần xác nhận lại quyền vào Nhà." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText(body, { exact: true })).toHaveCount(0);
});
test("concurrent local composers preserve both drafts without overwriting", async ({ page, context }) => {
  await visit(page); const second = await context.newPage(); await visit(second);
  await compose(page, clue(), "Bản đang viết trong cửa sổ thứ nhất");
  await page.getByRole("button", { name: "Cất bản nháp", exact: true }).click();
  await compose(second, clue(), "Bản đang viết trong cửa sổ thứ hai");
  await expect(second.getByText("Một cửa sổ khác đã lưu bản nháp này. Bản bạn đang viết vẫn ở đây.", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Lưu bản này thành nháp riêng" }).click();
  await expect(second.getByRole("button", { name: "Niêm phong và gửi", exact: true })).toBeEnabled();
  await second.getByRole("button", { name: "Cất bản nháp", exact: true }).click(); await second.close();
  await page.reload(); await expect(page.getByRole("button", { name: "Viết thư" })).toBeEnabled();
  await page.getByRole("button", { name: "Viết thư" }).click();
  const picker = page.getByLabel("Bản nháp trên thiết bị", { exact: true });
  await expect(picker).toBeVisible();
  await picker.selectOption({ label: "Bản đang viết trong cửa sổ thứ nhất" });
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toHaveValue("Bản đang viết trong cửa sổ thứ nhất");
  await picker.selectOption({ label: "Bản đang viết trong cửa sổ thứ hai" });
  await expect(page.getByLabel("Nội dung thư", { exact: true })).toHaveValue("Bản đang viết trong cửa sổ thứ hai");
});
test("late sealed heartbeat and stale mailbox cannot undo a confirmed joint opening", async ({ page, context }) => {
  const hint = clue(); const body = `Giữ nguyên thư đã mở ${randomUUID()}`;
  await visit(page); await compose(page, hint, body, true); await send(page); await envelope(page, hint);
  await page.getByRole("button", { name: "Vào phiên mở cùng nhau" }).click();
  await page.getByRole("button", { name: "Mình sẵn sàng mở" }).click();
  const partner = await context.newPage(); await visit(partner, 1);
  const sealedList = await (await partner.request.get(`${fixture}/api/letters/list?actor=1`)).json();
  await envelope(partner, hint);
  let release = () => {}; let held = () => {}; let completed = () => {};
  const releaseResponse = new Promise<void>(resolve => { release = resolve; });
  const heartbeatHeld = new Promise<void>(resolve => { held = resolve; });
  const heartbeatComplete = new Promise<void>(resolve => { completed = resolve; });
  let hold = true;
  await partner.route("**/api/letters/reveal?actor=1", async route => {
    const command = route.request().postDataJSON(); const response = await route.fetch();
    if (command.kind === "heartbeat" && hold) { hold = false; held(); await releaseResponse; await route.fulfill({ response }); completed(); }
    else await route.fulfill({ response });
  });
  try {
    await partner.getByRole("button", { name: "Vào phiên mở cùng nhau" }).click(); await heartbeatHeld;
    await partner.getByRole("button", { name: "Mình sẵn sàng mở" }).click();
    await expect(partner.locator(".letter-body")).toHaveText(body);
    release(); await heartbeatComplete;
    await expect(partner.locator(".letter-body")).toHaveText(body);
    await expect(partner.getByText("Nội dung còn được niêm phong.", { exact: true })).toHaveCount(0);
    await partner.getByRole("button", { name: "Cất thư lại", exact: true }).click();
    await partner.route("**/api/letters/list?actor=1", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sealedList) }));
    const response = partner.waitForResponse(result => result.url().includes("/api/letters/list?actor=1"));
    await partner.getByRole("button", { name: "Làm mới hòm thư" }).click(); await response;
    await expect(partner.getByRole("button", { name: new RegExp(hint) })).toContainText("Có thể đọc lại");
  } finally { release(); await partner.close(); }
});
