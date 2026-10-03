// Test-only HTTP transport. Real authorization is tested with PostgreSQL separately.
const actors = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const houseId = "33333333-3333-4333-8333-333333333333";
const sessions = new Map();
export async function handleBoardFixture(request, response, url) {
  if (!url.pathname.startsWith("/api/board/")) return false;
  const actorId = actors[Number(url.searchParams.get("actor") ?? 0)];
  const session = url.searchParams.get("session");
  if (!actorId || !session) throw new Error("Invalid test context");
  if (!sessions.has(session)) sessions.set(session, { items: new Map(), receipts: new Map(), lose: false });
  const state = sessions.get(session);
  const send = (value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
  if (url.pathname === "/api/board/snapshot") { send({ context: { accountId: actorId, houseId }, items: [...state.items.values()] }); return true; }
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  if (url.pathname === "/api/board/control") { state.lose = input.lose === true; send({ success: true }); return true; }
  const op = input.operation;
  if (input.context.accountId !== actorId || input.context.houseId !== houseId) { send({ blocked: true }, 403); return true; }
  let receipt = state.receipts.get(op.operationId);
  if (receipt && (receipt.actorId !== actorId || receipt.request !== JSON.stringify(op))) { send({ blocked: true }, 403); return true; }
  if (!receipt) {
    const previous = state.items.get(op.id);
    if ((op.mutation === "trash" || op.mutation === "restore") && previous?.createdBy !== actorId) { send({ blocked: true }, 403); return true; }
    const conflict = op.mutation !== "append" && previous?.version !== op.expectedVersion;
    if ((op.mutation === "append" && previous) || (op.mutation !== "append" && !previous)) { send({ error: "Invalid test operation" }, 409); return true; }
    const item = conflict ? previous : { id: op.id, houseId, createdBy: previous?.createdBy ?? actorId, type: previous?.type ?? op.data.type,
      payload: op.data.payload ?? previous?.payload, mediaId: op.data.mediaId ?? previous?.mediaId ?? null, x: op.data.x ?? previous?.x ?? 0, y: op.data.y ?? previous?.y ?? 0,
      rotation: op.data.rotation ?? previous?.rotation ?? 0, zIndex: op.data.zIndex ?? previous?.zIndex ?? 0,
      version: (previous?.version ?? 0) + 1, createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: op.mutation === "trash" ? new Date().toISOString() : op.mutation === "restore" ? null : previous?.deletedAt ?? null };
    receipt = { operationId: op.operationId, actorId, houseId, outcome: conflict ? "conflict" : "applied", item: structuredClone(item), request: JSON.stringify(op) };
    state.receipts.set(op.operationId, receipt);
    if (!conflict) state.items.set(op.id, item);
  }
  if (state.lose) { state.lose = false; send({ error: "Response lost after commit" }, 503); return true; }
  send({ receipt }); return true;
}
