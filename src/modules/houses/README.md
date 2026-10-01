# houses

Own House membership and pairing. V1 permits exactly two paired active members. Database RPCs derive the caller, serialize pairing, and enforce two active slots plus one active House per account. Invitations use 256-bit random raw tokens, SHA-256 hashes, 24-hour expiry, and single use. Direct membership/House/invite writes are denied.

`getMyHouse` uses verified identity, RLS-backed membership/House queries, and a separate profile read. A database failure is distinct from having no House. A valid invite target survives OAuth. The private dashboard refreshes waiting membership into the paired Home. Hosted pairing is not yet verified; the original migration's forward references block a fresh migration run. See `docs/PHASE2.md` and ADR 001.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
