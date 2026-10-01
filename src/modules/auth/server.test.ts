import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createServerClient,
}));

import {
  AuthenticationRequiredError,
  getVerifiedUser,
  requireVerifiedUser,
} from "./server";

beforeEach(() => {
  mocks.createServerClient.mockResolvedValue({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  });
  // An attacker-controlled cookie may claim a user; this is never consulted.
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "forged-user" } } },
    error: null,
  });
});

describe("verified server identity", () => {
  it("uses the fresh Auth-server user instead of cookie session data", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "verified-user" } },
      error: null,
    });
    expect(await requireVerifiedUser()).toEqual({ id: "verified-user" });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("denies a forged cookie when Auth verification fails", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("denies identity even if a failed response contains a user object", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "unverified-user" } },
      error: { message: "Verification failed" },
    });
    expect(await getVerifiedUser()).toBeNull();
  });

  it("denies unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it("does not grant access when verification is unavailable", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("Auth unavailable"));
    await expect(requireVerifiedUser()).rejects.toThrow("Auth unavailable");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
