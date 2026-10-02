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
