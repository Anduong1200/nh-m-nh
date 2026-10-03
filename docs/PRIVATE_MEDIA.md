# Private photos and voice

Both active House members can read ready House media. Uploads first verify the
cookie account and exact current paired House; the browser's context, filename,
MIME and duration never authorize an upload. Server-only `SUPABASE_SECRET_KEY`
performs the bounded Storage upload and service-only registration RPC. The
registration locks and rechecks House/member state after upload. There is no
browser metadata write, public bucket, signed URL or automatic blob deletion.

Photos retain the actual sharp pixel decoding, static JPEG/PNG/WebP limits and
EXIF/GPS removal in [ADR 003](ADR/003-private-photo-pipeline.md).

Voice accepts RIFF/WAVE PCM 8-bit or 16-bit, mono/stereo, 8–48 kHz, at most
60 seconds and 4 MiB. The server checks complete RIFF/chunk framing, exact PCM
block alignment and byte rate, rejects duplicate format/data chunks and derives
duration from the actual sample count. It rewrites only the essential WAV header
and sample bytes, removing recorder labels and ancillary metadata. This subset
requires no external encoder/binary service. MP3, MP4/M4A, OGG, WebM, compressed
WAV, extensible/floating PCM and video are not accepted. The upload form explains
the WAV requirement and offers browser recording.

`VoiceRecorder` requests the microphone only from an explicit button gesture.
AudioWorklet averages channels and downsamples to 16 kHz signed mono PCM, bounded
to 960,000 samples. A 60-second capture is 1,920,044 bytes. Stop, background,
page exit, permission cancellation and unmount release the microphone tracks;
captured samples produce a local File for explicit submission. Recording requires
HTTPS/localhost and AudioWorklet/getUserMedia support; file selection remains
available. No background capture, speech recognition or automatic upload exists.
The completed binary stays in the open form, not an offline binary upload queue.

Media reads use the requester's RLS client at `/media/[id]?house=<uuid>`, including
Storage access. The endpoint revalidates bytes and returns no-store, nosniff,
generic filenames and a sandbox CSP. PCM audio additionally supports a single
bounded byte range for seeking. Each range request repeats account/House checks.
The service worker never stores media bytes; logout invalidates private views.

For hosted setup, apply `install-media.sql` after the hardened Board domain,
then the additive `install-voice.sql` once. The voice installer requires the
existing private photo boundary, adds WAV to the bucket allowlist and widens
only the restrictive authorized read predicate; all existing authenticated and
anonymous write/delete guards remain intact. Reapplying or finding an incompatible
public bucket fails transactionally. Neither installer is applied remotely by
running tests or generating SQL. Configure the server secret through local ignored
environment/platform secret management, never a client env or commit.

Tests cover real byte parsing/normalization, recorder DSP sample limits,
authenticated action/route checks, range handling and actual PostgreSQL roles/RLS
with broad unrelated Storage policies. The test Storage schema models metadata,
not the hosted Storage API. Release acceptance still requires hosted upload and
playback with both accounts, outsider denial, and microphone recording on actual
iPhone Safari/PWA and Android Chrome/PWA.

The PCM framing follows [Microsoft WAVEFORMATEX](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex)
and [RIFF structure](https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-).
Browser capture uses the documented [AudioWorklet processing API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process)
and [message port](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/port).
Range responses follow [HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
