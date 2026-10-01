import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createBrowserClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

import { createSupabaseBrowserClient } from "./client";

afterEach(() => vi.unstubAllEnvs());

describe("browser client security boundary", () => {
  it.each([
    ["production", true],
    ["development", false],
  ] as const)("uses Secure cookies in %s according to the deployment mode", (mode, secure) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_test_not_a_real_credential",
    );
    createSupabaseBrowserClient();
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test_not_a_real_credential",
      expect.objectContaining({
        cookieOptions: { path: "/", sameSite: "lax", secure },
      }),
    );
  });

  it("uses the public allowlist even when a server secret is present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_test_not_a_real_credential",
    );
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-value");
    createSupabaseBrowserClient();
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test_not_a_real_credential",
      expect.objectContaining({ cookieOptions: expect.any(Object) }),
    );
    expect(JSON.stringify(mocks.createBrowserClient.mock.calls)).not.toContain(
      "private-test-value",
    );
  });

  it("rejects a secret key before passing it to the browser SDK", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_private_value");
    expect(() => createSupabaseBrowserClient()).toThrow(
      "must be a modern sb_publishable_ key",
    );
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("fails closed while the bootstrap is unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createSupabaseBrowserClient()).toThrow(
      "Supabase is not configured",
    );
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });
});
