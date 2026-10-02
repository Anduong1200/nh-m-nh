// Reproducible SDK-only production comparison; React/ReactDOM/framework excluded.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
const research = resolve(process.argv[2] ?? ".pnpm-cache/library-study");
for (const [library, component, css] of [["@excalidraw/excalidraw", "Excalidraw", "@excalidraw/excalidraw/index.css"], ["tldraw", "Tldraw", "tldraw/tldraw.css"]]) {
  const result = await build({ stdin: { contents: 'export { '+component+' } from "'+library+'"; import "'+css+'";', resolveDir: research, sourcefile: "study.ts" }, bundle: true, write: false, minify: true, format: "esm", platform: "browser", conditions: ["production"], external: ["react", "react/*", "react-dom", "react-dom/*"], define: { "process.env.NODE_ENV": '"production"', "process.env.IS_PREACT": "false" }, outdir: ".pnpm-cache/library-bundle", loader: { ".woff2": "file", ".woff": "file", ".ttf": "file", ".svg": "file", ".png": "file" }, logLevel: "warning" });
  const sizes = {};
  for (const type of [".js", ".css"]) {
    const outputs = result.outputFiles.filter(f => f.path.endsWith(type));
    sizes[type] = { rawBytes: outputs.reduce((sum,f) => sum+f.contents.length,0), gzipBytes: outputs.reduce((sum,f) => sum+gzipSync(f.contents,{level:9}).length,0) };
  }
  console.log(JSON.stringify({ library, ...sizes }));
}
