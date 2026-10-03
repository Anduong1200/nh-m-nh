import { getMediaReference } from "@/modules/media/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePhoto } from "@/modules/media/photo";
import { normalizeVoice } from "@/modules/media/voice";
import { isUuid } from "@/modules/knocks/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const houseId = new URL(request.url).searchParams.get("house");
    if (!isUuid(id) || !isUuid(houseId)) return new Response(null, { status: 404, headers });
    // User-scoped RLS read precedes Storage access; no signed URL or admin read.
    const media = await getMediaReference(id, houseId);
    if (!media || (media.kind !== "photo" && (media.kind !== "audio" || media.mime !== "audio/wav"))) return new Response(null, { status: 404, headers });
    const client = await createSupabaseServerClient();
    const { data, error } = await client.storage.from(media.bucket).download(media.path);
    if (error || !data) return new Response(null, { status: 404, headers });
    const downloaded = new Uint8Array(await data.arrayBuffer());
    if (media.kind === "photo") {
      const bytes = await normalizePhoto(downloaded);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline; filename=photo.jpg" } });
    }
    const normalized = normalizeVoice(downloaded);
    if (normalized.bytes.byteLength !== media.bytes || normalized.durationSeconds !== media.durationSeconds) return new Response(null, { status: 404, headers });
    const bytes = normalized.bytes, length = bytes.byteLength;
    const audioHeaders = { ...headers, "Content-Type": "audio/wav", "Content-Disposition": "inline; filename=voice.wav", "Accept-Ranges": "bytes" };
    // No validator is exposed: If-Range requires a full response. Only one bounded range is accepted.
    const range = request.headers.has("if-range") ? null : request.headers.get("range");
    if (!range) return new Response(new Uint8Array(bytes), { headers: { ...audioHeaders, "Content-Length": String(length) } });
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...audioHeaders, "Content-Range": `bytes */${length}` } });
    const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
    if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return new Response(null, { status: 416, headers: { ...audioHeaders, "Content-Range": `bytes */${length}` } });
    const start = first ?? Math.max(0, length - (last ?? 0));
    const end = first === null ? length - 1 : Math.min(length - 1, last ?? length - 1);
    if (start >= length || start > end || (first === null && last === 0)) return new Response(null, { status: 416, headers: { ...audioHeaders, "Content-Range": `bytes */${length}` } });
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...audioHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${length}` } });
  } catch { return new Response(null, { status: 404, headers }); }
}
