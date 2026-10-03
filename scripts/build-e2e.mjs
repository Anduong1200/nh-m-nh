import { spawn } from "node:child_process";
import "./prepare-whiteboard-assets.mjs";

// Keep browser fixtures independent of a developer's real Supabase project.
// Empty values override .env.local without changing that file or the dev server.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
});
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", async (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) {
    try { await import("./prepare-offline-build.mjs"); }
    catch (error) { console.error(error); process.exitCode = 1; }
  }
});
