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
    expect(keys.every((key) => key === "/offline.html" || key === "/offline" || key.startsWith("/icons/") || key.startsWith("/_next/static/") || key.startsWith("/vendor/excalidraw-0.18.1/fonts/Excalifont/"))).toBe(true);
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

test("cold offline recovery preserves a cached memory and queues a note, then closes on denied reconnect", async ({ page, baseURL }) => {
  test.setTimeout(60000);
  if (!baseURL) throw new Error("Production server required");
  const origin = await temporaryOrigin(baseURL, new Map([["/house/state", { status: 401, body: { error: "Test-owned expired session" } }]]));
  try {
    await page.goto(origin.url + "/offline");
    await expect(page.getByText(/Chưa có không gian đã xác nhận/)).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      // Seed a test-owned local account only. No auth cookie, token or server bypass.
      const opened = indexedDB.open("nha-minh-offline-v1", 4);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { opened.onsuccess = () => resolve(opened.result); opened.onerror = () => reject(opened.error); });
      const accountId = "11111111-1111-4111-8111-111111111111", houseId = "33333333-3333-4333-8333-333333333333", id = "55555555-5555-4555-8555-555555555555", now = new Date().toISOString();
      const tx = db.transaction(["recovery", "recent"], "readwrite");
      tx.objectStore("recovery").put({ accountId, houseId, displayName: "Thỏ thử nghiệm", houseName: "Nhà thử nghiệm", verifiedAt: now, epoch: 0 }, "active");
      tx.objectStore("recent").put({ accountId, houseId, schemaVersion: 1, kind: "island", id: `island-entry:${id}`, serverVersion: 1, cachedAt: now, payload: { id, houseId, createdBy: accountId, entryType: "memory", title: "Kỷ niệm lưu gần đây", body: "Một buổi trà nhỏ", occurredOn: "2026-10-03", sourceSessionId: null, version: 1, createdAt: now, updatedAt: now, trashedAt: null } });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    });
    await origin.stop(); await page.reload();
    await expect(page.getByRole("button", { name: "Mở bản đã lưu", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Mở bản đã lưu", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kỷ niệm lưu gần đây", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ghi chú / doodle trên Bảng", exact: true }).click();
    await page.getByRole("button", { name: "+ Thêm ghi chú", exact: true }).click();
    await page.getByRole("textbox", { name: "Nội dung ghi chú", exact: true }).fill("Bản nháp khi đóng server");
    await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
    await expect(page.getByText(/chờ đồng bộ/, { exact: false })).toBeVisible();
    await page.reload(); await page.getByRole("button", { name: "Mở bản đã lưu", exact: true }).click();
    await page.getByRole("button", { name: "Ghi chú / doodle trên Bảng", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Nội dung ghi chú", exact: true })).toHaveValue("Bản nháp khi đóng server");
    await origin.restart();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    // The test origin denies the expired session. Local drafts remain intact.
    await expect(page.getByText("Cần đăng nhập đúng tài khoản và Nhà để mở lại. Bản nháp vẫn được giữ.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Nội dung ghi chú", exact: true })).toHaveCount(0);
    const queued = await page.evaluate(async () => {
      const opened = indexedDB.open("nha-minh-offline-v1", 4); const db = await new Promise<IDBDatabase>(resolve => { opened.onsuccess = () => resolve(opened.result); });
      const request = db.transaction("operations").objectStore("operations").getAll(); const rows = await new Promise<unknown[]>(resolve => { request.onsuccess = () => resolve(request.result); }); db.close(); return rows;
    });
    expect(queued.length).toBeGreaterThan(0);
  } finally { await origin.stop(); }
});
