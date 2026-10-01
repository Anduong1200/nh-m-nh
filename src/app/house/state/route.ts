import { NextResponse } from "next/server";
import { AuthenticationRequiredError, requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { loadHomeState } from "@/modules/houses/state";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

/** Cookie-authenticated foreground refresh. No client House/actor selector. */
export async function GET() {
  try {
    const user = await requireVerifiedUser();
    const house = await getMyHouse();
    if (!house) return NextResponse.json({ error: "Bạn chưa có Nhà." }, { status: 403, headers });
    const state = await loadHomeState(house.id);
    return NextResponse.json({ currentUserId: user.id, house, state }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Đăng nhập lại để vào Nhà nhé." }, { status: 401, headers });
    return NextResponse.json({ error: "Chưa tải được dấu vết trong Nhà. Thử lại sau nhé." }, { status: 503, headers });
  }
}
