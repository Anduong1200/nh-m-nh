# Games domain — Codex / Phase 4

Implemented on `feature/games-domain`, integrated into `main`. Scope: the four V1 games, async first. This delivers domain/server/database/offline and a browser test harness. Production Home/game screens and drawing/photo-upload UI need integration. No XP, leaderboard, automatic memory promotion, notification sender, realtime requirement or deletion API is added.

## Generic contract

`src/modules/games/model.ts` exports `GameSession`, `GameEvent`, `Turn`, `Player`, `Artifact`, `GameCommand`, `GameReceipt`, `GameContext` and bounded parsers. Each session permanently binds to a House and two players; creator is seat 0 and partner seat 1. Turns derive from the authoritative session/event sequence, not a separately mutable table. Version starts at 1 and is event count + 1. Completion produces one immutable artifact; it does not promote a memory or grow the Island automatically.

Client-generated session IDs allow offline creation. Create has expectedVersion 0; moves carry the last authoritative version. Every command has a client operation UUID and exact request. A successful move increments once and never replaces an earlier contribution. An exact retry returns its original receipt even after later turns; a changed request needs a new operation UUID. Authorization is checked again on replay.

## Four state machines

| Game | Turns | Completion / preserved artifact |
| --- | --- | --- |
| Doodle Relay | Alternate `doodle` contributions, creator first | 2–12 contributions, default 6; all earlier strokes preserved |
| Draw & Guess | Creator `drawing` → partner `guess`; guesser may retry | Correct guess or third guess; drawing, guesses and revealed answer |
| One-line Story | Alternate `line` contributions | 2–12 lines, default 8; ordered story |
| Photo Mission | Creator `photo` → partner `photo` | Two owned private-media references/captions |

Draw & Guess takes a custom answer in creation's `payload.prompt`; public prompt is empty. `game_answers` is separately protected: the drawer can read their answer; the guesser cannot until completion. Server snapshots and operation receipts follow this boundary. Matching uses exact case-sensitive text after trimming ordinary spaces. The UI should explain this rule. A prompt pack can supply a chosen answer without adding another service/table.

Photo Mission uses the spec's immediate shared-reveal mode. Each reference must be an owned, ready `media_objects` row in this House with type `photo`, never a URL. Both members discover each contribution immediately. Existing media is House-shared; this work does not offer secret-until-both-submit photos or alter Storage permissions. A sealed mode needs a separately authorized media lifecycle. Pending/uploading media cannot be submitted yet; upload and signed access UI remain media integration work.

Doodles reuse Board's schema-1 stroke codec: bounded pen color, width and points. Each contribution is nonempty, at most 64 KiB (SQL also enforces a conservative jsonb serialized-size limit), with no remote URL or SVG. There is no custom canvas engine: UI may adapt the established Excalidraw tools. Erasing/replacing earlier partner strokes is not a relay move. Story lines have at most 500 Unicode characters and no line breaks/control characters; answers/guesses have at most 100; captions have at most 500.

## Server / UI handoff

Use `src/modules/games/actions.ts` with a verified `{accountId, houseId}`:

- `listGameSessionsAction(context)` returns up to 20 recent sessions projected for this actor.
- `readGameSessionAction(sessionId, context)` returns `{context, snapshot}` or generic `{error, blocked}`.
- `applyGameCommandAction(command, context)` returns a validated exact `{receipt}`. Errors do not acknowledge queued work.

Commands: `{operationId, sessionId, expectedVersion, kind, payload}`. Create payload: `{gameType, prompt, turnLimit}`. Doodle: `{schemaVersion:1, strokes:[{color,width,points}]}`. Line/guess: `{text}`. Photo: `{mediaId, caption}`. Never send actor IDs, turn user or event sequence: database derives them. House comes from separately verified context and is authorized again by RLS/RPC.

```ts
const store = new AccountOfflineStore(accountId);
const sync = new GameSyncSession({accountId, houseId}, store, gameActionTransport,
  () => navigator.onLine);
const sessionId = crypto.randomUUID();
await sync.queue({sessionId, expectedVersion:0, kind:"create",
  payload:{gameType:"one-line-story", prompt:"Một chuyến đi kỳ lạ", turnLimit:8}});
await sync.drain();
const snapshot = await sync.read(sessionId);
const detach = sync.watchReconnect(sessionId, (remote, report) => {
  // Show pending/error/conflict. Preserve the editor's unsent draft.
});
// Account/House change or unmount: detach(); sync.stop(); store.close();
```

Await durable queue success before saying a turn is pending; use the authoritative turn/version. A local optimistic transition is not authorization, particularly when the guesser does not know the answer. UI must provide loading/error/empty/conflict/recovery states and accessible game controls. The harness is not a production route; Home's game box remains inactive until that UI is wired.

## Database / RLS / races

