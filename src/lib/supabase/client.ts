"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicConfiguration } from "@/lib/env";

/** Cookie-based browser client; the publishable key does not bypass RLS. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = requireSupabasePublicConfiguration();
  return createBrowserClient(url, publishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
