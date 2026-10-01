# Phase 2 — Home & Presence

## Preliminary assessment

The bootstrap supplies a responsive day/night visual system, privacy-conscious public PWA fallback, account-scoped offline primitives, and browser/test infrastructure. Its small-home identity fits the canonical product. It was a foundation, not evidence that authenticated product flows were complete.

The inherited Phase 1 code needed prerequisite repairs: policies referenced membership before table creation, membership RLS was recursive, direct membership writes could bypass invites, the capacity trigger did not serialize pairing, an invite RPC used an invalid aggregate locking query, and the House query attempted a nonexistent profile relationship. OAuth also lost the pairing destination and accepted an unsafe callback destination. These issues are addressed by an additive authorization migration and application repairs, except the original migration's creation order while its applied status is unknown.

The V1 scope remains frozen. This phase implements only Home, explicit Presence, Knock, and notification preferences. Board, Whiteboard, games, Letters, and Island progression remain later roadmap work. Visible future objects are decorative and labelled inactive.

## Implemented behavior

- A paired House opens a spatial Home with rabbit/owl illustration, device-local day/night preference, status cards, Knock shelf, and three working objects.
- Each member chooses mood, energy, availability, one line (160 characters), and an optional need (100 characters). No online/last-seen signal is inferred. Expiry is manual, one hour, four hours, or end of the writer's local day. Instants persist in UTC; IANA zones and DST are handled explicitly.
- Own status writes carry a version. A stale edit produces an explicit conflict while preserving the draft. Clearing leaves a versioned tombstone. Partner reads hide expired or cleared status.
- Knock supports a small note or one of four stickers. It is persisted for asynchronous discovery. A frozen operation UUID and payload prevent duplicate delivery on retry. Caught errors preserve the attempt for a deliberate retry.
- Recipients can put a Knock away privately. This never produces a sender-visible read receipt. The inbox query is bounded (latest 24 before dismissal filtering, up to 12 returned; Home shows up to three).
- Quiet hours and IANA timezone are per-user preferences. Generic notification text is the default. Showing the note/sticker requires explicit opt-in.
- Browser permission is requested only by an explicit button. Browser notifications work only when this Home page is open and visible on browsers that support them. Background push/subscriptions are not implemented. The in-app Knock shelf works independently of browser permission.
- The server-rendered Home is refreshed through authenticated, uncached `/house/state` approximately every 20 seconds while online and visible, and on reconnect/return to the page. Manual refresh is available. The waiting pairing page uses this refresh to discover the second member.

## Authorization and session behavior

Tables enable RLS. Membership is resolved from verified identity rather than accepting a client House ID as authorization. Narrow RPCs perform pairing, own Presence changes, Knock send/dismissal, and own preferences inside database transactions. Membership SELECT uses nonrecursive helpers with fixed search paths. Two active slots and one-active-House unique constraints complement serialized House/invite locks. See [ADR 001](ADR/001-house-security-and-phase2.md).

The controller discards responses from superseded reads and pauses polling during writes. A changed account/House closes the private Home. Each action also compares an expected viewer against verified identity within that same action request; this prevents a stale tab from sending an old account's draft after a session switch. The expectation is a safety assertion, never a source of authorization. RPC results are checked against the verified actor.

OAuth destinations are restricted to known internal House paths. A valid one-time pairing token survives sign-in and callback retries. Invite/auth/private responses are uncached and suppress referrer leakage. House profiles are read separately under their own RLS instead of relying on a nonexistent PostgREST foreign-key embed.

Logout clears the current account's IndexedDB data and invalidates private router state. Pending local operations require an explicit discard choice before cleanup. A failed sign-out is reported rather than presented as successful.

## Offline boundary

An already open Home keeps its displayed state and unfinished forms in memory when the connection drops. Writes are disabled; nothing is silently queued or sent. Dialog closing and polling do not discard a draft. Closing/reloading the page can discard an unsaved Phase 2 form, which is explained in the form. The service worker does not cache private HTML, JSON, Supabase responses, or relationship content.

Persistent note/doodle drafts, private recent-content caching, queued create operations and eventual synchronization remain Phase 3 work. Existing IndexedDB primitives remain available for that work. Phase 2 does not claim durable offline Presence/Knock delivery.

## Database installation blocker

`20261001080000_create_identity_and_house.sql` has two policies before their referenced tables. A fresh ordered migration run currently fails with `relation public.house_members does not exist`. The additive hardening migration cannot fix an earlier migration that fails to execute.

The original file remains unchanged pending confirmation whether it has already been applied. For an unapplied installation, relocating those policies after their tables is sufficient without changing product behavior. Applied migration history must be preserved and repaired through the appropriate installation path. No remote schema or user data has been modified.

## Verification boundaries

Vitest covers pure expiry/privacy rules, verified identity and action boundaries, errors, retry semantics, and account switches. PGlite tests execute the actual timestamped migrations in PostgreSQL using an `auth.uid()` shim and real anonymous/authenticated roles. They cover two Houses, outsiders, direct membership bypass, capacity, expired/reused invites, Presence versions, Knock idempotency, and private preferences/dismissals. PGlite does not provide independent concurrent connections or hosted Supabase services.

Playwright tests the production public app and an isolated UI fixture on port 3102. The fixture renders the actual HomeRoom with the built stylesheet and a test-only in-memory backend. It covers two browser pages, status discovery, clear, offline drafts, explicit conflicts, lost-acknowledgement Knock retry, privacy defaults, notification settings, modal focus, and responsive bounds. The fixture is outside the Next application; it adds no production authentication bypass or demonstration House.

Fixture success does not establish hosted cross-device delivery. Google OAuth, two real Supabase accounts pairing, deployed RLS/PostgREST integration, cross-device Knock delivery, independent concurrent transactions, physical iOS/Android PWA installation and background lifecycle still need verification against a configured development project. No live credentials are present in this workspace.

## Verified 2026-10-01

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed, zero warnings. |
| `pnpm typecheck` | Passed. |
| `pnpm test` | Failed overall: 17 files / 176 tests passed; the PostgreSQL migration suite failed initialization, leaving its 15 cases unrun. |
| `pnpm build` | Passed, including protected Home and state routes. |
| `pnpm test:e2e` | Passed: 42 tests, desktop Chromium / iPhone 12 WebKit / Android Chromium; no skips. |
| `node tests/ui-fixture/capture.mjs` | Passed; six day/night/status captures visually inspected at 1440px desktop and 390px iPhone WebKit. |

The initial browser run found a Safari modal focus-restoration defect, which was fixed by explicitly focusing its opener before showing the dialog. The final 42-test run passed. Browser tests use a stub Notification constructor to verify permission timing and payload privacy; they do not claim native OS notification delivery.

PGlite initialization reports `relation public.house_members does not exist` while executing the actual original migration. A temporary diagnostic that relocated only those original forward-reference policies in memory passed all 15 authorization cases; it was removed and is not counted as a passing checked-in migration suite. The blocker is retained in the actual test rather than hidden by mocks or an automatic test-only rewrite.

No hosted Supabase, real Google OAuth, independent concurrent connections, physical device installation, or native notification delivery was run. Query clients still use runtime row validation; database type generation from the applied development schema remains pending with setup. Phase 2 is implemented locally but does not yet meet its complete deployment/hosted cross-device exit criterion.
