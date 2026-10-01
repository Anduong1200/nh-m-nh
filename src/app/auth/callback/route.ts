import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeAuthRedirect } from "@/modules/auth/redirect";

/**
 * OAuth callback handler.
 * Supabase redirects here after Google sign-in with an auth code.
 * We exchange the code for a session, bootstrap the profile, then redirect.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeAuthRedirect(searchParams.get("next"));
  function failed(reason: "missing_code" | "auth_failed") {
    const target = new URL("/auth/sign-in", origin);
    target.searchParams.set("error", reason);
    target.searchParams.set("next", next);
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  if (!code) {
    return failed("missing_code");
  }

  const supabase = await createSupabaseServerClient("read-write");
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return failed("auth_failed");
  }

  // Ensure profile exists after first sign-in.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Bootstrap profile — upsert so we never fail on repeat visits.
    await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name:
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            user.email?.split("@")[0] ??
            "",
          avatar_url: user.user_metadata?.avatar_url ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
  }

  const response = NextResponse.redirect(new URL(next, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
