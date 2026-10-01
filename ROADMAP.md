# Roadmap

## Phase 0 — Foundation

- repo setup
- TypeScript strict
- lint / format
- test harness
- environment validation
- Supabase project wiring
- base design tokens
- PWA manifest
- service worker baseline
- CI checks

Exit:
- app boots;
- lint/typecheck/test/build pass;
- installable shell works on desktop and mobile test environments.

## Phase 1 — Identity & House

- Google auth
- profile bootstrap
- House creation
- one-time pairing invite
- exactly-two-member enforcement
- unpair/export flow skeleton
- RLS policies
- audit test suite for cross-house isolation

Exit:
- two users can safely pair;
- third user cannot join;
- unauthorized reads/writes fail at DB policy layer.

## Phase 2 — Home & Presence

- interactive home shell
- day/night state
- mascots
- status model
- expiry presets
- Knock
- privacy-friendly notifications

Exit:
- each partner can leave/see status;
- Knock works cross-device;
- no sensitive notification text by default.

## Phase 3 — Board & Whiteboard

- mixed-object board
- notes/photos/links/audio object types
- async whiteboard
- IndexedDB draft queue
- reconnect sync
- conflict UX

Exit:
- offline-created note/doodle survives reconnect;
- partner data is never silently overwritten.

## Phase 4 — Games

Implement:
1. Doodle Relay
2. Draw & Guess
3. One-line Story
4. Photo Mission

Shared framework:
- game session;
- turn state;
- player authorization;
- lightweight history;
- artifact output.

Exit:
- every game works async;
- game authorization is server/database enforced;
- relevant game artifacts can be saved.

## Phase 5 — Letters

- immediate
- scheduled
- sealed
- clue
- reveal together

Exit:
- delivery state is robust;
- private content stays access-controlled;
- scheduling handles timezone explicitly.

## Phase 6 — Shared Island

- world model
- progression events
- visual nodes
- memory/milestone links
- game/missions/weekly activity contributions
- no currency
- no decay

Exit:
- shared world changes meaningfully from activity;
- inactivity causes no penalty.

## V1 Hardening

- accessibility pass
- responsive pass
- iOS Safari/PWA verification
- Android Chrome/PWA verification
- Windows Chrome/Edge verification
- offline failure testing
- RLS/security regression suite
- export
- deletion lifecycle verification
- performance tuning

## V1.1 Backlog

Candidates only:

- Radio
- Campfire
- Open When
- Museum
- deeper Prayer Corner
- structured PSVN Tráng/Thiếu/Kha online program
- additional mini-games
- richer seasonal/home interactions
- realtime whiteboard
- optional AI-assisted recap after privacy review
