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

The reviewed integration includes private House/pairing, Home with rabbit/owl identities, Presence/Knock, Board, Excalidraw Whiteboard, the four async games, Letters and a source-derived Island. Home links to protected `/whiteboard`, `/games`, `/letters` and `/island` routes. Games preserve turn artifacts and conflict drafts; Letters respects scheduled/sealed actor projections and requires both partners online in the same explicit joint reveal session. No demo memories or client-controlled Island progression are used.

Codex owns integration of Gemini branches and the final gates: [integration process](docs/INTEGRATION.md). [V1 integration review](docs/V1_INTEGRATION_REVIEW.md) records findings and verification; [completion status](docs/COMPLETION_STATUS.md) distinguishes remaining code from hosted/device acceptance. Board currently creates notes/stickers; link/photo/audio/doodle creation and media rendering are incomplete. Cold offline private recovery and confirmed Memory/Milestone producers also remain incomplete. The user's earlier two-account auth/House trial passed; this does not prove the new hosted Games/Letters/Storage flows. Database installation and real-device acceptance are still required. The current Island preserves game-derived evidence and recent artifacts, so the whole product is not yet production complete.

The photo pipeline uses a server-only `SUPABASE_SECRET_KEY`, private Storage and normalized pixels: [ADR 003](docs/ADR/003-private-photo-pipeline.md). Empty/missing media configuration keeps upload closed without disabling the other games. Never put this secret in a `NEXT_PUBLIC_*` variable. Read the [migration guide](supabase/migrations/README.md) before applying additive installers to an existing project; repository publishing does not apply migrations or deploy the app.

Historical reports: [Bootstrap](docs/BOOTSTRAP.md), [Phase 2](docs/PHASE2.md), [Phase 3](docs/PHASE3_REVIEW.md). Current contracts: [Board](docs/BOARD_DOMAIN.md), [Whiteboard](docs/WHITEBOARD_DOMAIN.md), [Games](docs/GAMES_DOMAIN.md), [Letters](docs/LETTERS_DOMAIN.md), [Island](docs/ISLAND_DOMAIN.md).

## Local development

Games production routes use the [domain contracts](docs/GAMES_DOMAIN.md); hosted schema installation and real-account acceptance remain deployment steps.

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

`/offline` is a public recovery shell for account/House-scoped recent content and
local note/doodle drafts. Open Home online once to prepare the verified namespace;
choose **Mở bản đã lưu** to recover it. Reconnect verifies identity before sync.
No authenticated HTML, API response or private media is cached by the worker.
Use a production build to test closed-app offline recovery.

For an existing Phase 2 Supabase project, see [V1 hosted setup](docs/V1_HOSTED_SETUP.md)
and the guarded `supabase/upgrade-phase2-to-v1.sql`. Photo/voice uploads need the
server Secret key; optional background push also needs VAPID and a scheduler.
See [private media](docs/PRIVATE_MEDIA.md), [notifications](docs/BACKGROUND_NOTIFICATIONS.md)
and [current completion status](docs/COMPLETION_STATUS.md) for remaining acceptance gates.

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
