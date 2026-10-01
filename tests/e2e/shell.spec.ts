import { expect, test } from "@playwright/test";

test("welcome is honest, responsive and keyboard accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/Nhà Mình/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Một góc nhỏ.");
  await expect(page.getByText("Sẵn sàng về Nhà?")).toBeVisible();
  await expect(page.getByText("Minh họa", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toHaveAttribute("href", "/auth/sign-in");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /nội dung chính/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(errors).toEqual([]);
});

test("connection status updates gently without requiring a reply", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toHaveText("Đang ngoại tuyến. Bạn có thể kết nối lại khi thuận tiện.");
  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("day and night preference persists without private data", async ({ page }) => {
  await page.goto("/");
  const theme = page.getByLabel("Chọn giao diện ánh sáng");
  await theme.selectOption("night");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.reload();
  await expect(theme).toHaveValue("night");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await theme.selectOption("day");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
});

test("automatic light follows the local clock and reduced motion is respected", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-01T12:00:00") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
  await page.clock.setSystemTime(new Date("2026-10-01T23:00:00"));
  await page.clock.runFor(60_001);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("manifest, icons and worker have installable public metadata", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toContain("Nhà Mình");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.lang).toBe("vi");
  for (const size of ["192x192", "512x512"]) {
    expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === size)).toBe(true);
  }
  for (const icon of manifest.icons as { src: string }[]) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
  }
  const worker = await request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
});

test("not found is clear and returns to the public shell", async ({ page }) => {
  const response = await page.goto("/unknown-room");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Về/ }).click();
  await expect(page).toHaveURL("/");
});