Migration: `20261002030000_game_domain.sql`. Six tables: `game_sessions`, `game_players`, `game_events`, `game_answers`, `game_artifacts`, `game_operations`. All have RLS, authenticated SELECT policies and no direct INSERT/UPDATE/DELETE grants. Anonymous reads and cross-House reads fail. Answers and receipts have stricter owner/reveal policies. Cross-House FKs bind players/events/media. Internal SECURITY DEFINER `game_snapshot` has no client EXECUTE grant.

`apply_game_command` locks operation UUID, active House, active members and session in a fixed order. It validates two active players, expected version, actor, phase and photo ownership/readiness, then writes event, turn, artifact and receipt atomically. Stale version, wrong player, completed-session move and duplicate creation produce a conflict receipt without an event. Invalid payload/phase/media produces no mutation. Event sequence and operation IDs are unique. Read RPC uses compatible locks so session/event/answer projection cannot mix different committed versions.

Generated `supabase/install-games.sql` is a guarded transactional additive installer for a hardened House/Board-domain project. Whiteboard is not a prerequisite. Review prerequisites and apply once; repeat installation refuses to change data. Generate with `node scripts/generate-game-install.mjs`. Fresh-project setup includes the migration; regenerate with `node scripts/generate-supabase-setup.mjs`. This task does not execute a remote migration.

## Offline / reconnect

`GameSyncSession` reuses account-scoped IndexedDB and the persistent logout epoch. New `game` content uses the existing draft/recent/operation stores without changing IndexedDB schema. Recent content is bounded across all kinds to 50 records/account and seven days; drafts/queued work do not expire silently. V1 IndexedDB remains plaintext on this device. Private HTML is not service-worker cached.

- `saveDraft(sessionId, payload, expectedLocalVersion)` uses local CAS. Remote refresh never writes this draft.
- `queue(proposal)` persists one immutable pending operation/session. A single IndexedDB transaction prevents two tabs queueing competing proposals.
- `drain()` coalesces calls and retries exact IDs. Only matching actor/House/request receipts acknowledge work. Conflicts never rebase automatically.
- `watchReconnect()` drains/refreshes on online/focus/visible and retains another refresh if reconnect arrives during a running refresh. Dispose/stop on verified-context changes.
- `cached()` returns only this actor/House's verified projection. An old retry snapshot cannot roll the cache back.
- `resolveConflict()` creates a new operation only for the reviewed conflict's authoritative turn; original proposals remain until acknowledgement. For a partner turn/completed session, `keepRemote()` archives the local content as a recovery draft before clearing the conflict.
- `exportLocal()` returns drafts/proposals for explicit export/recovery. Existing confirmed logout clears Games together with other content; persistent epoch checks prevent late replies repopulating data after another tab logs out.

Realtime is optional. The current generic offline-shell fallback remains: a cold offline launch directly into private Games needs account/recovery-shell integration, as Board/Whiteboard do.

## Verification boundaries

Unit tests cover codecs and state-machine guards; action tests cover verified context and answer projection. PGlite executes real migrations, grants, RLS, RPCs, media validation, exact replay and expected-version contenders. Transactions/connections are serialized there: this does not replace an independent multi-connection PostgreSQL lock stress test.

Playwright uses real browser IndexedDB/sync with a simulated HTTP game store, covering all four happy paths, offline draft/queue reload, reconnect, conflict retention and logout across desktop Chromium, iPhone-class WebKit and Android Chromium. Fixture photo references/auth are simulated; SQL validates actual ownership separately. Hosted Supabase Auth/Storage, physical installed PWAs, cold private offline launch and production Games UI require integration acceptance.

## Validation record — 2026-10-02

- `pnpm lint` and `pnpm typecheck` passed.
- `pnpm test --maxWorkers=2` passed: 422 tests / 38 files, including the real SQL chain, RLS/RPCs, additive installer preservation and Unicode matching cases. An earlier unconstrained Windows run exhausted memory; the bounded run includes every test.
- `pnpm build:e2e` and `pnpm build` passed in an isolated ignored validation copy with shared installed dependencies and a local Turbopack root override. The user's dev server/build directory was not replaced. No dependency, lockfile, CI test or auth configuration change was needed.
- `pnpm test:e2e --workers=1` passed: 93 tests across all three projects, including 21 Games cases and the existing Home/Board/Whiteboard regressions. Its two task-owned Windows test servers needed manual cleanup after assertions; runner exited successfully.
- After the SQL/browser ordinary-space matching correction, all 21 Games assertions passed again, but that combined Windows run returned a worker-shutdown error. Focused retries exited cleanly: `pnpm test:e2e tests/e2e/games-domain.spec.ts --project=iphone-webkit --workers=1` passed 7/7; the same command with `--project=desktop-chromium --project=android-chromium` passed 14/14. No assertion was relaxed.

Windows validation used the installed Playwright browser cache and an ignored D-drive TEMP/TMP directory. The process-shutdown issue is an environment/runner limitation, not a skipped assertion; do not infer physical Safari/PWA or hosted concurrency coverage from these results.
