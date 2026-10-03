# Board domain — Phase 3B / Codex

## UI integration (2026-10-02)

The scrapbook UI now uses schema-2 drafts and `BoardSyncSession` through authenticated action adapters. Creating, typing, moving and rotating a note keeps a local draft; **Lưu ghi chú** queues one immutable append/update. A queued note is held until an exact receipt acknowledges it. Draft CAS versions are independent of server versions. Reopening restores drafts and verified server/cache content. Explicit conflict choices retain local proposals; choosing the local proposal uses the version displayed in the conflict, so a newer unseen edit produces another conflict.

V1 completion adds the protected `/board` entry from Home, actual link/photo/voice
and Excalidraw doodle editors/renderers, move/rotate and creator-only trash/restore
UI. Media/link creation needs connectivity; notes/doodles can queue locally.
Unknown trash/restore retries retain the original operation. Items are locked
from the start of a save until receipt reconciliation, including local persistence
before enqueue. Toggling recovery verification keeps the same serialized local
writer and pauses transport instead of reopening storage. Missing schema renders
a retry/recovery state rather than a writable empty board.

Background sync runs on mount, queue events and reconnect without a state-driven polling loop. Legacy queues are held for explicit recovery. Test-only HTTP adapters are isolated from the production authorization path. UI E2E uses real IndexedDB on Chromium desktop, iPhone WebKit and Android Chromium; PostgreSQL authorization is tested separately.

Branch: `feature/board-domain`. Scope: persisted Board objects, House authorization, private media references, versions/retries, and a durable note/doodle sync engine. UI composition belongs to `feature/board-ui`; this branch does not redesign the room or add V1 features.

## Accepted permissions

The user explicitly chose: **both members can edit/move; only the creator can trash/restore**.

| Operation | Active member in this House | Other House / signed out |
| --- | --- | --- |
| Read, including trash | Both | Denied |
| Create | Both; server assigns creator/House | Denied |
| Edit/move/rotate active object | Both | Denied |
| Trash / restore | Creator only | Denied |
| Edit an object in trash | Denied; explicit restore first | Denied |
| Purge | No API | No API |

An archived House or inactive membership denies reads/writes/replays. House capacity and pairing remain under the existing model. UI should hide unavailable controls, but SQL remains authoritative. Creator-only trash is not a content-visibility boundary: both members can read objects in trash.

## Schema and transaction

`20261002010000_board_domain.sql` extends the legacy Board migration without deleting or reassigning content. It adds `media_id`, strict payload/layout constraints, `media_objects`, and `board_operations`. Direct client INSERT/UPDATE/DELETE is denied; SELECT uses RLS. Legacy `append_board_object` / `update_board_object` execution is revoked so it cannot bypass creator-only trash or stable retry IDs.

Every write uses `apply_board_operation(operationId, expectedHouseId, mutation, itemId, expectedVersion, data)`. The expected House is a binding check; the RPC derives the actor from `auth.uid()` and verifies their active House. It locks the operation ID, active House, membership and object in that order. Writes and immutable receipts commit together. House-first locking is consistent with existing pairing/archive operations; independent database-connection concurrency still needs hosted/local Supabase validation.

Create expects version `0`; edit/trash/restore expect the last authoritative integer version. A successful mutation increments it exactly once. A stale edit records an explicit `conflict` receipt with the remote snapshot and changes no content. Both applied and conflict retries return their original snapshot **before** comparing the current object version. Reusing an operation ID for another actor, House, object or request is rejected. Authorization is checked again even for a replay.

The operation ledger is actor-private under RLS. It retains a snapshot for safe retry and is not a chat/history UI. No ledger expiry/purge is introduced in this workstream. Retention/export/deletion must consider both object and ledger copies in their dedicated lifecycle work.

Supported payloads:

| Type | Payload | Limits |
| --- | --- | --- |
| `note` | `{text}` | 10,000 Unicode characters |
| `link` | `{url,title?}` | HTTP(S), no userinfo; URL 2,048 / title 200 characters |
| `doodle` | `{schemaVersion:1,strokes:[{color,width,points}]}` | 256 strokes, 10,000 total `[x,y]` points; hex color, width 0.5–32 |
| `photo` / `voice` | `{caption?}` plus `mediaId` | Caption 1,000 characters; ready matching-kind media in this House |

Coordinates are bounded to ±10,000, rotation ±180 degrees, z-index integer 0–1,000,000. Extra payload fields, unsafe control characters and oversized JSON are rejected. Multiline note/caption text allows tab/newline. Board text remains plain text: render it as text, never HTML. Link rendering should use `rel="noopener noreferrer"` for a new tab.

