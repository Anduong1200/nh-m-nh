# Offline / sync boundary

This bootstrap provides local persistence primitives, not a working product sync flow.

`src/lib/offline` stores notes/doodles as account-scoped drafts, immutable-ID queued
operations, and a small recent-content cache. A caller opens `AccountOfflineStore`
with the current **verified authenticated user ID**, never a route parameter or
client-selected House ID. Compound keys and account indexes keep accounts separate
on a shared device. This is local isolation, not encryption or database authorization.

Draft saves require an expected local version. A stale save returns both current
and proposed work without overwriting. Queued creates use a fresh client UUID and
`add`, so an ID collision cannot replace a prior operation. Each `enqueue` call
creates a new operation; it is not a deduplication API. Retry an existing queued
operation with its original ID instead of calling `enqueue` again. A future server
must enforce idempotency for that account/operation ID. Updates carry the last authoritative server version.
An unsafe server conflict must call `preserveConflict` to retain the local payload,
remote payload and remote version. It cannot be acknowledged away. A future explicit
resolution flow must preserve/export work before producing its replacement action.

Recent note/doodle content is limited to 50 items and seven days per account and
pruned on reads/writes. Drafts and queued work never expire automatically. Only
cache data that the current authenticated account was authorized to fetch. Do not
cache letters, credentials, tokens, private media URLs or complete history here.

The future sync coordinator must authenticate every request, enforce House
membership through RLS/server checks, check entity versions/turn state, and return
authoritative results. Only after an exact operation-ID acknowledgement may it call
`acknowledgeOperation`. Reconnect alone does not imply successful delivery. Quota,
private-browsing, blocked-upgrade and network errors must be visible to the eventual
editor; never mark failed persistence as saved or synced. No background sync or
fake server acknowledgement exists in the bootstrap.

On logout or account switch, disclose any pending work and offer export/cancel
before intentional cleanup. Call and await `clearAccountOfflineData(userId)` before
opening another account. This revokes existing handles and clears that account's
drafts, queue and recent cache atomically; other accounts are untouched. Handle
revocation is scoped to the current JavaScript context; a future auth coordinator
must broadcast logout/account switching to every open tab, close their handles,
and stop their in-flight queue work before allowing account changes. This bootstrap
has no authenticated multi-tab lifecycle yet. If clearing
fails, show an error and do not report that device data was cleared. The auth module
must wire this lifecycle when real sign-in/logout is implemented. Browser storage
remains readable to the device/browser profile and origin scripts; V1 does not yet
provide client-side encryption. A later encryption design requires an ADR.

## Public PWA shell

`public/sw.js` precaches only a public offline document and listed install icons.
It may cache at most 80 same-origin `/_next/static/` assets whose responses advertise
`immutable` and are not private/no-store/HTML/RSC/JSON. Public asset fetches omit
cookies. It never caches app navigations, API responses, authenticated HTML,
Supabase responses or private media. Offline navigation gets a generic public page;
the eventual authenticated UI must read authorized account-scoped recent content
explicitly. This prevents another signed-in account seeing a cached page belonging
to a previous user.

Service-worker registration runs in production only. New workers wait; the visible
update action asks the person to save work before accepting a reload. Other tabs do
not reload automatically. Bump both public cache version suffixes when changing
shell caching behavior; activation removes only this application's old public
caches. Production requires HTTPS (localhost is supported for development/tests).
Install icons and palette are provisional design tokens pending prototype review.
Real iOS installed-PWA and Android install testing remains a device validation task.
