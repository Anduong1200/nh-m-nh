# Security Requirements

## Security posture

All relationship content is sensitive by default.

V1 target:
- standard strong web security;
- architecture capable of later stronger client-side/E2EE protection.

## Threats

Minimum threat model:

- stolen authenticated session;
- leaked pairing invite;
- IDOR / broken object authorization;
- broken Supabase RLS;
- storage bucket exposure;
- malicious media upload;
- XSS;
- CSRF-sensitive server actions where applicable;
- notification content leakage;
- offline cache exposure;
- service-role leakage;
- race conditions in pair/game turn state;
- third user attempting House join;
- accidental cross-House realtime subscription;
- destructive deletion errors.

## Authorization

Every couple-owned row must be authorized using House membership.

Never accept:
- client `house_id` as sufficient authorization.

Prefer:
- RLS;
- FK integrity;
- transaction-level constraints;
- explicit role/member checks.

## Pairing

One-time invite:
- high entropy;
- expiry;
- single use;
- invalid after House reaches 2 active members.

Do not expose predictable invite IDs.

## Storage

- private buckets;
- authenticated or signed access;
- path authorization by House/member;
- validate media type/size;
- strip or avoid trusting metadata where practical.

The private photo pipeline validates actual pixels, rejects animated/corrupt or
oversize input, removes EXIF/GPS and serves normalized JPEG. Upload privilege is
confined to a server-only secret after verified account/paired-House checks;
registration rechecks membership under DB locks. Client metadata and Storage
writes remain denied. Restrictive authenticated and anonymous policies prevent
unrelated permissive policies from exposing this bucket. Image reads use the
user's RLS client, generic fail-closed responses and no-store headers; service
workers never cache private image responses. See [ADR 003](ADR/003-private-photo-pipeline.md).

## Secrets

Never expose:
- Supabase service role;
- private API keys;
- signing secrets.

Validate environment variables at startup/build where possible.

## Push notifications

Default:
- generic content.

Example:
- “Có thứ mới trong Nhà.”

Do not include sensitive note/letter/status text by default.

## Offline

IndexedDB may contain sensitive cached content.

Mitigations:
- cache only necessary data;
- avoid indefinite sensitive caching;
- clear account-specific data on logout;
- namespace per authenticated user;
- do not mix users on shared device;
- document that full client-side encryption is not yet V1.

## XSS

Treat:
- note text;
- links;
- user labels;
- imported data;
- SVG/uploads

as untrusted.

Do not render arbitrary HTML from users.

## Deletion

Irreversible delete actions:
- explicit confirmation;
- authorization;
- audit-friendly server semantics;
- clear distinction between trash and permanent deletion.

## Tests required

Letters prevent recipient access to scheduled envelopes/clues and sealed bodies at DB/RPC level. Separate ordinary opening truth avoids default sender read receipts. Joint reveal is explicitly opt-in and requires both original participants with fresh presence/consent in one session. Heartbeat tables are inaccessible to application roles; no global online history is exposed. Exact retry operations are actor-private; offline caches contain only previously authorized DTOs and use logout epoch invalidation. See [Letters security](LETTERS_DOMAIN.md#persistence-and-privacy).

Island uses a read-only invoker projection over House/event RLS. Application roles cannot write the ledger/view or execute internal completion emitters. Game completion events are generated atomically from same-House persisted artifacts; no sensitive artifact body is copied. Memory/Milestone contracts have no client-callable emitter. See [Island authorization and verification](ISLAND_DOMAIN.md).

Games use House-authorized transactional commands, immutable player seats/event sequences and actor-private replay receipts. Draw & Guess answers are inaccessible to the guesser through tables, RPC projections and cached receipts until completion. Photo Mission accepts only owned ready House photos and uses immediate shared reveal without changing Storage permissions. Offline drafts/queues retain account/House bindings and logout generation barriers. See [Games domain](GAMES_DOMAIN.md) for authorization and test boundaries.

Automated tests should include:
- user A cannot read user B’s different House;
- outsider cannot mutate House;
- third member cannot pair;
- expired invite fails;
- reused invite fails;
- private media access fails cross-House;
- game turn cannot be played by wrong user;
- scheduled letter cannot be read before allowed state;
- logout clears sensitive offline cache where implemented.

Memory/Milestone journal entries enforce shared edits and creator-only
trash/restore in locked versioned RPCs. Confirmation and immutable completed
same-House artifact sources gate Memory promotion. Progress comes from the DB
ledger and never a client level counter. Private photo/PCM voice bytes are
validated server-side; requester RLS controls no-store reads and ranges.

Cold offline recovery uses the last verified account/House namespace and a
seven-day marker, never an auth token. Expiry does not delete drafts. Fresh
identity validation gates reconnect; logout generations block late callbacks.
Push endpoint allowlists prevent arbitrary outbound URLs. Device credentials
have owner-only RLS; outbox RPCs are service-only. Generic payload and an opaque
worker binding prevent private text and delayed logged-out notifications.
See ADR 004 and the hosted/device release checks for the limits of these tests.
