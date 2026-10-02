# Supabase migrations

Whiteboard: `20261002020000_whiteboard_snapshots.sql` is additive and enables RLS at table creation. Both members save through one versioned RPC; clients cannot write tables directly. Existing hardened Phase 2/Board projects may use generated `../install-whiteboard.sql` once. Keep applied migrations immutable; do not use the fresh-project setup on an existing House.

Board domain adds `20261002010000_board_domain.sql`: shared edit rights, creator-only trash/restore, optimistic versions, immutable retry receipts, and same-House private media references. Client writes use only `apply_board_operation`; old Board write RPC grants are revoked. Existing projects use the guarded transactional `../install-board-domain.sql` (Board absent) or `../upgrade-board-domain.sql` (legacy Board present). Regenerate with `node scripts/generate-board-upgrade.mjs`. No remote schema is modified by generation. Read [the contract and verification limits](../../docs/BOARD_DOMAIN.md) before UI integration or deployment.

The bootstrap creates no SQL tables, policies, buckets, or user data. Add schema only with the feature that needs it and its authorization tests. No remote Supabase project is configured or changed by the bootstrap.

The Phase 1 identity/House schema is followed by an additive House-authorization repair and the Phase 2 Presence/Knock schema. The repair does not delete user data and deliberately fails if existing memberships violate the two-member or one-active-House constraints. See [ADR 001](../../docs/ADR/001-house-security-and-phase2.md) for policy, concurrency, and rollback decisions.

Phase 2 writes use `set_presence`, `clear_presence`, `send_knock`, `dismiss_knock`, and `set_notification_preferences`. Pairing uses `create_house_with_owner`, `create_pairing_invite`, and `accept_pairing_invite`. Each RPC derives the authenticated caller and their House. Client table writes to memberships, Houses, invites, Presence, Knock, dismissals, and notification preferences are denied; SELECT is RLS protected. Profile INSERT/UPDATE remains owner-only.

`src/lib/supabase/authorization.integration.test.ts` applies every SQL migration to an in-memory PostgreSQL instance through PGlite, then executes policies under real `authenticated` and `anon` roles. The `auth.uid()`/`auth.users` boundary is a test shim. All 15 tests passed on 2026-10-01 using `node node_modules/vitest/vitest.mjs run src/lib/supabase/authorization.integration.test.ts`; the committed SQL is executed in timestamp order without transformations. This is actual PostgreSQL authorization testing, but it does not exercise a hosted Supabase service, Realtime, or independent concurrent connections. Complete the local Supabase checks below before deploying to a real project.

The user confirmed that no Supabase project exists yet. The unapplied original Phase 1 migration received only a creation-order repair: two SELECT policies were moved after their referenced membership table is created. Policy definitions were preserved, and the later additive migration provides the security hardening. The full chain now applies from a fresh database. No remote database, user data, or installed migration history was changed.

For a new development project, `../setup-new-project.sql` is a generated, one-time SQL Editor installation artifact, not an additional migration. Regenerate with `node scripts/generate-supabase-setup.mjs`. It preserves canonical SQL except trailing whitespace, wraps all migrations in one transaction, rejects an existing application schema, and requests PostgREST schema reload. Record the applied timestamps if installing manually; reconcile migration history before later using CLI `db push`. Future schema changes remain versioned migrations; the Dashboard is not a separate source of schema edits.

Name each migration `YYYYMMDDHHMMSS_descriptive_snake_case.sql`, using a UTC timestamp (for example, `20261001090000_create_houses.sql`). Prefer `supabase migration new descriptive_snake_case` when the CLI is installed. Keep applied migrations immutable; introduce a new migration for a later change.

Before exposing a table through the Supabase API:

1. Add appropriate keys, foreign keys, constraints, and UTC timestamps.
2. Enable RLS in the same migration. Consider SELECT, INSERT, UPDATE, and DELETE independently and deny unauthorized access by default.
3. Authorize couple-owned rows from authenticated House membership. A client-provided `house_id` is never sufficient evidence.
4. Enforce at most two active House members within transactions, including concurrent pairing attempts. Pairing invites must have high entropy, expiry, single use, and stored token hashes.
5. Use private storage buckets and House/member-authorized access for media.
6. Generate typed Supabase database definitions from the applied schema before adding application queries.
7. Test member access, outsider denial, cross-House isolation, relevant state/version checks, and storage isolation against a local Supabase database. Unit tests mocking a client are not RLS tests.

Once migrations exist, provision the local Supabase CLI configuration as part of that feature, apply from a clean local database, and run its database integration/RLS tests before deployment. Review the migration separately from application code. Do not use the Supabase Dashboard as the untracked source of schema changes.

Destructive changes require an ADR, explicit approval, and a backup/rollback plan before execution, as required by `AGENTS.md`, `docs/SECURITY.md`, and `skills/database/SKILL.md`. Do not add reset/drop commands to routine CI or bootstrap scripts.

Games V1: apply `20261002030000_game_domain.sql` after the hardened Board/media domain. `../install-games.sql` is its generated guarded additive installer, not another migration. It adds six RLS-protected tables and transactional session/read/write RPCs; no Storage policy or existing-data mutation is included. Regenerate with `node scripts/generate-game-install.mjs`. See [Games contract and verification](../../docs/GAMES_DOMAIN.md).
