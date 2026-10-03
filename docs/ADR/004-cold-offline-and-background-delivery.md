# ADR 004: Cold offline workspace and background delivery

Status: accepted for V1 implementation; hosted/device acceptance remains a release gate.

The public service worker precaches `/offline`, production JS/CSS/fonts, icons
and the generic fallback. It never caches authenticated HTML, RSC, API, Supabase
responses or private media. A generated manifest binds code to the production
build. Updates still require confirmation. The protected public cache is separate
from the bounded warm asset cache.

Private recent DTOs and note/doodle drafts stay in account/House IndexedDB.
Version 4 adds one recovery marker and preserves existing work. The marker
contains no credentials and is not an authentication grant. It offers the most
recently verified namespace for seven days with an explicit local-open gesture.
Expiry hides recovery without deleting drafts. V1 local data remains unencrypted
on trusted devices, consistent with the existing local draft architecture.

Reconnect verifies `/house/state` before enabling mutation transport. Actor/House
changes, denied authentication and logout epochs close the view. Network failure
allows only local edits; immutable operation IDs preserve retries/conflicts.
Sealed letters never reveal using the device clock. Private media is not cached.
Logout confirms pending-draft deletion and clears the push binding/unsubscribes
before erasing local account data or signing out.

Background delivery uses free MPL-2.0 `web-push`, a permission gesture and VAPID.
Server credentials never enter client bundles. Browser-vendor endpoint allowlists
prevent SSRF. Owner-only subscriptions and service-only outbox RPCs protect keys.
DB timestamps gate scheduled letters; source versions gate game turns. Leases,
uniqueness and bounded retries prevent concurrent claims. Delivery is best effort;
providers may drop/duplicate notices. Async use continues without push.

Push is always generic; detailed foreground Knock preview stays opt-in. The
worker ignores supplied title/body/URL and checks its opaque current device
binding, discarding delayed pushes after logout. Quiet hours suppress delivery.
A secret-protected dispatch route requires a deployment scheduler. Implementing
this route does not configure hosting or prove delivery on physical devices.
