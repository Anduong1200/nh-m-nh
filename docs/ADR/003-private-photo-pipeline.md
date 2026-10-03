# ADR 003: validated private photos for Photo Mission

Status: accepted for the existing V1 photo requirement; additive schema only.

The Board domain deliberately denies application metadata writes. Photo Mission
cannot become usable by allowing clients to claim a URL or mark bytes as ready.
Keep that boundary: a server-only Supabase secret performs uploads and calls one
service-role-only registration RPC. It is never imported by client code.

The action verifies the requesting cookie identity and current two-member House
before any privileged access. It ignores input filename/MIME, fully decodes JPEG,
PNG or WebP with sharp, rejects animation/corrupt/over-limit input, strips EXIF/GPS,
normalizes orientation and writes a bounded JPEG to a random House/UUID path.
Registration locks the active House and members, rechecks the actor, and requires
the private Storage object size/type to match. Browser metadata writes and Storage
insert/update/delete remain denied. This adds no auth-provider or membership change.

Reads use the user's RLS client, never the admin client. Both active members may
read ready House photos, matching the existing media-reference contract. A
same-origin no-store endpoint decodes bytes again and returns JPEG with nosniff;
there are no public bucket URLs, bearer signed links or image-optimizer caches.

Trade-offs: hosted upload requires `SUPABASE_SECRET_KEY` in server environment;
the server is trusted with plaintext V1 content. This is not E2EE. A failed
registration may leave an invisible, unreferenced private blob. No automatic
deletion or garbage collector is introduced: deleting user data needs a separate
explicitly approved lifecycle. Upload retry can create an extra blob; game turn
commands retain exact operation retries so the shared artifact is not duplicated.
Audio and HEIC are not accepted by this photo-only pipeline. There is no offline
binary upload queue; notes/doodles and game proposals retain existing queues.
Input and output are each bounded to 4 MiB; Server Action bodies allow 4.25 MiB
including multipart overhead, below the target platform's
[4.5 MB function payload limit](https://vercel.com/docs/functions/limitations#request-body-size).

The chosen Storage RLS model follows [Supabase access-control documentation](https://supabase.com/docs/guides/storage/security/access-control).
Pixel decoding, output metadata stripping and pixel limits use
[sharp's output API](https://sharp.pixelplumbing.com/api-output/) and
[constructor options](https://sharp.pixelplumbing.com/api-constructor/).
Tests separate real pixel conversion, authenticated action/route boundaries and
real PostgreSQL RLS/registration from the hosted Storage API acceptance check.
