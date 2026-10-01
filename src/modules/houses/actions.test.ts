import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requireUser: vi.fn(), rpc: vi.fn(), signOut: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: mocks.requireUser }));
import { acceptPairingInviteAction, createPairingInviteAction, signOutAction } from "./actions";

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: "actor" });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, auth: { signOut: mocks.signOut } });
  mocks.rpc.mockResolvedValue({ data: "house", error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
describe("pairing action boundary", () => {
  it("stores only the hash and leaves House identity resolution to the transaction", async () => {
    const result = await createPairingInviteAction();
    expect(result.inviteToken).toMatch(/^[a-f0-9]{64}$/);
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(result.inviteToken));
    const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(mocks.rpc).toHaveBeenCalledWith("create_pairing_invite", { p_token_hash: hash, p_expires_at: expect.any(String) });
    expect(hash).not.toBe(result.inviteToken);
  });
  it("rejects malformed raw invite tokens before database calls", async () => {
    expect((await acceptPairingInviteAction("not-a-token")).error).toBeTruthy();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not expose private PostgreSQL diagnostics", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private host and row contents" } });
    expect((await createPairingInviteAction()).error).not.toContain("private host");
  });
});
describe("logout session handling", () => {
  it("invalidates private router state after successful signout", async () => {
    await signOutAction();
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
  it("reports failure without redirecting as if signout succeeded", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "private detail" } });
    await expect(signOutAction()).rejects.toThrow("Chưa thể đăng xuất");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
