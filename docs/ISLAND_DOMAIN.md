# Shared Island domain

V1 contract: trusted domain events → deterministic world state. The browser has
no append-event, update-state or increase-level endpoint. No XP, currency, decay,
streak or relationship score is introduced. The protected `/island` screen opens
shared game artifacts and the explicit Memory/Milestone journal.

## Contracts and rules version 1

`src/modules/island/model.ts` defines `IslandEvent`, `IslandState`, codecs and the
reference `deriveIslandState(houseId, events)`. The reference projection is for
trusted data and tests; calling it in a browser does not confer write authority.

| Event | Source | Rule / current producer |
| --- | --- | --- |
| `GAME_COMPLETED` | `game-artifact`, session UUID | Completed persisted artifact, generated in the game's transaction. |
| `MISSION_COMPLETED` | Same Photo Mission artifact | Additional category; not a second history item. |
| `MEMORY_CREATED` | `confirmed-memory`, UUID | A persisted journal memory after the author explicitly confirms shared promotion. Source is a manual shared note or a completed same-House game artifact; never an automatic promotion. |
| `MILESTONE_CREATED` | `milestone`, UUID | A persisted journal milestone created by an authorized paired member. |
| `WEEKLY_ACTIVITY` | `activity-week`, UTC Monday date | One per House/week containing a completed game or newly persisted Memory/Milestone. Uses completion/create instant, including game backfills; no login, presence, last-seen or faith activity tracking. |

`version` is the unique persisted event count, used for freshness, never a level.
`rulesVersion = 1` identifies projection semantics. `historyItems` counts distinct
non-week source identities: a Photo Mission remains one item. `contributions`
contains the five category counts. `updatedAt` is the latest source event time,
or null in the empty state.

World rules are monotonic evidence flags:

- `sharedHistory`: at least one non-week artifact/reference;
- `memories`, `missions`, `milestones`: at least one corresponding event;
- `weeklyHistory`: at least one recorded active week, without consecutive-week logic.

The initial world has zero counts and false flags. A period of absence changes
nothing. Numeric levels, growth thresholds and specific visual unlocks are not
defined in this contract. Frontend may render these flags but cannot persist
invented progress. Memory/Milestone sources are validated and persisted in the
same transaction as their event, with same-House foreign keys.
No arbitrary generic event-emission RPC is available, including to a server action.

## Persistence and authorization

`island_events` is an immutable ledger for application roles, with a unique
`(house_id, event_type, source_type, source_id)` constraint. Game events also have
a composite FK to the same-House `game_artifacts` row. Only identifiers and times
are retained: no story, answer, caption, media path, or letter content is copied.

`island_state` is a PostgreSQL `security_invoker` aggregate view. It includes an
empty state for an authorized active House. Its underlying House/event RLS
applies to direct reads too. Both members may read; an owner awaiting pairing
may read the empty state, consistent with existing House permissions. Anonymous,
cross-House, departed-member and archived-House access is denied. All client
INSERT/UPDATE/DELETE privileges are revoked; no write policies exist.

`get_island_state(p_house_id)` is a read-only invoker RPC with explicit membership
validation. `readIslandStateAction(expectedContext)` verifies identity from auth,
matches the current House, validates the returned DTO and returns generic errors.
Import it from `src/modules/island/actions.ts`:

```ts
const result = await readIslandStateAction({ accountId, houseId });
if (result.state) renderWorld(result.state); // authoritative state
// result.error: show retry; result.blocked: re-verify session/House
```

`island_record_game` and its trigger are private security-definer functions with
an empty search path and no PUBLIC/anon/authenticated execute rights. They take
only a session ID, read completion truth themselves, and append idempotently.
Completion, artifact, Island events and the game retry receipt commit together;
an Island error rolls the entire completion back. Unique constraints deduplicate
simultaneous weekly inserts; no materialized counter update can race or go stale.
PGlite tests serialize connections; production lock stress remains separate.

Games created offline earn no speculative progress. Once the existing game
queue syncs and completes a server game, refreshing Island returns the derived
state. Journal drafts can be authored offline, but publication needs an online
transaction. It is never shown as confirmed progress before acknowledgement.
The UI uses account/House-bound recent-content caching, labels cached content,
and refreshes after reconnect. Hosted Auth/DB and physical installed-PWA
acceptance remain separate from simulated browser fixtures.

## Confirmed Memory/Milestone journal

`20261003020000_island_journal.sql` adds `island_entries` and actor-private
`island_entry_operations`. The user confirmed the same permissions as Board:
both active members may add/edit; only the original creator may trash/restore.
Both may read pages in recoverable trash. No permanent deletion endpoint exists.
Direct INSERT/UPDATE/DELETE is revoked for application roles on both tables;
SELECT uses House membership, with receipts additionally restricted to actor.

Each entry has a type, title (120 characters maximum), plain-text body (4000),
explicit calendar `occurredOn`, immutable creator and optional immutable game
source, and an optimistic `version`. Calendar dates remain dates; they are not
converted through a UTC timestamp and do not decide weekly activity. Creation/
update instants are UTC. Notes and game artifacts are already shared with both
House members; letters, sealed bodies and recipient-private data cannot be used
as promotion sources. The current UI offers recent completed game candidates
or an explicit shared note. It does not automatically suggest/persist memories.

