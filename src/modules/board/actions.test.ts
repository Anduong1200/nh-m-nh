import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
import { appendBoardObjectAction, updateBoardObjectAction } from "./actions";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = { id, house_id: "11111111-1111-4111-8111-111111111111", created_by: "22222222-2222-4222-8222-222222222222",
  type: "note", payload: { text: "Ghi chú" }, x: "100", y: "100", rotation: "0", z_index: 0, version: 1,
  created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", deleted_at: null };
beforeEach(() => {
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: row, error: null });
});

// Integration compatibility checks for the shared Home boundary, not Board acceptance.
describe("Board RPC result compatibility", () => {
  it.each(["composite", "array"])("decodes a %s result without unsafe row casts", async (format) => {
    mocks.rpc.mockResolvedValue({ data: format === "array" ? [row] : row, error: null });
    expect((await appendBoardObjectAction({ id, type: "note", payload: row.payload })).item).toMatchObject({ id, x: 100, y: 100 });
  });
  it("decodes update results from a PostgreSQL composite row", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...row, version: 2 }, error: null });
    expect((await updateBoardObjectAction({ id, expectedVersion: 1, x: 100 })).item?.version).toBe(2);
  });
  it.each([null, {}, { ...row, x: "NaN" }, { ...row, id: "33333333-3333-4333-8333-333333333333" }])("rejects an unconfirmed response %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await appendBoardObjectAction({ id, type: "note", payload: row.payload })).toEqual({ error: "Chưa lưu được vào bảng chung." });
  });
  it("keeps version conflicts explicit and database diagnostics private", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "private SQL contents" } });
    const result = await updateBoardObjectAction({ id, expectedVersion: 1, x: 100 });
    expect(result.conflict).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SQL");
  });
});
