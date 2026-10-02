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

Board writes use an atomic operation ledger and immutable retry receipts, with creator-only trash/restore and shared edit rights. Note/doodle offline operations bind to the original account/House and preserve conflicts; a persistent IndexedDB epoch prevents late responses from repopulating data after logout in another tab. The domain requires adapting existing UI action calls and replacing the legacy coordinator before integration. See [Board domain](BOARD_DOMAIN.md) for schema, action and media-reference boundaries.

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

The four V1 games share authorized sessions, two fixed players, ordered immutable events and completion artifacts. Transactional RPCs enforce turns and exact replay receipts; answers have separate owner/reveal access. Account/House-bound IndexedDB drafts and versioned queued proposals preserve conflicts on reconnect. See [Games domain](GAMES_DOMAIN.md) for contracts and UI integration. Games do not require realtime or change private-media permissions.

## Media

Private storage only.
Do not trust user-provided filenames or MIME metadata without validation.
Use bounded file size and duration.
