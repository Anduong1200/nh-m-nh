import { expect, test, type Page } from "@playwright/test";
const fixture = "http://127.0.0.1:3103/?island=1";
async function call(page: Page, method: string, ...args: unknown[]) {
  return page.evaluate(async ({ method, args }) => (window as unknown as { islandHarness: Record<string, (...args: unknown[]) => unknown> }).islandHarness[method]!(...args), { method, args });
}
test.afterEach(async ({ page }) => { await call(page, "logout").catch(() => {}); });

test("Island renders real artifact links and clearly decorative future areas across viewports", async ({ page }) => {
  await page.goto(fixture);
  await expect(page.getByRole("heading", { name: "Hòn đảo của hai đứa" })).toBeVisible();
  const artifact = page.getByRole("link", { name: /Chuyện từng dòng Một chuyến đi nhỏ/ });
  await expect(artifact).toBeVisible();
  await expect(artifact).toHaveAttribute("href", /^\/games\?session=[0-9a-f-]{36}$/);
  await expect(page.getByText("🔥 Lửa trại · trang trí, chưa mở")).toBeVisible();
  await expect(page.getByText("🌸 Vườn · trang trí")).toBeVisible();
  await expect(page.getByText("Lần đầu ghép Nhà", { exact: true })).toHaveCount(0);
  const gamesEntry = page.getByRole("link", { name: "Ghé hộp trò chơi", exact: true });
  await expect(gamesEntry).toBeVisible();
  const colors = await gamesEntry.evaluate(element => { const style = getComputedStyle(element); return [style.color, style.backgroundColor]; });
  expect(colors[0]).not.toBe(colors[1]);
  for (const pin of await page.getByRole("link", { name: /Xem tác phẩm:/ }).all()) {
    const pinBox = await pin.boundingBox();
    expect(pinBox).not.toBeNull();
    for (const mascot of await page.locator("[data-mascot]").all()) {
      const mascotBox = await mascot.boundingBox();
      expect(mascotBox).not.toBeNull();
      if (pinBox && mascotBox) {
        const overlaps = pinBox.x < mascotBox.x + mascotBox.width && pinBox.x + pinBox.width > mascotBox.x && pinBox.y < mascotBox.y + mascotBox.height && pinBox.y + pinBox.height > mascotBox.y;
        expect(overlaps, "Artifact pins must leave the rabbit and owl visible").toBe(false);
      }
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("offline Island uses account cache and refreshes trusted history on reconnect", async ({ page, context }) => {
  await page.goto(fixture);
  await expect(page.getByRole("link", { name: /Chuyện từng dòng Một chuyến đi nhỏ/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Làm mới Đảo" })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText(/Đang xem bản đã lưu trên thiết bị/)).toBeVisible();
  await call(page, "complete");
  await expect(page.getByText("Một chiếc lá mới", { exact: true })).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByRole("link", { name: /Chuyện từng dòng Một chiếc lá mới/ })).toBeVisible();
  await expect(page.getByText(/Đang xem bản đã lưu trên thiết bị/)).toHaveCount(0);
});
test("failed reads preserve cache; logout clears private artifacts from both open tabs", async ({ page, context }) => {
  await page.goto(fixture);
  await expect(page.getByRole("link", { name: /Chuyện từng dòng Một chuyến đi nhỏ/ })).toBeVisible();
  await call(page, "fail", true);
  await page.getByRole("button", { name: "Làm mới Đảo" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: /Chuyện từng dòng Một chuyến đi nhỏ/ })).toBeVisible();
  const other = await context.newPage(); await other.goto(fixture);
  await expect(other.getByRole("link", { name: /Chuyện từng dòng Một chuyến đi nhỏ/ })).toBeVisible();
  await call(page, "logout");
  for (const open of [page, other]) {
    await expect(open.getByRole("link", { name: /Chuyện từng dòng/ })).toHaveCount(0);
    await expect(open.getByRole("button", { name: "Làm mới Đảo" })).toBeDisabled();
  }
  await other.close();
});
test("empty Island has no invented memories; revoked access cannot reopen cached history offline", async ({ page, context }) => {
  await page.goto(fixture + "&empty=1");
  await expect(page.getByText(/Đảo còn yên ắng/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Xem tác phẩm:/ })).toHaveCount(0);
  await call(page, "complete");
  await page.getByRole("button", { name: "Làm mới Đảo" }).click();
  await expect(page.getByRole("link", { name: /Chuyện từng dòng Một chiếc lá mới/ })).toBeVisible();
  await call(page, "block");
  await page.getByRole("button", { name: "Làm mới Đảo" }).click();
  await expect(page.getByRole("button", { name: "Làm mới Đảo" })).toBeDisabled();
  await context.setOffline(true);
  await expect(page.getByRole("link", { name: /Chuyện từng dòng/ })).toHaveCount(0);
  await context.setOffline(false);
});
