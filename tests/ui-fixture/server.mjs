// Isolated UI test process. This is never part of the Next application or auth flow.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { handleBoardFixture } from "./board-server.mjs";

const bundle = await build({ entryPoints: ["tests/ui-fixture/entry.tsx"], bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  // Phase 2 fixture never imports real server actions or Supabase into its browser bundle.
  // Board has its own workstream; invoking it here fails explicitly.
  alias: { "@/modules/board/actions": "./tests/ui-fixture/board-actions.ts" },
});
async function styles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? styles(join(directory, entry.name)) : entry.name.endsWith(".css") ? readFile(join(directory, entry.name), "utf8") : ""));
  return files.join("\n");
}
const css = (await styles(".next/static")).replace(/url\((["']?)\.\.\/media\//g, "url($1/_next/static/media/");
// Use the production font variable class and its same-origin build assets.
const fontClass = css.match(/\.([\w-]+)\s*\{\s*--font-display\s*:/)?.[1];
if (!fontClass) throw new Error("Build the app before starting the UI fixture (display font missing).");
const port = Number(process.env.NHA_MINH_UI_FIXTURE_PORT ?? 3102);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid UI fixture port.");
const actors = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const defaults = { quietEnabled: false, startMinute: 1320, endMinute: 420, timeZone: "Asia/Ho_Chi_Minh", preview: "generic", knocksEnabled: true };
const sessions = new Map();
function sessionState(id) {
  if (!sessions.has(id)) sessions.set(id, { statuses: [], knocks: [], preferences: new Map(), dismissed: new Map(), loseKnockAcknowledgement: false });
  return sessions.get(id);
}
function json(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (/^\/_next\/static\/media\/[\w.-]+\.(woff2?|ttf|otf)$/.test(url.pathname)) {
    try {
      const font = await readFile(join(".next/static/media", url.pathname.split("/").at(-1)));
      response.writeHead(200, { "Content-Type": "font/ttf" });
      response.end(font);
    } catch { response.writeHead(404); response.end(); }
    return;
  }
  if (url.pathname === "/bundle.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle.outputFiles[0].text); return; }
  if (url.pathname === "/styles.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(css); return; }
  if (!url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.end(`<!doctype html><html lang="vi" class="${fontClass}" data-theme="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nhà Mình · Kiểm thử giao diện</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`);
    return;
  }
  if (await handleBoardFixture(request, response, url)) return;
  const actor = actors[Number(url.searchParams.get("actor") ?? 0)];
  if (!actor) { json(response, { error: "Invalid fixture actor" }, 400); return; }
  const state = sessionState(url.searchParams.get("session") ?? "default");
  if (url.pathname === "/api/state") {
    const dismissed = state.dismissed.get(actor) ?? new Set();
    json(response, { statuses: state.statuses, knocks: state.knocks.filter((knock) => knock.recipientId === actor && !dismissed.has(knock.id)), preferences: state.preferences.get(actor) ?? defaults });
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (url.pathname === "/api/control") { state.loseKnockAcknowledgement = input.loseKnockAcknowledgement === true; json(response, { success: true }); return; }
    if (url.pathname === "/api/presence") {
      const current = state.statuses.find((status) => status.userId === actor);
      if (input.expectedVersion !== (current?.version ?? 0)) { json(response, { error: "Trạng thái đã được đổi trên thiết bị khác. Chọn bản bạn muốn giữ.", conflict: true }); return; }
      const status = { userId: actor, mood: input.mood ?? "calm", energy: input.energy ?? "medium", availability: input.availability ?? "later", note: input.note ?? "", need: input.need ?? "", expiresAt: input.expiresAt ?? null, cleared: input.cleared === true, version: (current?.version ?? 0) + 1 };
      state.statuses = [...state.statuses.filter((row) => row.userId !== actor), status];
      json(response, { status }); return;
    }
    if (url.pathname === "/api/knock") {
      let knock = state.knocks.find((row) => row.id === input.operationId);
      if (!knock) {
        knock = { id: input.operationId, senderId: actor, recipientId: actors.find((id) => id !== actor), kind: input.kind, content: input.content, createdAt: new Date().toISOString() };
        state.knocks.unshift(knock);
      }
      if (state.loseKnockAcknowledgement) { state.loseKnockAcknowledgement = false; json(response, { error: "Chưa xác nhận được cú gõ. Bạn có thể thử lại." }, 503); return; }
      json(response, { knock }); return;
    }
    if (url.pathname === "/api/preferences") { state.preferences.set(actor, input); json(response, { preferences: input }); return; }
    if (url.pathname === "/api/dismiss") {
      const dismissed = state.dismissed.get(actor) ?? new Set();
      dismissed.add(input.knockId); state.dismissed.set(actor, dismissed); json(response, { success: true }); return;
    }
    json(response, { error: "Unknown fixture action" }, 404);
  } catch { json(response, { error: "Invalid fixture request" }, 400); }
});
server.listen(port, "127.0.0.1");
