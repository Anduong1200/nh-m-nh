import { expect, test } from "@playwright/test";

test("new private rooms redirect unauthenticated visitors before returning any content", async ({ page }) => {
  for (const room of ["/board", "/whiteboard", "/games", "/letters", "/island"]) {
    await page.goto(room);
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
test("private photo endpoint fails closed and forbids response caching", async ({ request }) => {
  const response = await request.get("/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?house=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await response.body()).toHaveLength(0);
});
