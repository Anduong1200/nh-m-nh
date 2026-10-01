# Phase 2 — Home & Presence

## Preliminary assessment

The bootstrap supplies a responsive day/night visual system, privacy-conscious public PWA fallback, account-scoped offline primitives, and browser/test infrastructure. Its small-home identity fits the canonical product. It was a foundation, not evidence that authenticated product flows were complete.

The inherited Phase 1 code needed prerequisite repairs: policies referenced membership before table creation, membership RLS was recursive, direct membership writes could bypass invites, the capacity trigger did not serialize pairing, an invite RPC used an invalid aggregate locking query, and the House query attempted a nonexistent profile relationship. OAuth also lost the pairing destination and accepted an unsafe callback destination. These issues are addressed by an additive authorization migration, application repairs, and the confirmed-unapplied baseline's creation-order correction.

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

## Database installation

The original Phase 1 migration declared two policies before their referenced tables. After the user confirmed there was no existing Supabase project, the unapplied baseline was repaired by relocating only those two policy definitions after `house_members` creation. Their definitions and other SQL behavior were preserved. The real ordered migration/RLS suite now passes all 15 cases.

Keep applied migration history immutable for future changes. No remote schema or user data has been modified by this repair. Apply all three versioned migrations in order to the new development project before exercising House creation or pairing.

## Verification boundaries

Vitest covers pure expiry/privacy rules, verified identity and action boundaries, errors, retry semantics, and account switches. PGlite tests execute the actual timestamped migrations in PostgreSQL using an `auth.uid()` shim and real anonymous/authenticated roles. They cover two Houses, outsiders, direct membership bypass, capacity, expired/reused invites, Presence versions, Knock idempotency, and private preferences/dismissals. PGlite does not provide independent concurrent connections or hosted Supabase services.

Playwright tests the production public app and an isolated UI fixture on port 3103 (manual preview defaults to 3102). The fixture renders the actual HomeRoom with the built stylesheet and a test-only in-memory backend. It covers two browser pages, status discovery, clear, offline drafts, explicit conflicts, lost-acknowledgement Knock retry, privacy defaults, notification settings, modal focus, and responsive bounds. The fixture is outside the Next application; it adds no production authentication bypass or demonstration House. `pnpm build:e2e` overrides Supabase configuration only in its child process so tests remain independent of a real development project's `.env.local`.

Fixture success does not establish hosted cross-device delivery. Google OAuth, two real Supabase accounts pairing, deployed RLS/PostgREST integration, cross-device Knock delivery, independent concurrent transactions, physical iOS/Android PWA installation and background lifecycle still need verification against a configured development project.

## Verified 2026-10-01

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed, zero warnings. |
| `pnpm typecheck` | Passed. |
| `pnpm test` | Passed after baseline repair: 18 files / 191 tests, including all 15 PostgreSQL migration/RLS cases. |
| `pnpm build` | Passed, including protected Home and state routes. |
| `pnpm test:e2e` | Passed: 45 tests, desktop Chromium / iPhone 12 WebKit / Android Chromium; no skips. |
| `node tests/ui-fixture/capture.mjs` | Passed; six day/night/status captures visually inspected at 1440px desktop and 390px iPhone WebKit. |

The initial browser run found a Safari modal focus-restoration defect, which was fixed by explicitly focusing its opener before showing the dialog. Browser tests use a stub Notification constructor to verify permission timing and payload privacy; they do not claim native OS notification delivery.

The initial PGlite run correctly exposed the original migration's forward reference. After creation-order repair in the checked-in baseline, the actual unmodified test suite executes every timestamped migration and passes without a test-only SQL rewrite.

No hosted Supabase, real Google OAuth, independent concurrent connections, physical device installation, or native notification delivery was run. Query clients still use runtime row validation; database type generation from the applied development schema remains pending with setup. Phase 2 is implemented locally but does not yet meet its complete deployment/hosted cross-device exit criterion.

## Development project connection

The user subsequently created a development project and supplied its public URL/publishable key. They are configured only in the ignored `.env.local`. A read-only `/auth/v1/settings` check succeeded and reported Google disabled. A zero-row profiles schema probe returned `PGRST205` (table absent from the exposed schema cache). No remote migrations or Auth configuration have been applied by the agent. `/auth/sign-in` on the development preview returns 200 with Google sign-in configured in the application; provider setup and schema installation still remain. See [local authentication setup](LOCAL_AUTH_SETUP.md).

The user has since reported successful Google sign-in and entry into their House after manual setup. This establishes their reported login result; hosted pairing with two accounts and bidirectional Knock delivery are still unverified.

The user subsequently reported testing with two real accounts and finding the current flow fairly stable. Exact test cases/devices were not itemized; record this as user-reported validation, not a claim of exhaustive hosted/security testing. Their next requested improvements are editable display names/nicknames and a stable House identity: the user is rabbit, their partner is owl. See [Phase 3 review](PHASE3_REVIEW.md) and the [Gemini handoff](../GEMINI_PHASE3_PROMPT.md).

## Home visual repair, 2026-10-01

The user reported misplaced Vietnamese accents and room labels covering the mascots. Headings now use a bundled Vietnamese-capable Lora variable font through `next/font/local`, including its OFL license. Body text retains the system UI font; no third-party browser font request is introduced. See [font provenance](../src/app/fonts/README.md).

Room control positions are anchored to the SVG canvas rather than the figure's variable-height caption. Decorative labels are in a caption legend, and Knock sits on the rug. Rabbit ears are separate closed shapes with a clear head/body/feet; the map is raised above a fuller owl silhouette. Assumption: repair the existing SVG illustration and keep the room interaction model and V1 scope.

The layout regression checks successful same-origin font loading, mascot/control/label separation, map/owlet separation, 44px touch targets and horizontal overflow at 320, 390, 760, 768, 980 and 1440px in day and night themes across all three browser projects. Desktop and iPhone day/night/status captures were visually inspected. Browser fixture checks do not replace testing the real Supabase partner flow.
