import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), house: vi.fn(), client: vi.fn(), rpc: vi.fn(), list: vi.fn() }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: m.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: m.house }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.client }));
import { applyLetterCommandAction, applyLetterRevealAction, listLettersAction, readLetterAction } from "./actions";
import { letterTestCommand, letterTestContext as context, letterTestReceipt, letterTestSnapshot } from "./test-fixtures";
const command = letterTestCommand();
beforeEach(() => {
  vi.clearAllMocks(); m.user.mockResolvedValue({ id: context.accountId });
  m.house.mockResolvedValue({ id: context.houseId, members: [{ user_id: context.accountId }] });
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: m.list };
  m.client.mockResolvedValue({ rpc: m.rpc, from: () => chain }); m.list.mockResolvedValue({ data: [{ id: command.letterId }], error: null });
  m.rpc.mockImplementation(async name => ({ data: name === "get_letter" ? letterTestSnapshot(command) : letterTestReceipt(command), error: null }));
});
it("authenticates from server cookies and validates projected state/receipts", async () => {
  expect((await readLetterAction(command.letterId, context)).letter).toEqual(letterTestSnapshot(command));
  expect((await applyLetterCommandAction(command, context)).receipt).toEqual(letterTestReceipt(command));
  expect((await listLettersAction(context)).letters).toHaveLength(1);
});
it.each([null, { ...context, accountId: crypto.randomUUID() }, { ...context, houseId: crypto.randomUUID() }])("blocks stale identity %j", async stale => {
  expect((await readLetterAction(command.letterId, stale)).blocked).toBe(true);
  expect((await applyLetterCommandAction(command, stale)).blocked).toBe(true);
  expect((await applyLetterRevealAction({ kind: "join", letterId: command.letterId, sessionId: null }, stale)).blocked).toBe(true);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("returns no envelope before delivery and keeps errors generic", async () => {
  m.rpc.mockResolvedValue({ data: null, error: null }); expect((await readLetterAction(command.letterId, context)).letter).toBeNull();
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private content" } });
  const result = await readLetterAction(command.letterId, context); expect(result.blocked).toBe(true); expect(JSON.stringify(result)).not.toContain("content");
});
it("rejects invalid commands and premature body-bearing replies", async () => {
  expect((await applyLetterCommandAction({ ...command, senderId: context.accountId }, context)).receipt).toBeUndefined(); expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({ data: { ...letterTestSnapshot(command), houseId: crypto.randomUUID() }, error: null });
  expect((await readLetterAction(command.letterId, context)).letter).toBeUndefined();
});
it("verifies identity once and closes a list if any projection is unauthorized", async () => {
  const second = crypto.randomUUID(); m.list.mockResolvedValue({ data: [{ id: command.letterId }, { id: second }], error: null });
  expect((await listLettersAction(context)).letters).toBeUndefined(); expect(m.user).toHaveBeenCalledOnce(); expect(m.house).toHaveBeenCalledOnce();
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501" } }); expect((await listLettersAction(context)).blocked).toBe(true);
});
