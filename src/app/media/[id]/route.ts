import { getMediaReference } from "@/modules/media/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePhoto } from "@/modules/media/photo";
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
    if (!media || media.kind !== "photo") return new Response(null, { status: 404, headers });
    const client = await createSupabaseServerClient();
    const { data, error } = await client.storage.from(media.bucket).download(media.path);
    if (error || !data) return new Response(null, { status: 404, headers });
    const bytes = await normalizePhoto(new Uint8Array(await data.arrayBuffer()));
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline; filename=photo.jpg" } });
  } catch { return new Response(null, { status: 404, headers }); }
}
