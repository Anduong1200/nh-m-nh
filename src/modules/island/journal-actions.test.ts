import { beforeEach, expect, it, vi } from "vitest";
import { gameActors, gameHouse } from "@/modules/games/test-fixtures";
import { applyIslandEntryAction, readIslandEntryAction, readIslandJournalAction } from "./journal-actions";
import type { IslandEntry, IslandEntryCommand } from "./journal";
const m = vi.hoisted(() => ({ user: vi.fn(), house: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/modules/auth/server", () => ({ requireVerifiedUser: m.user }));
vi.mock("@/modules/houses/server", () => ({ getMyHouse: m.house }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.client }));
const context = { accountId: gameActors[0], houseId: gameHouse };
const entry: IslandEntry = { id: "55555555-5555-4555-8555-555555555555", houseId: gameHouse, createdBy: gameActors[0], entryType: "milestone", title: "Một ngày", body: "", occurredOn: "2020-02-29", sourceSessionId: null, version: 1, createdAt: "2026-10-03T10:00:00Z", updatedAt: "2026-10-03T10:00:00Z", trashedAt: null };
const command: IslandEntryCommand = { operationId: "66666666-6666-4666-8666-666666666666", entryId: entry.id, expectedVersion: 0, kind: "create", payload: { entryType: "milestone", title: entry.title, body: entry.body, occurredOn: entry.occurredOn, sourceSessionId: null, confirmed: false } };
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: context.accountId }); m.house.mockResolvedValue({ id: gameHouse, members: gameActors.map(user_id => ({ user_id })) }); m.client.mockResolvedValue({ rpc: m.rpc }); m.rpc.mockResolvedValue({ data: { entries: [entry], next: null }, error: null }); });
it("binds reads to verified active paired membership and validates pagination", async () => {
  expect((await readIslandJournalAction(context)).page?.entries[0]?.id).toBe(entry.id);
  expect(m.rpc).toHaveBeenCalledWith("get_island_entries", { p_house_id: gameHouse, p_before_created_at: null, p_before_id: null });
  expect((await readIslandJournalAction(context, { id: "bad", createdAt: "bad" })).page).toBeUndefined();
  m.rpc.mockResolvedValue({ data: entry, error: null }); expect((await readIslandEntryAction(entry.id, context)).entry?.id).toBe(entry.id);
});
it("rejects stale actor/House or unpaired context before any database reads or writes", async () => {
  for (const input of [null, { ...context, accountId: gameActors[1] }, { ...context, houseId: crypto.randomUUID() }]) { expect((await applyIslandEntryAction(command, input)).blocked).toBe(true); expect((await readIslandJournalAction(input)).blocked).toBe(true); }
  m.house.mockResolvedValue({ id: gameHouse, members: [{ user_id: context.accountId }] }); expect((await applyIslandEntryAction(command, context)).blocked).toBe(true); expect(m.rpc).not.toHaveBeenCalled();
});
it("uses the RLS client and returns only a verified immutable mutation receipt", async () => {
  m.rpc.mockResolvedValue({ data: { operationId: command.operationId, entryId: entry.id, outcome: "applied", entry }, error: null });
  expect((await applyIslandEntryAction(command, context)).receipt?.entry.id).toBe(entry.id); expect(m.client).toHaveBeenCalledWith("read-write");
  expect(m.rpc).toHaveBeenCalledWith("apply_island_entry_command", { p_house_id: gameHouse, p_command: command });
  m.rpc.mockResolvedValue({ data: { operationId: command.operationId, entryId: entry.id, outcome: "applied", entry: { ...entry, createdBy: gameActors[1] } }, error: null }); expect((await applyIslandEntryAction(command, context)).receipt).toBeUndefined();
});
it("keeps internal failures private and distinguishes duplicate-source rejection from unknown send", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "private row content" } }); const duplicate = await applyIslandEntryAction(command, context); expect(duplicate.rejected).toBe(true); expect(JSON.stringify(duplicate)).not.toContain("private");
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private policy" } }); expect((await readIslandJournalAction(context)).blocked).toBe(true);
  m.user.mockRejectedValue(new Error("token")); expect(JSON.stringify(await applyIslandEntryAction(command, context))).not.toContain("token");
});
