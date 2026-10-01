# notifications

Own explicit Knock notification eligibility, per-user quiet hours and privacy preferences. Generic text is the default; including note/sticker content requires explicit detail opt-in. Quiet hours compare the user's local clock with a validated IANA timezone, including crossing-midnight and DST intervals.

Phase 2 supports foreground notices while Home is open, with an optional browser notification after a user gesture grants permission. These helpers only determine eligibility and formatting; they never request permission. Background Web Push, subscriptions, server delivery and push credentials are not implemented, and the UI must say so clearly. Status and Knock content are not put into the service-worker shell cache.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
