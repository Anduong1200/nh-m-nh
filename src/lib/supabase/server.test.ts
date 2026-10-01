import type { CookieOptions } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  getAll: vi.fn(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { createSupabaseServerClient } from "./server";

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
  mocks.getAll.mockReturnValue([{ name: "auth-cookie", value: "request-token" }]);
  mocks.cookies.mockResolvedValue({ getAll: mocks.getAll, set: mocks.set });
  mocks.createServerClient.mockReturnValue({ auth: {} });
});

afterEach(() => vi.unstubAllEnvs());

describe("request-scoped server client", () => {
  it("awaits Next.js cookies and uses the incoming request's cookies", async () => {
    await createSupabaseServerClient();
    expect(mocks.cookies).toHaveBeenCalledOnce();
    expect(adapter().getAll()).toEqual([
      { name: "auth-cookie", value: "request-token" },
    ]);
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test_not_a_real_credential",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("creates a separate client for each request", async () => {
    await createSupabaseServerClient();
    await createSupabaseServerClient();
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    expect(mocks.cookies).toHaveBeenCalledTimes(2);
  });

  it("does not attempt cookie writes in a Server Component", async () => {
    await createSupabaseServerClient();
    adapter().setAll([
      { name: "auth-cookie", value: "refresh", options: { path: "/" } },
    ]);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("persists cookies in an explicitly writable action/route context", async () => {
    await createSupabaseServerClient("read-write");
    const options = { path: "/", sameSite: "lax" as const, secure: true };
    adapter().setAll([{ name: "auth-cookie", value: "refresh", options }]);
    expect(mocks.set).toHaveBeenCalledWith("auth-cookie", "refresh", options);
  });

  it("does not hide a failed write in an action/route context", async () => {
    await createSupabaseServerClient("read-write");
    mocks.set.mockImplementationOnce(() => {
      throw new Error("Cookie writes unavailable");
    });
    expect(() =>
      adapter().setAll([
        { name: "auth-cookie", value: "refresh", options: {} },
      ]),
    ).toThrow("Cookie writes unavailable");
  });

  it("cannot create a client without complete public configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(createSupabaseServerClient()).rejects.toThrow(
      "Supabase is not configured",
    );
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
