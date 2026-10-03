import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
// The installed runtime retains this helper name for proxy matcher evaluation.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { updateSupabaseSession } from "./proxy";
import { config } from "@/proxy";

type Adapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    values: { name: string; value: string; options: CookieOptions }[],
  ) => void;
};

function adapter(): Adapter {
  return (mocks.createServerClient.mock.calls[0]?.[2] as { cookies: Adapter })
    .cookies;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_test_not_a_real_credential",
  );
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
});

afterEach(() => vi.unstubAllEnvs());

describe("auth refresh proxy", () => {
  it("refreshes every private room and photo route while excluding public assets", () => {
    for (const url of ["/house", "/auth/callback", "/games?session=example", "/letters", "/island", "/whiteboard", "/media/example"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    }
    for (const url of ["/", "/offline", "/sw.js", "/_next/static/chunk.js", "/vendor/excalidraw-0.18.1/fonts/font.woff2"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    }
  });

  it("persists photo-route refresh cookies without replacing its own denial response", async () => {
    const request = new NextRequest("https://nha-minh.example/media/example");
    mocks.getUser.mockImplementationOnce(async () => {
      adapter().setAll([{ name: "auth-cookie", value: "refreshed", options: { path: "/", sameSite: "lax", secure: true } }]);
      return { data: { user: null }, error: null };
    });
    const response = await updateSupabaseSession(request);
    expect(request.cookies.get("auth-cookie")?.value).toBe("refreshed");
    expect(response.cookies.get("auth-cookie")?.value).toBe("refreshed");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not create a Supabase client for the unconfigured bootstrap", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await updateSupabaseSession(
      new NextRequest("https://nha-minh.example/auth"),
    );
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses verified getUser and reads request cookies", async () => {
    const request = new NextRequest("https://nha-minh.example/house", {
      headers: { cookie: "auth-cookie=incoming" },
    });
    await updateSupabaseSession(request);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(adapter().getAll()).toEqual([
      { name: "auth-cookie", value: "incoming" },
    ]);
  });

  it("preserves all refresh batches in the request and final response", async () => {
    const request = new NextRequest("https://nha-minh.example/house");
    mocks.getUser.mockImplementationOnce(async () => {
      adapter().setAll([
        {
          name: "auth-cookie.0",
          value: "refreshed-first",
          options: { path: "/", sameSite: "lax", secure: true },
        },
      ]);
      adapter().setAll([
        {
          name: "auth-cookie.1",
          value: "refreshed-second",
          options: { path: "/", sameSite: "lax", secure: true },
        },
      ]);
      return { data: { user: { id: "verified" } }, error: null };
    });

    const response = await updateSupabaseSession(request);
    expect(request.cookies.get("auth-cookie.0")?.value).toBe("refreshed-first");
    expect(request.cookies.get("auth-cookie.1")?.value).toBe("refreshed-second");
    expect(response.cookies.get("auth-cookie.0")).toMatchObject({
      value: "refreshed-first",
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(response.cookies.get("auth-cookie.1")?.value).toBe("refreshed-second");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "auth-cookie.0=refreshed-first",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
  });

  it("does not hide a verification transport failure", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("Auth unavailable"));
    await expect(
      updateSupabaseSession(new NextRequest("https://nha-minh.example/house")),
    ).rejects.toThrow("Auth unavailable");
  });

  it("preserves a valid one-time invite when sign-in is needed", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const token = "ab".repeat(32);
    const response = await updateSupabaseSession(new NextRequest(`https://nha-minh.example/house/join?token=${token}&external=bad`));
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/auth/sign-in");
    expect(target.searchParams.get("next")).toBe(`/house/join?token=${token}`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("does not redirect the private JSON endpoint to an HTML page", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await updateSupabaseSession(new NextRequest("https://nha-minh.example/house/state"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
