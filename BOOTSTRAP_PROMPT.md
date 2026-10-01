# Bootstrap Prompt

You are bootstrapping the **Nhà Mình** V1 repository.

Before doing any work, read:

- `AGENTS.md`
- `PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/UX_RULES.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TESTING.md`
- `skills/product/SKILL.md`
- `skills/security/SKILL.md`
- `skills/pwa-offline/SKILL.md`

## Goal

Create a production-oriented project skeleton for the frozen V1 without implementing speculative product features.

## Required baseline

Use:

- Next.js
- React
- TypeScript strict
- Tailwind CSS
- Supabase client/server integration
- PWA manifest/service-worker baseline
- IndexedDB abstraction suitable for later offline queue
- Vitest
- Playwright
- lint/typecheck/build scripts

Prefer `pnpm` unless the existing environment materially favors another package manager.

## Initial domain structure

Create clean module boundaries for:

- auth
- houses/pairing
- presence
- knocks
- board
- whiteboard
- games
- letters
- island
- media
- notifications
- offline/sync

Do not overbuild empty abstractions.

## Required foundation deliverables

1. App shell with adaptive day/night design tokens.
2. Responsive desktop-first layout and mobile shell.
3. PWA manifest and installability baseline.
4. Environment variable validation.
5. Supabase client/server helpers with no service-role exposure.
6. Migration directory conventions.
7. Test setup.
8. Playwright smoke test.
9. CI-ready scripts for lint, typecheck, test, E2E, build.
10. README instructions for local development.

## Security constraints

Do not implement fake security.
Do not create client-accessible tables without planned RLS.
Do not use public buckets for eventual private media.
Do not embed secrets.

## Non-goals for this bootstrap

Do not yet implement:
- full pairing;
- real game logic;
- letters;
- Shared Island progression;
- realtime whiteboard;
- Radio;
- Campfire;
- AI;
- analytics.

## Quality gate

Before finishing:

- lint
- typecheck
- unit test
- Playwright smoke test
- production build

Report exact results.

If any architectural choice deviates materially from the canonical docs, create an ADR first.