New constraints are `NOT VALID` for existing rows: the upgrade preserves legacy data, while every new/updated row must conform. DTO decoding rejects invalid legacy content; an invalid Board produces a recoverable Board error, preserving the rest of Home. Repair must be deliberate, with the draft retained; there is no automatic data deletion or payload conversion.

## Gemini integration contract

Read verified account/House context from the authenticated page; freeze `{accountId,houseId}` for the editor/session. It is required for every action. Never substitute the latest logged-in account or House for an older queued operation.

```ts
const context = { accountId: currentUserId, houseId: house.id };
// Generate item ID and operation ID once; freeze the request on first send.
await appendBoardObjectAction({
  operationId, id, type: "note", payload: { text }, x: 0, y: 0,
}, context);
await updateBoardObjectAction({
  operationId: editOperationId, id, expectedVersion: item.version,
  payload: { text: editedText },
}, context);
// Trash/restore is a separate online interaction with no edit fields.
await updateBoardObjectAction({
  operationId: trashOperationId, id, expectedVersion: item.version, deleted: true,
}, context);
// deleted:false means explicit restore, never a normal edit.
```

Actions return `{item,receipt}` for applied writes or `{receipt,conflict:true,error}` for conflicts. An error/blocked response never acknowledges a queue entry. Keep the same IDs and byte-equivalent logical request after lost response; a changed proposal is a **new** operation. Receipts validate actor, House, object, version, submitted payload/layout/media and trash transition. A reply alone is not enough to clear pending state.

Existing one-argument UI calls and the older `SyncCoordinator` must be adapted before integration: missing operation/context safely fails; it is not a compatible write path. `getBoardSnapshotAction(context)` verifies auth/House and includes tombstones. `getActiveBoardItems` serves the authenticated initial page and excludes trash. Display loading/error/empty/pending/conflict states distinctly; do not fall back to a write-capable empty Board after a read failure.

## Offline notes and doodles

Use `AccountOfflineStore` and `BoardSyncSession`; the domain has no React dependency, polling timer, stored credentials or realtime dependency. Bind a new session to each authenticated account/House lifecycle. Supply `canProceed` for connection/session readiness, call `drain()` after a local create or reconnect, and `stop()` before logout, account/House change or component disposal. Stop ignores late responses for local cache/ack; an already committed server operation can be recovered by its stable ID later.

```ts
const transport = {
  snapshot: getBoardSnapshotAction,
  apply: (op, ctx) => op.mutation === "append"
    ? appendBoardObjectAction({ ...op.data, id: op.id, operationId: op.operationId }, ctx)
    : updateBoardObjectAction({ ...op.data, id: op.id,
        operationId: op.operationId, expectedVersion: op.expectedVersion }, ctx),
};
const session = new BoardSyncSession(context, store, transport, () => online && ready);
const queued = await store.enqueue({
  houseId: context.houseId, schemaVersion: BOARD_SCHEMA_VERSION,
  entityId: id, entity: "note", mutation: "append",
  payload: { type: "note", payload: { text } },
});
// Updates: mutation:"update", baseVersion:item.version,
// payload:{payload:{text}} or another bounded patch.
await session.drain();
```

Use `saveDraft` with the local draft version before enqueueing if the editor needs autosave; it preserves both proposals on a local conflict. Offline queue schema is `2`, and each operation has a stable UUID and transaction-assigned sequence. Do not enqueue a series of edits with fabricated future server versions; hold/compose the local draft until the preceding write is authoritatively acknowledged. Trash/restore and media writes are online-only in this domain.

On an authenticated initial load/refresh, cache verified note/doodle DTOs with `cacheRecent({id,houseId,schemaVersion:2,kind,payload:item,serverVersion:item.version})`, including tombstones. `drain()` with an empty queue does not fetch or poll. When rendering local recent content, filter by the frozen account/House and schema `2`, validate DTOs and exclude `deletedAt` from the active view. Never display a different House's cache as an empty/read-error fallback.

Each queued write re-verifies account/House with a fresh authenticated snapshot. Exact receipt validation precedes cache/ack. A lost reply, quota failure, offline state or session change leaves the queue intact. Newer cached server versions are never replaced by an older replay receipt. There is no silent retry interval: the UI triggers drain and displays the report.

On conflict, preserve both the original local proposal and the remote object/version. Other operations for that object remain held. An explicit user choice can:

- `queueConflictReplacement(operationId, {payload:{text:chosenText}}, freshlyReadVersion)`: new operation ID; retain the conflict until the exact replacement receipt is acknowledged. If another change occurs, preserve a new conflict and ask again.
- `keepRemoteConflict(operationId)`: archive the local proposal(s) as separate local drafts and remove the conflict chain, with no cloud write.

