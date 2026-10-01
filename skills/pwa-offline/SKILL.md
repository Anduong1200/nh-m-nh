---
name: nha-minh-pwa-offline
description: Implement Nhà Mình installability, service-worker behavior, IndexedDB persistence, offline drafts, reconnect synchronization, and safe conflict handling.
---

# PWA / Offline Skill

## Goals

- installable;
- fast launch;
- cached shell;
- recent content readable offline;
- note/doodle creation offline;
- queued sync;
- safe logout cleanup.

## Never

- silently discard offline work;
- silently overwrite partner content;
- cache all sensitive history forever;
- allow one account to see another account's cached data after logout/login switch.

## Sync

Classify operations:

### Safe append
Can retry idempotently with client operation ID.

### Update
Use version/check to detect conflict.

### Destructive
Require online confirmation unless explicitly designed otherwise.

## Conflict UX

When merge is unsafe:
- preserve both versions;
- explain conflict simply;
- let user resolve.

## Service worker updates

Do not trap users on stale incompatible client/schema states.
Provide controlled refresh/update flow.
