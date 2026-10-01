# media

Own bounded photo/audio/link validation and private storage. No buckets exist yet. Future migrations must create private buckets with House-scoped access policies and cross-House authorization tests; never trust upload filenames/MIME metadata.

Board domain provides RLS-protected `media_objects` metadata and authenticated ready-reference reads. Client metadata writes, external URL registration and ready-state changes are denied. Actual upload, byte inspection, Storage policies and signing remain unimplemented; photo/voice UI must wait for that pipeline. See [the media boundary](../../../docs/BOARD_DOMAIN.md#media-boundary).

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