`apply_island_entry_command(houseId, command)` validates the authenticated actor,
locks the active House and membership rows, requires exactly two active members,
then applies `create`, `update`, `trash` or `restore`. Creates require expected
version 0; later commands require the version originally displayed. Conflicts
return the current page without overwriting it. Exact operation retries return
the original immutable receipt, even when the page has subsequently changed;
changing the payload for an operation ID is rejected. The client caches each
entry under its entity version so a late receipt cannot roll back newer edits.

Memory creation requires `confirmed=true`. A linked source must be a completed,
persisted same-House game artifact. A unique House/source index means two members
cannot independently promote the same game into duplicate memories, including
while its memory is in trash. A duplicate produces an explicit error, preserving
the draft. Manual notes can be separately confirmed by either member. Entry,
source event, weekly event and receipt commit together; any failure rolls back
all of them. Client-supplied event types, progress and levels are never accepted.

The journal source FK ties `MEMORY_CREATED` / `MILESTONE_CREATED` events to their
persisted entry. Events copy only IDs/time, no sensitive text. Updating, trashing,
restoring and replaying add no progression events and remove none. The Island
describes shared history; journal visibility is separate from that historical
evidence, so recoverable trash never punishes the world with lost progress.

`get_island_entries(houseId, beforeCreatedAt?, beforeId?)` returns 20 pages with
a stable `(created_at,id)` cursor, including recoverable trash. `get_island_entry`
opens an individual authorized page. Server actions in `journal-actions.ts`
first verify account/current paired House, then validate the RLS/RPC response.
Failures expose generic copy without SQL details. Garden/Vọng gác open journal
sections; Home returns to the real House. Campfire remains clearly decorative
because it is outside V1.

Journal drafts live in existing IndexedDB account/House namespaces. Every edit
is persisted with local CAS; a competing tab forks its proposal instead of
overwriting another draft. Before sending, the complete command is saved as
pending and frozen. Unknown responses preserve that exact operation for retry,
including across reopening. Conflicts show the current page and keep the local
proposal until the user chooses to continue against the newer version or keep
a separate page. Recent entries expire/prune according to the shared store;
drafts never silently expire. Logout clears account data and its generation
barrier rejects late reads/writes. Journal publication is explicit after reconnect;
there is no background journal write queue or cached private HTML/media.

## Installation

Apply `20261002040000_island_event_projection.sql` through normal migrations.
For an existing hosted project with hardened House and Games domain already
installed, `supabase/install-island.sql` is a guarded transactional equivalent.
It adds the ledger/view/trigger and backfills completed artifacts without deleting
or modifying history. Repeat installation fails safely. No hosted SQL was applied
by this workstream.

Regenerate with `node scripts/generate-island-install.mjs` and
`node scripts/generate-supabase-setup.mjs`. The latter is only for a fresh project.

For an existing project with Island already installed, apply the separate
guarded `supabase/install-island-journal.sql` once. Generate it with
`node scripts/generate-island-journal-install.mjs`. It requires hardened House,
Games and Island, preserves all history and requests PostgREST schema reload.
Do not rerun the original Island installer or fresh-project setup on an existing
House. No hosted migration is applied by generating these artifacts.

## Verification

Unit/action tests cover deterministic derivation, retries, event identity,
UTC boundaries, no decay, category overlap, malformed state and stale auth.
Real PostgreSQL/PGlite tests cover migration/install backfill, game completion,
Photo Mission, direct read/write RLS, private emitter privileges, failure rollback,
archive/departure and SQL/TypeScript projection parity. Browser regression uses
the existing three-browser Games fixture (simulated HTTP, real IndexedDB); it
does not pretend to test a production Island UI or hosted Supabase.

Original domain baseline validated on 2026-10-02:

- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed.
- `pnpm test --maxWorkers=2`: 451 tests across 41 files passed (29 Island tests).
- `pnpm build`: production build passed.
- `pnpm test:e2e tests/e2e/games-domain.spec.ts`: 21 tests passed across desktop
  Chromium, iPhone WebKit and Android Chromium; runner exited successfully.

The isolated Windows worktree shares installed dependencies through a junction.
The first build rejected that junction outside Turbopack's detected root; the
successful validation build temporarily set `turbopack.root` to the containing
primary workspace. This environment-only override is not part of the change.
No tests were disabled.

That original domain task did not implement the Island UI. The subsequent
integration and journal completion add it. Journal scoped unit/action/cache and
real PostgreSQL/PGlite tests cover confirmation, source checks, immutable retries,
creator trash/restore, version conflicts, RLS, pagination, archive/departure and
transaction rollback. `tests/e2e/island-ui.spec.ts` exercises the actual production
components with injected fixture transport and real IndexedDB; it is not hosted
Auth/RLS acceptance. See the integration report for final aggregate check results.
Physical installed-PWA, hosted Supabase and independent PostgreSQL-connection
lock stress are not proved by these scoped tests.
