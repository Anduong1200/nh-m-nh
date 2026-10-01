# board

Persist mixed shared artifacts with shared edit rights and creator-only trash/restore. Writes use authenticated House binding, optimistic versions and immutable operation receipts. `sync.ts` integrates durable note/doodle queues with explicit conflict resolution. UI must adapt to the required context/operation-ID contract before integration.

Implementation and handoff: [Board domain](../../../docs/BOARD_DOMAIN.md).

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
