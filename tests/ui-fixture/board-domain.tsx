// Test-only browser harness: production IDB and sync code, simulated HTTP server.
import { useState } from "react";
import { AccountOfflineStore, clearAccountOfflineData, type JsonValue } from "@/lib/offline/store";
import { BoardSyncSession, type BoardSyncTransport } from "@/modules/board/sync";
import type { BoardContext, BoardItem } from "@/modules/board/model";

export function createBoardDomainHarness() {
  const params = new URLSearchParams(location.search);
  const actor = params.get("actor") === "1" ? 1 : 0;
  const context: BoardContext = { accountId: actor ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", houseId: "33333333-3333-4333-8333-333333333333" };
  const suffix = `?session=${encodeURIComponent(params.get("session") ?? "manual-board")}&actor=${actor}`;
  const store = new AccountOfflineStore(context.accountId);
  const post = async (path: string, value: unknown) => {
    const response = await fetch(`/api/board/${path}${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    return response.json();
  };
  const transport: BoardSyncTransport = {
    snapshot: async () => (await fetch(`/api/board/snapshot${suffix}`, { cache: "no-store" })).json(),
    apply: (operation, binding) => post("apply", { operation, context: binding }),
  };
  const sync = new BoardSyncSession(context, store, transport, () => navigator.onLine);
  addEventListener("pagehide", () => { sync.stop(); store.close(); }, { once: true });
  return {
    context,
    enqueue: (kind: "note" | "doodle", payload: JsonValue, id: string = crypto.randomUUID(), baseVersion?: number) => store.enqueue(baseVersion === undefined
      ? { houseId: context.houseId, schemaVersion: 2, entityId: id, entity: kind, mutation: "append", payload: { type: kind, payload } }
      : { houseId: context.houseId, schemaVersion: 2, entityId: id, entity: kind, mutation: "update", baseVersion, payload: { payload } }),
    drain: () => sync.drain(),
    inspect: async () => ({ operations: await store.listOperations(), recent: await store.listRecent(), drafts: await store.listDrafts() }),
    remote: async () => (await transport.snapshot(context)).items as BoardItem[],
    loseResponse: () => post("control", { lose: true }),
    replace: (id: string, payload: JsonValue, version: number) => store.queueConflictReplacement(id, payload, version),
    keepRemote: (id: string) => store.keepRemoteConflict(id),
    clear: async () => { sync.stop(); await clearAccountOfflineData(context.accountId); },
  };
}
export type BoardDomainHarness = ReturnType<typeof createBoardDomainHarness>;
declare global { interface Window { boardDomainTest: BoardDomainHarness } }

export function BoardDomainFixture() {
  const [text, setText] = useState("Một tờ giấy nhỏ");
  const [output, setOutput] = useState("Sẵn sàng");
  const run = async (work: () => Promise<unknown>) => { try { setOutput(JSON.stringify(await work(), null, 2)); } catch { setOutput("Thao tác đang tạm dừng; bản nháp được giữ."); } };
  return <main style={{ maxWidth: 720, margin: "auto", padding: 24 }}>
    <h1>Kiểm thử Board domain</h1><p>Dữ liệu mô phỏng; lưu cục bộ và sync dùng mã thật. Đây là trang kiểm thử riêng.</p>
    <label>Lời nhắn thử<textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} /></label>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBlock: 16 }}>
      <button onClick={() => void run(() => window.boardDomainTest.enqueue("note", { text }))}>Tạo ghi chú cục bộ</button>
      <button onClick={() => void run(() => window.boardDomainTest.drain())}>Đồng bộ</button>
      <button onClick={() => void run(() => window.boardDomainTest.inspect())}>Xem hàng đợi</button>
      <button onClick={() => void run(() => window.boardDomainTest.remote())}>Xem bản trên server thử</button>
    </div><pre role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{output}</pre>
  </main>;
}
