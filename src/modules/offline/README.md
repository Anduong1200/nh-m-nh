# offline

Domain seam for local drafts and eventual reconciliation. The IndexedDB infrastructure lives in src/lib/offline; server sync belongs to src/modules/sync. Only authenticated, namespaced content may enter private storage. No product offline create flow is exposed yet.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
