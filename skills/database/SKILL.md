---
name: nha-minh-database
description: Design and change Nhà Mình PostgreSQL/Supabase schemas, constraints, migrations, RLS policies, and transactional invariants safely.
---

# Database Skill

## Principles

- database constraints for real invariants;
- RLS for tenant/House isolation;
- migrations are versioned;
- avoid JSON blobs when typed relational structure is materially safer;
- use UTC timestamps;
- support soft deletion where lifecycle requires it.

## Two-member invariant

House membership must be transactionally safe.
Do not rely only on checking count in the client.

## Game turns

Prevent:
- wrong-player move;
- duplicate sequence;
- stale turn overwrite.

Prefer:
- transaction / RPC / server-controlled validation.

## Pairing

Invite:
- hash token if stored;
- expire;
- single use;
- fail when House full.

## RLS review

For each new table:
- SELECT
- INSERT
- UPDATE
- DELETE

must be considered separately.

## Migrations

Destructive:
- ADR;
- explicit approval;
- backup/rollback plan.
