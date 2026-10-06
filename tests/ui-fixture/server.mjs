// Isolated UI test process. This is never part of the Next application or auth flow.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { handleBoardFixture } from "./board-server.mjs";
import { handleWhiteboardFixture } from "./whiteboard-server.mjs";
const gameServerBundle = await build({entryPoints:["tests/ui-fixture/game-engine.ts"],bundle:true,write:false,format:"esm",platform:"node",target:"node22"});
const {handleGameFixture} = await import("data:text/javascript;base64,"+Buffer.from(gameServerBundle.outputFiles[0].text).toString("base64"));
const gameBrowserBundle = await build({entryPoints:["tests/ui-fixture/game-entry.ts"],bundle:true,write:false,format:"esm",platform:"browser"});
await mkdir(".pnpm-cache", { recursive: true });
await build({ entryPoints: ["tests/ui-fixture/letter-server.ts"], bundle: true, packages: "external", format: "esm", platform: "node", target: "node22", outfile: ".pnpm-cache/letter-server.mjs" });
const { handleLetterFixture } = await import(pathToFileURL(join(process.cwd(), ".pnpm-cache/letter-server.mjs")));
const letterBrowserBundle = await build({ entryPoints: ["tests/ui-fixture/letter-entry.ts"], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022" });

const lettersUiBundle = await build({ entryPoints: ["tests/ui-fixture/letters-ui-entry.tsx"], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "next/navigation": "./tests/ui-fixture/games-ui-navigation.ts", "@/modules/letters/actions": "./tests/ui-fixture/letters-ui-actions.ts" } });
const islandUiBundle = await build({ entryPoints: ["tests/ui-fixture/island-entry.tsx"], outfile: ".pnpm-cache/island-fixture.js", bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@/modules/island/actions": "./tests/ui-fixture/island-actions.ts", "@/modules/island/journal-actions": "./tests/ui-fixture/island-actions.ts", "@/modules/games/actions": "./tests/ui-fixture/island-actions.ts" } });
const gamesUiBundle = await build({ entryPoints: ["tests/ui-fixture/games-ui-entry.tsx"], bundle: true, write: false, minify: true, splitting: true, outdir: ".pnpm-cache/games-ui-fixture", format: "esm", platform: "browser", target: "es2022", jsx: "automatic", conditions: ["production"], loader: { ".woff2": "file" }, define: { "process.env.NODE_ENV": '"production"', "process.env.IS_PREACT": "false" }, alias: { "next/navigation": "./tests/ui-fixture/games-ui-navigation.ts", "@/modules/games/actions": "./tests/ui-fixture/games-ui-actions.ts", "@/modules/media/actions": "./tests/ui-fixture/games-ui-media-actions.ts" } });
const gamesUiFiles = new Map(gamesUiBundle.outputFiles.map(f => [f.path.split(/[\\/]/).at(-1), f]));

const bundle = await build({ entryPoints: ["tests/ui-fixture/entry.tsx"], bundle: true, write: false, minify: true, splitting: true, outdir: ".pnpm-cache/board-ui-fixture", format: "esm", platform: "browser", jsx: "automatic", conditions: ["production"], loader: { ".woff2": "file" }, define: { "process.env.NODE_ENV": '"production"', "process.env.IS_PREACT": "false" },
  // Phase 2 fixture never imports real server actions or Supabase into its browser bundle.
  // Board has its own workstream; invoking it here fails explicitly.
  alias: { "@/modules/board/actions": "./tests/ui-fixture/board-actions.ts", "@/modules/media/actions": "./tests/ui-fixture/board-media-actions.ts", "@/modules/notifications/push-actions": "./tests/ui-fixture/push-actions.ts" },
});
const boardUiFiles = new Map(bundle.outputFiles.map(f => [f.path.split(/[\\/]/).at(-1), f]));
const whiteboardBundle = await build({ entryPoints: ["tests/ui-fixture/whiteboard-entry.tsx"], bundle: true, write: false, minify: true, splitting: true, outdir: ".pnpm-cache/whiteboard-fixture", format: "esm", platform: "browser", jsx: "automatic", conditions: ["production"],
  loader: { ".woff2": "file" },
  define: { "process.env.NODE_ENV": '"production"', "process.env.IS_PREACT": "false" },
  alias: { "@/modules/whiteboard/actions": "./tests/ui-fixture/whiteboard-actions.ts" },
});
const whiteboardFiles = new Map(whiteboardBundle.outputFiles.map(f => [f.path.split(/[\\/]/).at(-1), f]));
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
  if(url.pathname.startsWith("/board-ui-fixture/")) {
    const name=url.pathname.split("/").at(-1),file=boardUiFiles.get(name);
    if(!file){response.writeHead(404);response.end();return;}
    response.writeHead(200,{"Content-Type":name.endsWith(".css")?"text/css":name.endsWith(".woff2")?"font/woff2":"text/javascript"});response.end(file.contents);return;
  }
  if (url.pathname === "/island-fixture.css") {
    response.writeHead(200, { "Content-Type": "text/css" }); response.end(islandUiBundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""); return;
  }
  if (url.pathname === "/letters-ui-bundle.js" || url.pathname === "/island-bundle.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }); response.end((url.pathname === "/island-bundle.js" ? islandUiBundle : lettersUiBundle).outputFiles[0].text); return;
  }
  if (url.pathname.startsWith("/games-ui-fixture/")) {
    const name = url.pathname.split("/").at(-1), file = gamesUiFiles.get(name);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".woff2") ? "font/woff2" : "text/javascript" }); response.end(file.contents); return;
  }
  const screen = url.searchParams.get("letters-ui") === "1" ? "letters" : url.searchParams.get("games-ui") === "1" ? "games" : url.searchParams.get("island") === "1" ? "island" : null;
  if (screen) {
    const script = screen === "games" ? "/games-ui-fixture/games-ui-entry.js" : screen === "letters" ? "/letters-ui-bundle.js" : "/island-bundle.js";
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }); response.end(`<!doctype html><html lang="vi" class="${fontClass}" data-theme="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nhà Mình · ${screen} integration fixture</title><link rel="stylesheet" href="/styles.css">${screen === "island" ? '<link rel="stylesheet" href="/island-fixture.css">' : ""}${screen === "games" ? '<link rel="stylesheet" href="/games-ui-fixture/games-ui-entry.css">' : ""}</head><body><div id="root"></div><script type="module" src="${script}"></script></body></html>`); return;
  }
  if (await handleLetterFixture(request, response, url)) return;
  if (url.pathname === "/letter-bundle.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(letterBrowserBundle.outputFiles[0].text); return; }
  if (url.searchParams.get("letters") === "1") { response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }); response.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letters core fixture</title><body><script type="module" src="/letter-bundle.js"></script></body></html>'); return; }
  if (await handleGameFixture(request,response,url)) return;
  if (url.pathname === "/game-bundle.js") {response.writeHead(200,{"Content-Type":"text/javascript"});response.end(gameBrowserBundle.outputFiles[0].text);return;}
  if (url.searchParams.get("games") === "1") {response.writeHead(200,{"Content-Type":"text/html","Cache-Control":"no-store"});response.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Games domain fixture</title><body><script type="module" src="/game-bundle.js"></script></body></html>');return;}
  if (url.pathname.startsWith("/whiteboard-fixture/")) {
    const name = url.pathname.split("/").at(-1), file = whiteboardFiles.get(name);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".woff2") ? "font/woff2" : "text/javascript" });
    response.end(file.contents); return;
  }
  if (/^\/vendor\/excalidraw-0\.18\.1\/fonts\/(Excalifont|Xiaolai)\/[\w.-]+\.woff2$/.test(url.pathname)) {
    try { const font=await readFile(join("public",url.pathname)); response.writeHead(200,{"Content-Type":"font/woff2","Cache-Control":"public, max-age=31536000, immutable"}); response.end(font); }
    catch { response.writeHead(404); response.end(); }
    return;
  }
  if (/^\/_next\/static\/media\/[\w.-]+\.(woff2?|ttf|otf)$/.test(url.pathname)) {
    try {
      const font = await readFile(join(".next/static/media", url.pathname.split("/").at(-1)));
      response.writeHead(200, { "Content-Type": "font/ttf" });
      response.end(font);
    } catch { response.writeHead(404); response.end(); }
    return;
  }
  if (url.pathname === "/bundle.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(boardUiFiles.get("entry.js").text); return; }
  if (url.pathname === "/styles.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(css); return; }
  if (!url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    const whiteboard = url.searchParams.get("whiteboard") === "1";
    response.end(`<!doctype html><html lang="vi" class="${fontClass}" data-theme="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nhà Mình · Kiểm thử giao diện</title><link rel="stylesheet" href="/styles.css">${whiteboard ? '<link rel="stylesheet" href="/whiteboard-fixture/whiteboard-entry.css">' : '<link rel="stylesheet" href="/board-ui-fixture/entry.css">'}</head><body><div id="root"></div><script type="module" src="${whiteboard ? "/whiteboard-fixture/whiteboard-entry.js" : "/board-ui-fixture/entry.js"}"></script></body></html>`);
    return;
  }
  if (await handleBoardFixture(request, response, url)) return;
  if (await handleWhiteboardFixture(request, response, url)) return;
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
