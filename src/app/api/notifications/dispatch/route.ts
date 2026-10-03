import { timingSafeEqual } from "node:crypto";
import { dispatchBackgroundNotifications } from "@/modules/notifications/push-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const candidate = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!authorized(request)) return new Response(null, { status: 401, headers });
  try {
    const result = await dispatchBackgroundNotifications();
    return Response.json(result, { status: result.configured ? 200 : 503, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
