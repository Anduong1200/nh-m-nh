# ADR 001: House authorization and Phase 2 persistence

Status: accepted for local implementation; remote deployment requires applying and reviewing the migrations.

## Context

Phase 2 adds the Home interactions, explicit temporary Presence, and lightweight Knock from the frozen V1. The existing identity/House migration contains forward references, a recursive membership policy, direct membership insertion, and a count-based capacity trigger without a serialized lock. Those defects would undermine the House boundary needed by Phase 2.

## Decision

Keep Supabase Auth, PostgreSQL RLS, cookie sessions, and the existing House model. Apply an additive hardening migration rather than replacing authentication or deleting relationship data. If existing data violates the two-member or one-active-House rules, the migration fails and preserves it for an explicit remediation decision.

Active membership has one of two slots. Partial unique indexes enforce one member per active slot and one active House per user. Membership writes run through authenticated, narrowly scoped RPCs. Each pairing transaction locks the House row; accepting an invite also locks its row. Security-definer functions use a fixed empty search path, derive the caller with `auth.uid()`, and have explicit execution grants. Stable membership helpers avoid recursively querying the membership RLS policy.

Presence is one versioned row per member and House. The caller edits only their own row through compare-and-set RPCs. Clearing a status leaves a versioned tombstone so a delayed offline edit cannot silently resurrect it. Partners can read only active, unexpired statuses; the owner can read the tombstone to resolve stale edits. No online state, activity inference, or status history is recorded.

Knocks are append-only notes of at most 160 characters or a bounded sticker identifier. The server derives sender, recipient, and House. The caller supplies an operation UUID for retry idempotence. Reusing that UUID with a different payload fails. A recipient-only dismissal remains private and is never a read receipt visible to the sender.

Notification preferences belong solely to the user. Generic text is the default; preview detail is an explicit preference. Quiet hours use minutes after midnight and an IANA timezone. Phase 2 records no push endpoint or private media. Browser notification delivery must respect preferences and cannot become a dependency for receiving a Knock in Home.

## Alternatives

Keeping the original count-only trigger would not protect simultaneous inserts. A one-row-per-House unique index would incorrectly allow only one partner. Two active slots preserve the existing membership table while providing a native unique constraint for the actual capacity. Replacing Supabase Auth or introducing another authorization service is unnecessary.

Direct client mutations with additional RLS checks could be made safe, but narrow RPCs make actor derivation, invite consumption, version checks, and retry semantics explicit in a single transaction. Direct table SELECT remains RLS protected. Profile creation and editing retain the existing owner-only policies; Housemate profile access uses the nonrecursive helper.

## Consequences and verification

Anonymous users and outsiders cannot read House content. Housemates may read shared status and Knock content; only the owner changes Presence or preferences, and only the recipient dismisses a Knock. Exposed tables enable RLS in their creation migration, with separate access decisions for each operation.

Local database tests execute the complete, ordered SQL migration chain and RLS in PostgreSQL through PGlite with an `auth.uid()` test shim and actual `authenticated`/`anon` roles. All 15 tests passed on 2026-10-01 using `node node_modules/vitest/vitest.mjs run src/lib/supabase/authorization.integration.test.ts`. They cover two Houses, an outsider, direct pairing bypass, capacity, expired/reused invites, spoofed actors, stale versions, replayed operations, and private notification/dismissal access. The committed SQL is executed without source transformations. These tests do not verify a hosted Supabase Auth, Realtime service, browser push service, or simultaneous connections. Native unique constraints remain the final concurrent capacity guarantee; a local Supabase integration check is still required before remote deployment.

No destructive data operation, public bucket, tracking service, paid dependency, or additional V1 feature is introduced.

## Migration and rollback

The user confirmed that no Supabase project has been created. The unapplied Phase 1 baseline therefore received a creation-order-only repair: its Housemate profile and House SELECT policies were moved immediately after `house_members` is created. Their definitions and all other baseline behavior remain unchanged. The additive repair then replaces the unsafe baseline policies and RPCs. The complete migration chain now applies successfully to a fresh PostgreSQL instance; no remote schema was changed. Once deployed, migration history must remain immutable.

Apply migrations in timestamp order inside normal migration transactions. The additive security repair assigns deterministic slots to existing active members, creates constraints, replaces unsafe policies/RPCs, and narrows grants without deleting rows. It intentionally aborts on more than two existing active members or multiple active Houses per user. Such data requires an explicit reviewed remediation, not automatic removal.

Do not roll back by restoring the unsafe policies or dropping content tables. If deployment fails, let the migration transaction roll back and keep the existing data. After successful deployment, repair problems with a forward migration; preserve Presence, Knock, preferences, and dismissals. Any future leave/re-pairing RPC must acquire the same House lock and maintain the unique active membership constraints.
