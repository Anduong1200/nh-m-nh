# media

Own bounded actual-byte photo/audio validation and private Storage. Uploads use
verified account/paired-House checks before a server-only secret and service-only
registration. Reads use the requester's RLS client through a no-store same-origin
endpoint; no signed or public URLs are emitted.

Photos normalize static JPEG/PNG/WebP to JPEG and strip EXIF/GPS. Voice supports
fully validated PCM WAV, 8/16-bit, mono/stereo, 8–48 kHz, <=60 seconds and <=4 MiB.
The browser recorder creates 16kHz mono PCM from an explicit microphone gesture.
No offline binary upload queue or automatic orphan deletion is introduced.
Client metadata writes and ready-state changes stay denied. See
[the private-media contract](../../../docs/PRIVATE_MEDIA.md) for schema installation,
format limits, recording lifecycle and hosted/device acceptance gates.

Canonical requirements: `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` and `AGENTS.md`.
