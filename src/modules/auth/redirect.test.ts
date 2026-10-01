import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "./redirect";

describe("OAuth redirect boundary", () => {
  it.each([null, "https://evil.example", "//evil.example", "/\\evil.example", "/house/../../outside", "javascript:alert(1)", "/house%2f..%2foutside", "/auth/callback"])("rejects external or unknown destination %s", (value) => {
    expect(safeAuthRedirect(value)).toBe("/house");
  });
  it("retains only a valid pairing token on the internal join route", () => {
    const token = "ab".repeat(32);
    expect(safeAuthRedirect(`/house/join?token=${token}&external=https://evil.example#x`)).toBe(`/house/join?token=${token}`);
    expect(safeAuthRedirect("/house/join?token=short")).toBe("/house/join");
    expect(safeAuthRedirect("/house/setup?next=//evil.example")).toBe("/house/setup");
  });
});
