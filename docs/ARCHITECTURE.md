# Architecture

## Recommended stack

- Next.js
- React
- TypeScript strict
- Tailwind CSS
- shadcn/ui selectively
- Supabase Auth
- PostgreSQL
- Supabase Storage
- Supabase Realtime
- Service Worker
- IndexedDB
- Vitest
- Playwright
- Vercel + Supabase

## Architectural principles

1. Database authorization over UI-only authorization.
2. Async-first interaction.
3. Offline-tolerant writes where practical.
4. Small coherent domain modules.
5. No premature microservices.
6. No custom realtime infrastructure unless Supabase becomes an evidenced bottleneck.
7. No custom canvas engine in V1 if a mature library can satisfy requirements.

## Suggested domain boundaries

- auth
- profiles
- houses
- pairing
- presence
- knocks
- board
- whiteboard
- games
- letters
- island
- media
- notifications
- export
- sync

## House invariant

Each V1 House:
- maximum 2 active members.

Prefer enforcing this at the database/transaction layer, not only application code.

House entry requires verified identity, an active House and authorized membership. Additive mascot identity must not prevent a Phase 2 project from opening its House: only the known missing `house_members.mascot` column permits an RLS-protected baseline member read, with the same actor/capacity checks and an explicit `identityReady=false`. Other database/auth errors remain closed and render a generic retry state. Identity setup activates once the column is available; optional Board failure does not disable Presence/Knock, and its offline sync coordinator stays paused until authorized Board state has loaded. See `LOCAL_AUTH_SETUP.md` for the separate, transactional identity upgrade.

## Offline model

Client:
- render cached state;
- create local draft/action;
- persist action to IndexedDB;
- mark as pending;
- sync when connected.

Server:
- validate auth;
- validate House membership;
- validate version/turn state;
- commit;
- return authoritative state.

Conflict:
- auto-merge only for safe append-only events;
- otherwise show conflict and require an explicit resolution;
- never silently overwrite partner work.

## Realtime

Board writes use an atomic operation ledger and immutable retry receipts, with creator-only trash/restore and shared edit rights. Note/doodle offline operations bind to the original account/House and preserve conflicts; a persistent IndexedDB epoch prevents late responses from repopulating data after logout in another tab. The production Board UI uses this coordinator. See [Board domain](BOARD_DOMAIN.md) for schema, action and media-reference boundaries.

Use realtime for:
- fresh presence;
- new Knock;
- game-turn update;
- board refresh.

Do not make core flows unusable without active realtime subscription.

## PWA

Support:
- manifest;
- installability;
- standalone display;
- service-worker caching;
- update UX;
- offline fallback;
- safe notification registration.

## Time

Persist timestamps in UTC.
Render in each user’s local timezone.
Scheduled letters must store an unambiguous instant plus relevant user-facing timezone metadata when needed.

## Whiteboard

Whiteboard V1 uses a browser-only Excalidraw adapter and versioned Supabase snapshots. The existing account/House-bound IndexedDB store retains drafts and immutable pending operations; explicit full-scene conflict decisions prevent silent replacement. See [ADR 002](ADR/002-whiteboard-library-and-snapshot-sync.md) and [Whiteboard integration](WHITEBOARD_DOMAIN.md).

## Games

The protected `/games` UI shares authorized sessions, two fixed players, ordered immutable events and completion artifacts. Transactional RPCs enforce turns and exact replay receipts; answers have separate owner/reveal access. Account/House-bound IndexedDB drafts and versioned queued proposals preserve conflicts on reconnect. Established Excalidraw tooling records new pen contributions without replacing partner strokes. See [Games domain](GAMES_DOMAIN.md); Games do not require realtime.

## Letters

Letters separate envelope metadata, sensitive bodies and recipient-private opening truth. Scheduled eligibility is evaluated against DB time; joint opening requires fresh presence and two confirmations in a short-lived explicit session. RPCs enforce participant access and exact send/open retries. See [Letters core](LETTERS_DOMAIN.md) for timezone resolution, client lifecycle and the UI contract.

## Island

Shared Island derives a read-only world projection from a House-private event ledger. Completed game artifacts emit events in the same transaction; the browser cannot append events or increment progress. The invoker view recomputes counters/flags rather than mutating a level. See [Island domain](ISLAND_DOMAIN.md) for versioned rules and reserved Memory/Milestone producers.

## Media

Private storage only.
Do not trust user-provided filenames or MIME metadata without validation.
Use bounded file size and duration.

Photo Mission uses a server-only Supabase secret for fully decoded, normalized
photo upload and one service-only metadata registration RPC. Reads use the
requester's RLS client through a no-store same-origin endpoint. Restrictive
Storage guards isolate the private bucket even alongside broad authenticated or
anonymous policies on other buckets. See [ADR 003](ADR/003-private-photo-pipeline.md).

## Integration ownership

Codex reviews and integrates Gemini branches, then verifies the resulting tree.
The required sequence and release gates are in [Integration ownership](INTEGRATION.md)
and [V1 integration review](V1_INTEGRATION_REVIEW.md).

## V1 completion integration

The protected `/board` entry exposes real mixed content and versioned creator-only
trash/restore. The Island journal persists confirmed memories and calendar-date
milestones; its transactional producer appends ledger events without client-side
progress increments. Private photo/PCM voice uploads validate bytes and require
the server Secret key; no public media bucket is used.

The public `/offline` recovery shell is separate from authenticated HTML. It
opens only the most recently verified local namespace with an explicit gesture,
preserves drafts and gates reconnect transport behind fresh identity validation.
The background push outbox is opt-in and server-dispatched. See
[ADR 004](ADR/004-cold-offline-and-background-delivery.md),
[hosted setup](V1_HOSTED_SETUP.md) and [background notifications](BACKGROUND_NOTIFICATIONS.md).
