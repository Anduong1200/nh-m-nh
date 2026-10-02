# Nhà Mình

**Tagline:** *Ngôi nhà nhỏ và thế giới của hai đứa.*

Nhà Mình là một private PWA dành đúng cho hai người đang yêu xa. Sản phẩm không cạnh tranh với Locket ở photo-sharing; thay vào đó nó tạo một không gian chung để để lại dấu vết, nghịch cùng nhau, hiểu nhau hơn và tích lũy một thế giới riêng theo thời gian.

## Product pillars

1. **Presence** — “Mình đang ở đây.”
2. **Play** — “Cùng nghịch một chút.”
3. **Understanding** — “Hôm nay mình đang ở trạng thái nào?”
4. **Memory** — “Giữ lại điều đáng giữ.”
5. **Shared World** — “Cả hai cùng xây nên một hòn đảo.”

## Core identity

- Cozy
- Adventurous
- Cute
- Scout
- Weird
- Playful
- Couple identity level: **5/5**
- Cute level: **4/5**
- Visual language: scrapbook + hand-drawn + field notebook
- Mascots: **Thỏ** và **Cú**
- Scout/TNTT/Catholic identity is meaningful but must not turn the app into an organization-management tool.

## V1 scope

1. Authentication
2. Pairing / House
3. Interactive Home
4. Presence / Status
5. Knock
6. Shared Board
7. Whiteboard
8. Four mini-games
9. Letters
10. Shared Island

See `PRODUCT_SPEC.md`, `AGENTS.md`, and `docs/`.

## Engineering baseline

- TypeScript strict
- Next.js + React
- Tailwind CSS
- Supabase Auth / PostgreSQL / Storage / Realtime
- PWA + Service Worker + IndexedDB
- Vitest
- Playwright
- Vercel + Supabase
- Desktop-first, mobile responsive, installable PWA
- Offline: cached reading + local creation queue for notes/doodles, then sync

## Non-goals

- Public social network
- Locket replacement
- Chat replacement
- Location surveillance
- Last-seen pressure
- Relationship scoring
- Streak anxiety
- Engagement dark patterns
- Ad monetization

## Implementation status

The foundation includes Next.js/React/strict TypeScript/Tailwind, a public Home illustration, adaptive light, Supabase helpers, PWA fallback, account-scoped IndexedDB, Vitest, Playwright and CI. Phase 1 supplies Google sign-in and House/pairing flows. Phase 2 adds the private interactive Home, explicit temporary status, note/sticker Knock, and privacy/quiet-hour preferences. Future objects remain clearly decorative.

Read [Phase 2](docs/PHASE2.md) for the preliminary assessment, behavior and verification limits, and [Bootstrap](docs/BOOTSTRAP.md) for the historical foundation report. The unapplied Phase 1 migration's creation order is repaired and all 191 local tests pass, including actual PostgreSQL RLS. The user reports Google sign-in and House entry after development setup; real two-account pairing and bidirectional Knock delivery remain unverified. Do not treat fixture browser tests as hosted cross-device delivery. [Local Google sign-in setup](docs/LOCAL_AUTH_SETUP.md) explains the remaining steps.

The user later reported a successful two-account trial. [Phase 3 review](docs/PHASE3_REVIEW.md) records Board/Whiteboard/offline acceptance and requested editable names with stable rabbit/owl identities. Gemini has added identity and Board note/link code; complete Phase 3 acceptance remains pending. [Workstream B](docs/WORKSTREAM_B.md) documents the verified Presence/Knock server, expiry/RLS, notification abstraction, API contract and integration limits on `feature/presence-knock`.

Update 2026-10-02: all local Home, Presence/Knock, Board and Whiteboard workstreams are merged into `main`. [Board](docs/BOARD_DOMAIN.md) includes its versioned domain, durable offline queue and updated note/sticker UI. [Whiteboard](docs/WHITEBOARD_DOMAIN.md) includes Excalidraw tooling, authorized snapshots, offline drafts and explicit conflict recovery; [ADR 002](docs/ADR/002-whiteboard-library-and-snapshot-sync.md) records the library comparison. Whiteboard still needs its Home entry connected, the additive schema applied to the hosted project, and live/physical-PWA acceptance checks. Publishing this repository does not apply database migrations or deploy the app.

## Local development

Phase 4 Games domain: [contracts and UI handoff](docs/GAMES_DOMAIN.md) cover the four async games, generic sessions/events/turns/players/artifacts, transactional RLS/turn validation, exact retries and durable offline/reconnect. Production game screens and hosted schema installation remain integration steps.

Use Node.js 22.12+ on the 22 LTS line (or Node 24 LTS) and pnpm 11.25.0. Install pnpm with Corepack where available (`corepack enable`, then `corepack prepare pnpm@11.25.0 --activate`) or the official pnpm installer.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The public shell runs without Supabase credentials. To configure the integration, copy `.env.example` to `.env.local`, then set both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from a development Supabase project. Use a modern `sb_publishable_` key; never a secret or service-role key. Invalid/partial configuration fails at startup/build. Empty configuration cannot access auth or private data. No database migration is applied by installation.

Service workers register only in production mode. To exercise the install/offline baseline:

```sh
pnpm build
pnpm start
```

The worker has scope `/` and displays a generic offline fallback; it does not cache private pages. Install on HTTPS or localhost. iOS uses Safari's Add to Home Screen; native installation and device background behavior require real-device verification. New worker versions offer an explicit refresh rather than interrupting a visit.

## Verification

```sh
pnpm exec playwright install chromium webkit
pnpm lint
pnpm typecheck
pnpm test
pnpm build:e2e
pnpm test:e2e
```

`pnpm check` runs all five gates in that order. `build:e2e` makes a production test build with empty Supabase configuration, independently of the ignored `.env.local`; it does not modify that file or the running development preview. Use `pnpm build` for the configured deployment build. Playwright starts the built app on `127.0.0.1:3100` and the isolated Home UI fixture on `127.0.0.1:3103`; keep both ports available. The manual fixture preview defaults to port 3102. Projects cover desktop Chromium, iPhone 12 WebKit and Android Chromium. On Linux CI install browser dependencies with `pnpm exec playwright install --with-deps chromium webkit`. Playwright is pinned to 1.60.0 to match the available local Chromium test runtime; its own browser installer and CI use the corresponding revisions.

Unit/integration tests cover environment validation, verified identity/cookie adapters, offline persistence, domain/action behavior, and actual PostgreSQL RLS through PGlite. The complete ordered migration suite passes after the baseline creation-order repair. E2E covers the production public shell/private route denial plus isolated HomeRoom interactions; mock/fixture tests do not prove hosted auth or cross-device delivery. See the exact results in `docs/PHASE2.md`.

## Layout and migration conventions

- `src/app`: App Router shell and state screens.
- `src/components`: UI and browser runtime.
- `src/lib`: environment, Supabase and IndexedDB infrastructure.
- `src/modules`: ownership boundaries for the frozen V1; no empty service framework.
- `supabase/migrations`: timestamped identity/House hardening and Phase 2 schema; no remote schema/buckets provisioned by local setup.
- `tests/e2e`: production-server and isolated UI browser checks.
- `tests/ui-fixture`: test-only HomeRoom renderer/backend, never a production route.
- `.github/workflows/ci.yml`: lint, types, unit tests, build and browser gates.

Future tables require RLS and cross-House tests in the same change; enforce two active members transactionally. Future media buckets must remain private. See `docs/SECURITY.md` and `supabase/migrations/README.md` before adding any database-backed flow.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Playwright browser projects](https://playwright.dev/docs/browsers).