Legacy queue schema `0/1` and wrong-House entries remain stored and are never rebound or silently submitted. A UI migration/recovery flow must show/export their local content and ask before creating new schema-2 operations. IndexedDB v3 upgrades the existing database in place. Recent note/doodle snapshots are bounded to 50 items / 7 days; drafts and pending/conflicted operations do not expire automatically.

Intentional logout clears content for that account and advances a persistent epoch atomically. Old handles in any tab can no longer read/write or repopulate cache after a late response. Only minimal account-ID/revocation-counter metadata remains. The logout UI must preserve its existing pending-work disclosure/export/cancel flow; expiry of auth alone must not discard drafts.

## Media boundary

`media_objects` contains private metadata and a canonical `House UUID/media UUID` path in the fixed `nha-minh-private` bucket. Photos accept JPEG/PNG/WebP; audio accepts MPEG/MP4/OGG/WebM/WAV, up to 60 seconds. Both are bounded to 20 MiB. Ready metadata requires size, MIME and applicable duration. Both members can reference verified ready media; pending/error metadata is owner-visible only. The caller cannot register external URLs or mark uploads ready. `getMediaReference` verifies the current House and returns no signed/public URL.

The Board domain retains references only. The integrated private media pipeline now validates photo/PCM voice bytes, verifies House membership, writes to a private bucket and registers metadata service-side. `/media/[id]` uses requester RLS and no-store playback. Uploads require server configuration; failures never create pretend attachments. No service-role credential appears in client code. See [private media](PRIVATE_MEDIA.md).

## Apply the schema

No remote Supabase SQL is executed by this branch. Existing hosted data must not use `setup-new-project.sql`.

1. If `public.board_objects` is absent on an installed Phase 2 project, use `supabase/install-board-domain.sql` once. It installs legacy Board plus this repair in **one transaction**, so the obsolete write API is never exposed between migrations.
2. If legacy `public.board_objects` already exists, use `supabase/upgrade-board-domain.sql` once. It preserves populated objects and applies only the additive repair.
3. If Board domain already exists, neither bundle should be rerun. Their guards reject an unexpected baseline. With migration-managed projects, apply the normal ordered migration chain instead and reconcile manually applied migration history before `db push`.

Regenerate artifacts with `node scripts/generate-board-upgrade.mjs`. They contain the canonical SQL, request PostgREST schema reload and commit atomically. Revert application code only in coordination with the action-contract change; do not restore legacy unsafe RPC grants. A SQL failure rolls back the install/upgrade; there is no reset/drop-data recovery script.

## Verification boundaries

Unit tests cover typed inputs/receipts, authenticated actions/media references and durable IDB sync. PGlite executes the full canonical migration chain under real PostgreSQL `anon`/`authenticated` roles, including cross-House denial, creator rights, retries, conflicts and private media metadata. Separate upgrade tests preserve populated valid and invalid legacy rows and exercise both transactional bundles.

Playwright uses real browser IndexedDB and the production sync engine with a clearly separate simulated HTTP transport. It covers offline/reopen, committed-response loss, two-tab replay, partner conflict/replacement and cross-tab logout on desktop Chromium, iPhone-class WebKit and Android-class Chromium. It does not prove hosted Supabase cookies/PostgREST/Storage behavior or independent PostgreSQL connection locking. Validate those with two real accounts after applying the schema and integrating the UI. Physical installed-PWA background behavior is outside this domain's verification.

Verified in the isolated worktree on 2026-10-02:

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — 29 files, 337 tests passed.
- `pnpm build` and `pnpm build:e2e` — passed with Supabase unconfigured; no production credentials copied into this worktree.
- `pnpm test:e2e --workers=1` — 57 tests passed across all three browser projects.
- Additional browser QA exercised the labeled note create → reload → inspect queue → sync → read flow and reviewed a 390px screenshot. The in-app interactive browser tool failed to initialize (`failed to write kernel assets`), so QA used Playwright. Hosted two-account/Storage, independent PostgreSQL connections and physical installed PWAs were not run.

The domain and UI have since been integrated into main. The updated bottom toolbar, washi tape, sticker rendering and pointer rotation use the same durable schema-2 hook. Stickers are emoji notes within the existing text contract; no unsupported payload fields or schema-1 operations are sent. Both note and sticker saves remain explicit, with pending/error/conflict/export states and keyboard move/rotate access. No hosted migration or deployment was performed during implementation; publishing the code does not install the schema.

Updated UI integration validation: lint, typecheck, all 337 unit/integration tests, production build and build:e2e passed. Six Board UI browser tests passed across desktop Chromium, iPhone WebKit and Android Chromium, covering offline/reconnect/reload and saved note/sticker geometry. Rebuild build:e2e after changing Tailwind classes; the fixture uses the generated production CSS.
