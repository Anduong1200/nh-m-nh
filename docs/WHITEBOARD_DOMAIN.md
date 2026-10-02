# Whiteboard — Codex implementation and UI handoff

Branch: feature/whiteboard-domain. Library: Excalidraw 0.18.1, with a React-19-compatible Radix Tabs override. Read [ADR 002](ADR/002-whiteboard-library-and-snapshot-sync.md) for the eight-criterion comparison, size methodology, licensing and design tradeoffs.

## Implemented contract

- modules/whiteboard/model.ts: bounded native document codec, versions, context and receipt validation.
- actions.ts: verified-account/House read and save actions. No service-role credential.
- sync.ts: stable queued operation replay, receipt validation, cache, stop/logout barrier and preserved full-scene conflicts.
- workspace.ts: durable drafts with independent local CAS versions, continued edits during a pending save, explicit replace/keep-remote and recovery export.
- components/phase3/whiteboard.tsx: browser-only, lazy SDK wrapper.
- whiteboard-editor.tsx: thin testable integration of pen, highlighter, eraser, text, sticky, simple shapes and SDK move/rotate. Native undo stays local; loading a different remote scene clears undo history.
- SQL: one Whiteboard per House plus actor-private operation receipts, active-House RLS and versioned save RPC.

Both partners edit the shared canvas. There is no permanent-delete API, media support, realtime, public room or extra V1 feature.

## Gemini integration

Mount the reusable component only inside a verified House session:

~~~tsx
<Whiteboard
  accountId={currentUserId}
  houseId={house.id}
  onClose={closeDialog}
/>
~~~

Import it from components/phase3/whiteboard. Remount on account/House changes (a key containing both IDs is appropriate). The wrapper sets the local asset path before the SDK loads. Preserve save/pending/error/conflict/export controls, keyboard access and explicit conflict preview. The visual composition can change; the persistence contract must remain.

Do not replace these actions with client table writes, add another localStorage/store, strip tombstones, or call serializeAsJSON as the persistence codec: that utility strips deletion records. Do not acknowledge a queue entry from an error string or from the newest server version. If upload support arrives later, use the private-media pipeline and a new reviewed schema codec.

Home currently keeps Whiteboard's future/decorative entry until this UI workstream connects it. The adapter is verified in the isolated browser fixture; no auth bypass or fixture route is added to the application.

## Offline and conflicts

Typing/drawing writes a durable local draft; cloud saves are explicit. A pending operation is immutable and the drawing can continue into the draft. Reconnect in an open editor retries it; reopening the editor also drains pending work. Close flushes local edits before releasing the account-bound handle. Browser IDB/quota errors and another-tab draft CAS conflicts hold work and expose export/reopen recovery.

Old/unrecognized schemas are held. Account/House changes never rebind drafts or queued operations. Logout's existing persistent epoch makes late callbacks unable to repopulate cleared account content. No token or session cookie enters draft payloads.

A conflict shows the preserved remote version and supports preview. **Dùng bản đang vẽ** sends a replacement against that exact observed version; unseen subsequent edits conflict again. **Giữ bản của Nhà** archives the immutable proposal and newer local work as recovery drafts before adopting remote. Export includes these account-bound Whiteboard drafts and pending operations.

Recent cache is bounded by the existing 50-items/7-days policy. Drafts and pending operations do not expire silently. The public service worker caches only immutable SDK/build/font assets; it never caches authenticated HTML, Supabase responses, scenes or media. Private-editor cold offline launch from the generic fallback is still the Phase 3E recovery-shell integration, not an authentication shortcut in this domain change.

## Local SQL installation

Fresh, empty Supabase projects use regenerated setup-new-project.sql. Existing projects first need the hardened Phase 2 and Board domain. Apply install-whiteboard.sql once in Supabase SQL Editor (or use timestamp-ordered migrations with the project's normal migration tooling).

The generated installer checks prerequisites and rejects already-existing Whiteboard tables in one transaction. It adds tables/functions only; it does not delete or rewrite existing Board/House content. Do not re-run setup-new-project.sql on an existing project. No hosted SQL has been applied by this task.

## Verification

Commands are lint, typecheck, test, build, build:e2e and full Playwright E2E. PostgreSQL tests execute actual migrations, grants and RLS with only auth.uid()/auth.users shimmed. Browser tests run the real React editor, native serialization and real IndexedDB against a clearly isolated simulated HTTP transport. They are not hosted Supabase or Storage tests.

The browser matrix includes desktop Chromium, iPhone 12 WebKit and Pixel 7 Chromium. Android drawing uses native Chromium touch injection; iPhone WebKit tests use touch toolbar taps plus mouse-driven canvas strokes at an iPhone viewport. Physical iOS/Android installed PWA checks and live two-account testing after migration remain separate acceptance checks.

Final command counts and visual-QA results are recorded below once all gates finish.
