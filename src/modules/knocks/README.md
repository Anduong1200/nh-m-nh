# knocks

Phase 2 supports a tiny one-line note (160 characters) or one of four small stickers. Every send carries a client-generated UUID preserved across retry; database idempotency prevents duplicate Knock creation. The database derives the sender, current House and partner from verified identity, never from client ownership fields.

The action validates the returned DTO and requires the verified sender, operation ID, kind and normalized content to match the exact attempted send before acknowledging success. A malformed or mismatched response retains the unconfirmed attempt for retry. See `docs/WORKSTREAM_B.md` for the API contract and tests.

Only the recipient inbox is loaded by Home. Recipient-private dismissal tidies that inbox across devices without exposing an acknowledgement or read receipt to the sender. Knock remains an asynchronous small interaction, without conversation threads, reply pressure or chat history.

Own lightweight explicit partner interactions, not a chat thread. Future attachments remain private and bounded; notification previews are generic by default.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
