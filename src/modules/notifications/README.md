# notifications

Own explicit Knock notification eligibility, per-user quiet hours and privacy preferences. Generic text is the default; including note/sticker content requires explicit detail opt-in. Quiet hours compare the user's local clock with a validated IANA timezone, including crossing-midnight and DST intervals.

Foreground notices work while Home is open, with browser permission after a gesture. Background Web Push now has explicit enrollment, owner-only subscriptions and service-only outbox dispatch. It requires server VAPID/configuration and a deployment scheduler; absent configuration is stated in Home settings. Background delivery is always generic and uses DB time/source versions, quiet hours and an opaque device binding invalidated on logout. No private content enters the public shell cache. See `docs/BACKGROUND_NOTIFICATIONS.md` and ADR 004 for setup and release gates.

`foreground.ts` separates the session delivery policy from its injected `NotificationTransport`. The browser adapter lazily accesses browser APIs for SSR safety and only requests permission after the settings gesture. The policy primes the existing inbox, deduplicates new recipient events, consumes suppressed notices without replay and closes private notices on account change/unmount. Constructor failure does not break the in-app inbox. Tests inject a transport without browser globals; see `docs/WORKSTREAM_B.md`.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
