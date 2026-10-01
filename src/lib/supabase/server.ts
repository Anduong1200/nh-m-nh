import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabasePublicConfiguration } from "@/lib/env";

type CookieAccess = "read-only" | "read-write";

/**
 * A fresh client per request, using the requesting user's cookies and RLS.
 * Server Components use read-only cookies; the Proxy persists refreshes.
 * Only Server Actions/Route Handlers may request read-write access.
 */
export async function createSupabaseServerClient(
  cookieAccess: CookieAccess = "read-only",
) {
  const { url, publishableKey } = requireSupabasePublicConfiguration();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (cookieAccess === "read-only") return;
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
