# ADR 002: Whiteboard library and async snapshot persistence

Status: accepted for scoped local implementation, 2026-10-02. Hosted deployment and Home composition are separate integration steps.

## Decision

Use **@excalidraw/excalidraw 0.18.1**, pinned. Keep Next.js/React 19, Supabase Auth/RLS and the existing account-scoped IndexedDB store. V1 edits are asynchronous full-scene snapshots with compare-and-set versions and immutable operation receipts. Both active House members may edit. Never auto-merge a whole canvas.

This implements the frozen Whiteboard feature. Images, embeds, library imports, external collaboration rooms and realtime are outside this workstream. Erasing is a versioned edit with native deleted-element tombstones, not a database purge.

## Comparison

The SDK measurements below use esbuild 0.28.2, production ESM, minification and gzip level 9. React/ReactDOM and framework code are external. All reachable dynamic modules are flattened into one bundle: this is a **full SDK closure cost, not initial page download**. Fonts and source maps are excluded. Reproduce with [the measurement script](../../scripts/measure-whiteboard-libraries.mjs) and an isolated package containing the two exact versions.

| Criterion | Excalidraw 0.18.1 | tldraw 5.5.0 | Custom editor |
| --- | --- | --- | --- |
| JS bundle, raw / gzip | 8,238,813 / 2,485,799 bytes | 1,760,227 / 535,879 bytes | No existing implementation to measure; small initial drawing code would omit much editor behavior |
| CSS, raw / gzip | 144,624 / 22,775 bytes | 78,827 / 14,531 bytes | Depends on implementation |
| npm unpacked package | 46,802,783 bytes | 15,232,881 bytes | Not applicable; unpacked size is not transfer size |
| Touch | Established touch/pen editor; verify the actual integration | Established touch/pen editor | Must build gestures, hit targets, selection and undo |
| Serialization | Native JSON elements, IDs, versions, bindings and deletion flags; use restore APIs | Document/session snapshots and schema migrations | Own schema and migrations indefinitely |
| Offline | Embeddable SDK needs our durable account/House drafts and queue | Built-in IndexedDB persistenceKey; still needs our auth/House boundary and server queue | Must implement both editor and offline correctness |
| Persistence | onChange + native scene access; store only validated document content | Reactive store, getSnapshot/loadSnapshot | All persistence behavior belongs to us |
| React | SDK peers include React 19; requires browser-only Next loading | SDK peers include React 19.2.1+ | Full compatibility responsibility |
| Licensing | SDK MIT; self-hosted drawing fonts retain OFL notices | Production license key required; hobby licensing exists for eligible use | Own code, plus licenses for any borrowed components |
| Future realtime | Native element versions/nonces and reconciliation offer an adapter path; auth/transport would still be needed | First-party sync/server SDK is stronger here | Must design and maintain collaboration as well |

Sources checked on 2026-10-02: [Excalidraw package metadata](https://raw.githubusercontent.com/excalidraw/excalidraw/v0.18.1/packages/excalidraw/package.json), [MIT license](https://github.com/excalidraw/excalidraw/blob/v0.18.1/LICENSE), [Next integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration), [native scene APIs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api), [serialization utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils), [tldraw licensing](https://tldraw.dev/community/license), [tldraw persistence](https://tldraw.dev/docs/persistence), [tldraw sync](https://tldraw.dev/docs/sync). Version and peer metadata were also read directly from the npm registry.

Excalidraw is substantially heavier in this measurement. Its permissive SDK license, scrapbook drawing style and native serialization fit this V1 without a paid-service decision or licensing-key dependency. tldraw's stronger realtime path does not offset the licensing review for the current async scope. Custom would make us build an editor engine, contrary to the canonical Whiteboard direction.

Load the editor on demand through a Client Component and ssr:false dynamic import. Keep it outside the initial Home bundle. Set the same-origin asset path **before importing the SDK**; the upstream SDK otherwise uses a font CDN. Bundled UI fonts are emitted by the bundler. Excalifont and Xiaolai drawing/fallback fonts are copied from the pinned local package at dev/build time (12,732,260 bytes / 216 files available on disk, not all loaded at startup). Only requested immutable public font files enter the service-worker cache. Notices are served alongside these resources.

The SDK's pinned transitive Radix Tabs 1.0.2 declares React peers only through 18. A narrow pnpm override pins that dependency to **1.1.21**, whose peers include React 19. Strict peer installation and pnpm peers check must pass; no peer check is disabled. Recheck and remove this override when upgrading the SDK. The stock measurement above predates this compatibility override.

## Persistence and privacy

One Whiteboard per House; server-generated row ID and unique house_id. Reads do not create an empty row. An authorized empty board is virtual version zero; the first acknowledged save is version one.

The server validates a bounded native scene envelope: schemaVersion, library, libraryVersion and elements only. Viewport, selected objects, cursor, user identity, appState, files, URLs, frames, embeds and arbitrary customData are excluded. Allowed primitives retain geometry, native style, text, bindings and tombstones. Supported text fonts are the SDK's system Helvetica and self-hosted Excalifont (families 2/5). The explicit limits are 1 MiB at the database boundary, 1,000 elements, 20,000 drawing points and 10,000 characters per text element. PostgreSQL's JSONB text representation includes spacing, so it can reject a near-limit client snapshot; the queue is retained with a visible error.

Every cloud save verifies the current account and House before calling the RPC. The RPC rechecks auth.uid(), active membership and active House, serializes the House transaction, and records the request/result atomically. Reusing an operation ID with a different actor, House or request is rejected. Exact retries return the original receipt before testing the current version. RLS protects both tables, and clients have no direct INSERT/UPDATE/DELETE grant.

Local keys include account + House + schema. Existing IndexedDB v3 stores and logout epoch barriers are reused without deleting or migrating existing content. Board and Whiteboard workers ignore each other's queue entities. Acknowledgement requires an exact validated receipt. Continuing to draw during a pending save keeps newer edits separate; an old receipt cannot replace them. Conflicts preserve local/remote scenes and the observed version. A replacement is another immutable operation against that observed version. Keeping remote archives both the queued proposal and any newer draft; it never purges server history.

Operation receipts retain sensitive scene history for retry/recovery. There is no purge/retention-reset API in this scope. A future retention/deletion decision requires review; do not silently shorten replay guarantees or delete relationship content.

## Boundary and consequences

The reusable editor adapter exercises tools, serialization and persistence. It is not a new room design. Gemini may compose it into Home using the supplied account/House contract, without introducing another store or direct Supabase writes. Current app-shell navigation still returns a generic offline page; reopening a private editor from a cold offline launch requires the separately specified account/recovery shell. This work does not weaken auth or cache private HTML to implement that shell.

Native simultaneous drawing remains V2. Future realtime must keep House authorization, private media handling and explicit migration of this versioned scene codec. Do not use public SDK demo rooms.

The pinned SDK [restore implementation](https://raw.githubusercontent.com/excalidraw/excalidraw/v0.18.1/packages/excalidraw/data/restore.ts) resets lastCommittedPoint and converts null binding lists to empty arrays. The adapter canonicalizes only that gesture/empty-list metadata when capturing and comparing documents, so reopening an unchanged snapshot stays clean. Geometry, real bindings, text, native versions and deletion flags are retained; receipt checks still compare the exact submitted snapshot.
