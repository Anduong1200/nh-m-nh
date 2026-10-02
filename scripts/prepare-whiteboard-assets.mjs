// Local-only build asset extraction from the pinned npm package. No network requests.
import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
const version = JSON.parse(await readFile("node_modules/@excalidraw/excalidraw/package.json","utf8")).version;
if (version !== "0.18.1") throw new Error("Review Whiteboard codec/assets before changing Excalidraw version.");
const destination = resolve("public/vendor/excalidraw-0.18.1/fonts");
await mkdir(destination,{recursive:true});
for (const family of ["Excalifont","Xiaolai"]) await cp(resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts",family),resolve(destination,family),{recursive:true});
async function size(directory) {
  let bytes=0,files=0;
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path=resolve(directory,entry.name);
    if (entry.isDirectory()) { const nested=await size(path);bytes+=nested.bytes;files+=nested.files; }
    else { bytes+=(await stat(path)).size;files++; }
  }
  return {bytes,files};
}
console.log("Prepared self-hosted Whiteboard fonts",await size(destination));
