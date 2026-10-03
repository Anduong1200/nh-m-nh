import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
const id = (await readFile(".next/BUILD_ID", "utf8")).trim();
if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid production build ID.");
const assets = []; let bytes = 0;
async function walk(directory, publicPrefix) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name), url = `${publicPrefix}/${item.name}`;
    if (item.isDirectory()) await walk(path, url);
    else if (/\.(?:js|css|woff2?|ttf)$/u.test(item.name)) { assets.push(url); bytes += (await stat(path)).size; }
  }
}
await walk(".next/static", "/_next/static");
await walk("public/vendor/excalidraw-0.18.1/fonts/Excalifont", "/vendor/excalidraw-0.18.1/fonts/Excalifont");
if (assets.length > 512 || bytes > 50 * 1024 * 1024) throw new Error("Review offline asset size before increasing the public pre-cache budget.");
assets.sort();
await writeFile("public/offline-build.js", `// Generated public build assets only; no credentials or user data.\nself.NHA_MINH_OFFLINE_BUILD = ${JSON.stringify({ id, assets })};\n`);
console.log("Prepared cold-offline public code assets", { files: assets.length, bytes });
