import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), exchange: vi.fn(), getUser: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
import { GET } from "./route";
beforeEach(() => {
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "actor", user_metadata: { name: "Lan" } } }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.getUser }, from: () => ({ upsert: mocks.upsert }) });
});
describe("OAuth callback navigation", () => {
  it("retains a valid pairing destination after exchanging the real auth code", async () => {
    const next = `/house/join?token=${"ab".repeat(32)}`;
    const response = await GET(new Request(`https://nha-minh.example/auth/callback?code=one-time-code&next=${encodeURIComponent(next)}`));
    expect(mocks.exchange).toHaveBeenCalledWith("one-time-code");
    expect(response.headers.get("location")).toBe(`https://nha-minh.example${next}`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("keeps retry destination when code exchange fails without exposing errors", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "private code diagnostic" } });
    const next = `/house/join?token=${"ab".repeat(32)}`;
    const response = await GET(new Request(`https://nha-minh.example/auth/callback?code=invalid&next=${encodeURIComponent(next)}`));
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/auth/sign-in");
    expect(target.searchParams.get("next")).toBe(next);
    expect(target.searchParams.get("error")).toBe("auth_failed");
    expect(target.toString()).not.toContain("private");
  });
  it("rejects external next destinations", async () => {
    const response = await GET(new Request("https://nha-minh.example/auth/callback?code=one-time&next=//outside.example"));
    expect(response.headers.get("location")).toBe("https://nha-minh.example/house");
  });
});
