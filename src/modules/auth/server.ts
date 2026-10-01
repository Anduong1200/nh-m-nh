import "server-only";

import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("A verified signed-in user is required.");
    this.name = "AuthenticationRequiredError";
  }
}

/** Network-verified identity only. Auth errors grant no access. */
export async function getVerifiedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

/** Identity is only the first check; House membership must be enforced by RLS. */
export async function requireVerifiedUser(): Promise<User> {
  const user = await getVerifiedUser();
  if (!user) throw new AuthenticationRequiredError();
  return user;
}
