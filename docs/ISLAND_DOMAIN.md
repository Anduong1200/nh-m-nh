# Shared Island domain

V1 contract: trusted domain events → deterministic world state. The browser has
no append-event, update-state or increase-level endpoint. No XP, currency, decay,
streak or relationship score is introduced. UI composition stays with the UI workstream.

## Contracts and rules version 1

`src/modules/island/model.ts` defines `IslandEvent`, `IslandState`, codecs and the
reference `deriveIslandState(houseId, events)`. The reference projection is for
trusted data and tests; calling it in a browser does not confer write authority.

| Event | Source | Rule / current producer |
| --- | --- | --- |
| `GAME_COMPLETED` | `game-artifact`, session UUID | Completed persisted artifact, generated in the game's transaction. |
| `MISSION_COMPLETED` | Same Photo Mission artifact | Additional category; not a second history item. |
| `MEMORY_CREATED` | `confirmed-memory`, UUID | Reserved contract. No producer until Memory persistence validates explicit confirmation. Game completion never automatically promotes a memory. |
| `MILESTONE_CREATED` | `milestone`, UUID | Reserved contract. No producer until the authorized Milestone domain persists it. |
| `WEEKLY_ACTIVITY` | `activity-week`, UTC Monday date | One per House/week containing a completed game. Uses completion time, including backfills; no login, presence, last-seen or faith activity tracking. |

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
invented progress. Reserved Memory/Milestone emitters must be added with source
validation and same-House constraints in their own migrations before activation.
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
state. This domain does not introduce another write queue or an offline screen.
UI integration must use existing account/House-bound, bounded recent-content
caching if it displays a cached Island state, label it cached, and refresh after
game sync/reconnect. Hosted Auth/DB acceptance and offline Island UI are separate.

## Installation

Apply `20261002040000_island_event_projection.sql` through normal migrations.
For an existing hosted project with hardened House and Games domain already
installed, `supabase/install-island.sql` is a guarded transactional equivalent.
It adds the ledger/view/trigger and backfills completed artifacts without deleting
or modifying history. Repeat installation fails safely. No hosted SQL was applied
by this workstream.

Regenerate with `node scripts/generate-island-install.mjs` and
`node scripts/generate-supabase-setup.mjs`. The latter is only for a fresh project.

## Verification

Unit/action tests cover deterministic derivation, retries, event identity,
UTC boundaries, no decay, category overlap, malformed state and stale auth.
Real PostgreSQL/PGlite tests cover migration/install backfill, game completion,
Photo Mission, direct read/write RLS, private emitter privileges, failure rollback,
archive/departure and SQL/TypeScript projection parity. Browser regression uses
the existing three-browser Games fixture (simulated HTTP, real IndexedDB); it
does not pretend to test a production Island UI or hosted Supabase.

Validated on 2026-10-02:

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

Not run: a production Island UI/manual Island browser flow (not implemented by
this domain task), physical installed-PWA acceptance, hosted Supabase migration/
Auth/Storage acceptance, or independent PostgreSQL-connection race stress.
