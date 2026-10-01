import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabasePublicConfiguration } from "@/lib/env";
import { safeAuthRedirect } from "@/modules/auth/redirect";

type RefreshedCookie = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes auth cookies and preserves the internal destination at sign-in.
 * Protected operations still independently verify the user and database RLS.
 */
export async function updateSupabaseSession(request: NextRequest) {
  const configuration = getSupabasePublicConfiguration();
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (configuration) {
    const refreshedCookies = new Map<string, RefreshedCookie>();
    const supabase = createServerClient(
      configuration.url,
      configuration.publishableKey,
      {
        cookieOptions: {
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const cookie of cookiesToSet) {
              request.cookies.set(cookie.name, cookie.value);
              refreshedCookies.set(cookie.name, cookie);
            }
            // Forward the changed request cookies to Server Components too.
            response = NextResponse.next({ request });
            for (const { name, value, options } of refreshedCookies.values()) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    // Do not replace this with getSession(): its user is unverified cookie data.
    const { data, error } = await supabase.auth.getUser();
    signedIn = !error && Boolean(data.user);
  }

  // State is an API-like endpoint with its own 401/503 contract; never return
  // sign-in HTML in place of its JSON. Page redirects retain valid invites.
  if (!signedIn && request.nextUrl.pathname.startsWith("/house") && request.nextUrl.pathname !== "/house/state") {
    const destination = safeAuthRedirect(`${request.nextUrl.pathname}${request.nextUrl.search}`);
    const signIn = new URL("/auth/sign-in", request.url);
    signIn.searchParams.set("next", destination);
    const redirected = NextResponse.redirect(signIn);
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    response = redirected;
  }

  // Never let a CDN/browser reuse a response carrying account session cookies.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
