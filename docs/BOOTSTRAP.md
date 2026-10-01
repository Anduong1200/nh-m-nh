# Bootstrap foundation

This is the historical Phase 0 report. Current implementation and verification limits for Home/Presence are in [Phase 2](PHASE2.md); statements below describe the bootstrap boundary at its original verification.

## Implemented boundary

The app is a public, static welcome and Home illustration. It contains no authenticated House data, account creation, pairing, game logic, letters, progression, media uploads or push subscriptions. The frozen V1 scope is unchanged. Existing product and architecture documents remain canonical.

Next.js App Router, React, strict TypeScript and Tailwind provide the shell. pnpm is the package manager. Body fonts use the operating system; no third-party font or analytics request is introduced. Color tokens are provisional prototype values rather than a frozen palette. Local device time selects day/night; users may persist an override on their device without sharing time/location with a partner.

## Environment and Supabase

An absent pair of public Supabase variables permits shell-only development. A partial or malformed pair fails configuration validation at Next startup/build. Client/server factories require complete configuration. Only a publishable key is accepted; the application contains no admin/service-role client.

Cookie-aware server/client helpers and a token-refresh proxy are integration infrastructure, not authorization for future House content. Each protected route must verify identity, check membership through database authorization, and ship RLS/transaction tests. No tables or storage buckets are provisioned. Migration conventions live in `supabase/migrations/README.md`.

## Offline and PWA

The service worker caches an explicit public fallback and icons plus immutable same-origin static assets. Navigation HTML, RSC responses, API traffic, Supabase responses and private media are not cached. Offline navigation displays a public generic fallback. Private recent-content caching must use the account-scoped IndexedDB abstraction after authentication is implemented.

IndexedDB provides local drafts and operation storage, not a background delivery guarantee. Callers will supply a server-verified account ID; local namespacing does not replace server authorization or encrypt device storage. Stored operation IDs support future idempotent server retries; every new enqueue creates a new operation and the server must enforce deduplication. Updates carry a base version and preserve conflict variants. Logout integration must handle pending work transparently before account cleanup. No feature presently writes personal content to the store or syncs it to Supabase.

Updates require an explicit refresh; new workers do not force activation and discard unsaved UI state. Notifications and OS installation prompts are not simulated. Production installability requires HTTPS; localhost supports development service workers. Physical iOS/Android installation and background lifecycle behavior remain deployment checks.

## Quality gates

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` run separately in CI and in order via `pnpm check`. E2E uses the production server on port 3100 and covers desktop Chromium, iPhone 12 WebKit and Android Chromium. Tests assert real bootstrap behavior: rendering, theme/accessibility controls, responsive bounds, manifest/icons, service worker scope and offline privacy. Future feature-specific authorization and database tests are still required.

## Deferred by bootstrap instructions

Authentication screens, pairing, schemas/RLS, buckets, realtime, canvas tooling, real game rules, letter delivery and Island progression require their own scoped implementation and tests. Radio, Campfire, AI and analytics remain excluded.

## Verified 2026-10-01

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed after allowing the required native resolver build. |
| `pnpm lint` | Passed, zero warnings. |
| `pnpm typecheck` | Passed, including generated Next route types and strict optional/index checks. |
| `pnpm test` | Passed: 7 files, 61 tests. |
| `pnpm build` | Passed: public Home, not-found and manifest prerendered. |
| `pnpm test:e2e` | Passed: 21 tests, desktop Chromium / Android Chromium / iPhone 12 WebKit, no skips. |

Day/night render captures were visually reviewed at 1440px desktop and 390px iPhone WebKit. Both had no horizontal overflow. Theme selection, keyboard skip navigation and reconnect behavior were exercised in the browser suite. Native interactive browser tooling could not initialize on this host, so visual review used Playwright screenshots.

Initial Playwright 1.63 browser downloads timed out; pinning 1.60 matched the installed Chromium runtime and its WebKit installer succeeded. The final browser command ran outside the sandbox to permit browser/server process teardown. Offline E2E stops a real temporary origin because WebKit `setOffline(true)` rejects service-worker responses ([upstream issue](https://github.com/microsoft/playwright/issues/42775)). Connectivity notices are tested separately with offline emulation.

No live Supabase credentials, schema or private media pipeline exists, so live auth/RLS/storage tests were not run. Physical iOS/Android installation, standalone lifecycle and hosted CI execution were not run. ESLint 9 is pinned to the current Next configuration's React/accessibility plugin peer ranges; npm labels this major deprecated, so the tooling stack needs an upgrade when those plugins support ESLint 10. These limitations do not imply completed V1 feature flows.
