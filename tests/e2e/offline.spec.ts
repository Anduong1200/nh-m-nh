import { expect, test } from "@playwright/test";
import { temporaryOrigin } from "./helpers/temporary-origin";

test("offline navigation uses a generic public shell and never caches private routes", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("The production server URL is required.");
  const origin = await temporaryOrigin(baseURL);
  try {
    await page.goto(origin.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      }
    });
    const keys = await page.evaluate(async () => {
      const result: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) result.push(new URL(request.url).pathname);
      }
      return result;
    });
    expect(keys).toContain("/offline.html");
    expect(keys.every((key) => key === "/offline.html" || key.startsWith("/icons/") || key.startsWith("/_next/static/"))).toBe(true);
    // Stop the actual origin: WebKit offline emulation rejects SW-served documents.
    // https://github.com/microsoft/playwright/issues/42775
    await origin.stop();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ngôi nhà vẫn ở đây.");
    await expect(page.getByText("Bạn cần kết nối để vào không gian riêng của hai đứa.")).toBeVisible();
    await origin.restart();
    await page.goto(origin.url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Một góc nhỏ.");
  } finally {
    await origin.stop();
  }
});
