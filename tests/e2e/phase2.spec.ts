import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const fixture = "http://127.0.0.1:3103";
function room(session: string, actor = 0) { return `${fixture}/?session=${session}&actor=${actor}`; }

test("Vietnamese headings load locally and room labels keep both mascots visible", async ({ page }) => {
  await page.goto(room(randomUUID()));
  await expect(page.getByRole("heading", { name: "Về Nhà rồi." })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const headingFont = await page.locator(".home-introduction h1").evaluate((heading) => {
    const family = getComputedStyle(heading).fontFamily.split(",")[0];
    if (!family) throw new Error("Heading has no font family.");
    const loadedFace = [...document.fonts].some((face) => face.family.replaceAll('"', "") === family.replaceAll('"', "") && face.status === "loaded");
    const localFontAsset = performance.getEntriesByType("resource").some((asset) => new URL(asset.name).origin === location.origin && /\/_next\/static\/media\/Lora-.*\.ttf$/.test(new URL(asset.name).pathname));
    return { loadedFace, localFontAsset, loaded: document.fonts.check(`30px ${family}`, "Về Nhà rồi. Trạng thái của mình") };
  });
  expect(headingFont.loadedFace).toBe(true);
  expect(headingFont.localFontAsset).toBe(true);
  expect(headingFont.loaded).toBe(true);

  for (const width of [1440, 980, 768, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["day", "night"]) {
      await page.getByLabel("Chọn giao diện ánh sáng").selectOption(theme);
      await expect.poll(() => page.locator(".home-interactive-room").evaluate((room) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--paper)";
        room.appendChild(probe);
        const settled = getComputedStyle(room).backgroundColor === getComputedStyle(probe).color;
        probe.remove();
        return settled;
      })).toBe(true);
      const textContrast = await page.evaluate(() => {
        const luminance = (color: string) => {
          const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((channel) => {
            const s = channel / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
        };
        return [...document.querySelectorAll(".home-person-name, #knock-container, .home-interactive-room h3, [aria-label='Gõ cửa một chút']")].map((node) => {
          let surface: Element | null = node;
          while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
          if (!surface) throw new Error("Text has no opaque background.");
          const a = luminance(getComputedStyle(node).color), b = luminance(getComputedStyle(surface).backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      });
      expect(textContrast.length).toBeGreaterThanOrEqual(5);
      textContrast.forEach((ratio) => expect(ratio, `${width}px ${theme} text contrast`).toBeGreaterThanOrEqual(4.5));
      await expect(page.locator("[data-mascot]")).toHaveCount(2);
      await expect(page.locator("[data-room-control]")).toHaveCount(4);
      const overlaps = await page.evaluate(() => {
        const mascots = [...document.querySelectorAll("[data-mascot]")];
        const labels = [...document.querySelectorAll("[data-room-control], [data-room-presence]")];
        return mascots.flatMap((mascot) => labels.flatMap((label) => {
          const a = mascot.getBoundingClientRect();
          const b = label.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
            ? [`${mascot.getAttribute("data-mascot")}: ${label.textContent}`] : [];
        }));
      });
      expect(overlaps, `${width}px ${theme}`).toEqual([]);
      const clippedMascots = await page.evaluate(() => {
        return [...document.querySelectorAll("[data-mascot]")].flatMap((mascot) => {
          const frame = mascot.getBoundingClientRect();
          const artwork = mascot.querySelector("[data-mascot-artwork]")?.getBoundingClientRect();
          return !artwork || artwork.width < 10 || artwork.height < 10 ||
            artwork.left < frame.left - 1 || artwork.right > frame.right + 1 ||
            artwork.top < frame.top - 1 || artwork.bottom > frame.bottom + 1
            ? [mascot.getAttribute("data-mascot")] : [];
        });
      });
      expect(clippedMascots, `${width}px ${theme} mascot artwork fits its viewport`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await page.locator("[data-room-control]").all()) {
        await expect(button).toBeVisible();
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

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
