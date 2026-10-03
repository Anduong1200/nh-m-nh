import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicConfiguration } from "@/lib/env";

/** Privileged access is restricted to validated photo bytes, never browser imports. */
export function createMediaAdminClient() {
  const { url } = requireSupabasePublicConfiguration();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) throw new Error("Private media server configuration unavailable");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
