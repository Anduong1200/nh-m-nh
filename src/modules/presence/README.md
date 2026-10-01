# presence

Explicit mood, energy, availability, one-line note and need, with manual, one-hour, four-hour and local end-of-day expiry. Timestamps persist in UTC; end-of-day uses a validated IANA zone and respects DST.

`setPresenceAction` and `clearPresenceAction` verify identity and call membership-resolving database RPCs. Optimistic versions retain a private own-row tombstone after clear/expiry, so stale edits from another device produce an explicit conflict. Partner expiry is filtered by RLS and again in server state. No online state, activity timestamp, last-seen or inferred availability is exported.

Every Phase 2 mutation also compares the tab's expected viewer with verified identity inside the same action request. A draft from an earlier session cannot be written after another account signs in. The expected viewer is a safety guard, never authorization; database RPCs still derive and authorize the actor. Returned mutation rows must belong to that verified actor.

`loadPhase2State` and `/house/state` load only the verified user's active House, current recipient Knock inbox and own notification preferences. Refresh responses are private and `no-store`; read failures are explicit rather than replaced with fake empty state. State is foreground memory only, outside the shell cache.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
