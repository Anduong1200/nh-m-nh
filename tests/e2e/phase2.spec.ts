import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const fixture = "http://127.0.0.1:3102";
function room(session: string, actor = 0) { return `${fixture}/?session=${session}&actor=${actor}`; }

test("Home status can be shared, expired manually and discovered on a second device", async ({ page, context }) => {
  const session = randomUUID();
  const partner = await context.newPage();
  await page.goto(room(session));
  await partner.goto(room(session, 1));
  await expect(page.getByRole("heading", { name: "Về Nhà rồi." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Trạng thái của mình", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hôm nay, mình thế nào?" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Một dòng để lại").fill("Tối mình ghé cùng một tách trà.");
  await dialog.getByLabel("Mình cần một chút").fill("Một cái ôm");
  await dialog.getByLabel("Hiển thị đến khi").selectOption("manual");
  await dialog.getByRole("button", { name: "Lưu trạng thái", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(partner.getByText("Tối mình ghé cùng một tách trà.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trạng thái của mình", exact: true }).click();
  await dialog.getByRole("button", { name: "Xóa trạng thái của mình" }).click();
  await expect(partner.getByText("Tối mình ghé cùng một tách trà.", { exact: true })).toHaveCount(0);
  await page.getByLabel("Chọn giao diện ánh sáng").selectOption("night");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
});

test("an offline draft survives polling and closing the dialog during the visit", async ({ page, context }) => {
  await page.goto(room(randomUUID()));
  const opener = page.getByRole("button", { name: "Trạng thái của mình", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Hôm nay, mình thế nào?" });
  await dialog.getByLabel("Một dòng để lại").fill("Bản còn đang viết");
  await context.setOffline(true);
  await expect(dialog.getByRole("button", { name: "Lưu trạng thái", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByLabel("Một dòng để lại")).toHaveValue("Bản còn đang viết");
  await context.setOffline(false);
  await expect(dialog.getByRole("button", { name: "Lưu trạng thái", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Lưu trạng thái", exact: true }).click();
  await expect(page.getByText("Bản còn đang viết", { exact: true })).toBeVisible();
});

test("another device causes an explicit conflict without losing the draft", async ({ page, context }) => {
  const session = randomUUID();
  const secondDevice = await context.newPage();
  await page.goto(room(session));
  await secondDevice.goto(room(session));
  const button = { name: "Trạng thái của mình", exact: true };
  await page.getByRole("button", button).click();
  await page.getByLabel("Một dòng để lại").fill("Bản muốn giữ");
  await secondDevice.getByRole("button", button).click();
  await secondDevice.getByLabel("Một dòng để lại").fill("Bản từ thiết bị khác");
  await secondDevice.getByRole("button", { name: "Lưu trạng thái", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hôm nay, mình thế nào?" });
  await dialog.getByRole("button", { name: "Lưu trạng thái", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("thiết bị khác");
  await expect(dialog.getByLabel("Một dòng để lại")).toHaveValue("Bản muốn giữ");
  await expect(dialog.getByRole("button", { name: "Lưu trạng thái", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Giữ bản đang viết để thay bản hiện tại" }).click();
  await dialog.getByRole("button", { name: "Lưu trạng thái", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(secondDevice.getByText("Bản muốn giữ", { exact: true })).toBeVisible();
});

test("Knock retries keep one artifact and notification preview is generic by default", async ({ page, context, request }) => {
  const session = randomUUID();
  const partner = await context.newPage();
  await page.goto(room(session));
  await partner.goto(room(session, 1));
  await request.post(`${fixture}/api/control?session=${session}`, { data: { loseKnockAcknowledgement: true } });
  await page.getByRole("button", { name: "Gõ cửa một chút", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Gõ cửa một chút" });
  await dialog.getByLabel(/^Lời nhắn/).fill("Điều riêng tư trong tách trà");
  await dialog.getByRole("button", { name: "Để lại cú gõ" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel(/^Lời nhắn/)).toBeDisabled();
  await dialog.getByRole("button", { name: "Thử gửi lại cú gõ này" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(partner.getByText("Điều riêng tư trong tách trà", { exact: true })).toBeVisible();
  await expect(partner.locator(".home-generic-notice")).toHaveText("Có một cú gõ cửa trong Nhà.");
  await expect(partner.locator(".home-knock-item")).toHaveCount(1);
  await partner.getByRole("button", { name: "Cất cú gõ khỏi góc của bạn" }).click();
  await expect(partner.locator(".home-knock-item")).toHaveCount(0);
});

test("notification preferences explain foreground limits and preserve private defaults", async ({ page }) => {
  await page.goto(room(randomUUID()));
  await page.getByRole("button", { name: "Nhịp thông báo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Theo nhịp của mình" });
  await expect(dialog.getByLabel(/Hiện lời nhắn hoặc nhãn dán/)).not.toBeChecked();
  await expect(dialog.getByText(/Chưa có thông báo nền khi đóng ứng dụng/)).toBeVisible();
  await dialog.getByLabel("Dành một khoảng giờ yên tĩnh").check();
  await dialog.getByLabel("Từ lúc").fill("22:00");
  await dialog.getByLabel("Đến lúc").fill("07:00");
  await dialog.getByLabel("Múi giờ cho giờ yên tĩnh").fill("Asia/Ho_Chi_Minh");
  await dialog.getByRole("button", { name: "Lưu nhịp thông báo" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Nhịp thông báo", exact: true }).click();
  await expect(dialog.getByLabel("Dành một khoảng giờ yên tĩnh")).toBeChecked();
  await expect(dialog.getByLabel(/Hiện lời nhắn hoặc nhãn dán/)).not.toBeChecked();
});

test("browser notification needs explicit permission and never includes private text by default", async ({ page, context }) => {
  const session = randomUUID();
  await page.addInitScript(() => {
    Reflect.set(window, "__noticeRequests", 0);
    Reflect.set(window, "__notices", []);
    class FixtureNotification {
      static permission = "default";
      static async requestPermission() {
        Reflect.set(window, "__noticeRequests", Reflect.get(window, "__noticeRequests") + 1);
        this.permission = "granted";
        return "granted";
      }
      constructor(title: string, options: NotificationOptions) {
        Reflect.get(window, "__notices").push({ title, body: options.body });
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: FixtureNotification });
  });
  await page.goto(room(session, 1));
  const sender = await context.newPage();
  await sender.goto(room(session));
  await sender.getByRole("button", { name: "Gõ cửa một chút", exact: true }).click();
  await sender.getByLabel(/^Lời nhắn/).fill("Lời đầu riêng tư");
  await sender.getByRole("button", { name: "Để lại cú gõ" }).click();
  await expect(page.getByText("Lời đầu riêng tư", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__noticeRequests"))).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, "__notices"))).toEqual([]);
  await page.getByRole("button", { name: "Nhịp thông báo", exact: true }).click();
  await page.getByRole("button", { name: "Cho phép thông báo khi Nhà đang mở" }).click();
  expect(await page.evaluate(() => Reflect.get(window, "__noticeRequests"))).toBe(1);
  await page.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await sender.getByRole("button", { name: "Gõ cửa một chút", exact: true }).click();
  await sender.getByLabel(/^Lời nhắn/).fill("Lời thứ hai riêng tư");
  await sender.getByRole("button", { name: "Để lại cú gõ" }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__notices"))).toEqual([{ title: "Nhà Mình", body: "Có một cú gõ cửa trong Nhà." }]);
});

test("private routes fail closed before Supabase is configured", async ({ page, request }) => {
  await page.goto("/house");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await expect(page.getByRole("button", { name: /Google/ })).toBeDisabled();
  const response = await request.get("/house/state");
  expect([401, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("statuses");
  const token = "ab".repeat(32);
  await page.goto(`/house/join?token=${token}`);
  const target = new URL(page.url());
  expect(target.pathname).toBe("/auth/sign-in");
  expect(target.searchParams.get("next")).toBe(`/house/join?token=${token}`);
});
