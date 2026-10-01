import { mkdir } from "node:fs/promises";
import { chromium, devices, expect, webkit } from "@playwright/test";

async function settleTheme(page) {
  await expect.poll(() => page.locator(".home-interactive-room").evaluate((room) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--paper)";
    room.appendChild(probe);
    const settled = getComputedStyle(room).backgroundColor === getComputedStyle(probe).color;
    probe.remove();
    return settled;
  })).toBe(true);
}

await mkdir("test-results/phase2-review", { recursive: true });
for (const [name, engine, options] of [
  ["desktop", chromium, { viewport: { width: 1440, height: 1000 } }],
  ["iphone", webkit, devices["iPhone 12"]],
]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage(options);
    await page.goto(`http://127.0.0.1:${process.env.NHA_MINH_UI_FIXTURE_PORT ?? 3102}/?session=visual-${name}-${Date.now()}`);
    await page.getByRole("heading", { name: "Về Nhà rồi." }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByLabel("Chọn giao diện ánh sáng").selectOption("day");
    await settleTheme(page);
    await page.screenshot({ path: `test-results/phase2-review/${name}-day.png`, fullPage: true });
    await page.getByLabel("Chọn giao diện ánh sáng").selectOption("night");
    await settleTheme(page);
    await page.screenshot({ path: `test-results/phase2-review/${name}-night.png`, fullPage: true });
    await page.getByRole("button", { name: "Trạng thái của mình", exact: true }).click();
    await page.screenshot({ path: `test-results/phase2-review/${name}-status.png`, fullPage: true });
    console.log(`${name}: reviewed captures ready`);
  } finally { await browser.close(); }
}
