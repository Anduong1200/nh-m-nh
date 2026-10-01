import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getVerifiedUser } from "@/modules/auth/server";
import { getSupabasePublicConfiguration } from "@/lib/env";

/**
 * Protected layout: redirects unauthenticated visitors to sign-in.
 * House membership is enforced by RLS in data queries, not by this layout.
 */
export default async function HouseLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (!getSupabasePublicConfiguration()) redirect("/auth/sign-in");
  const user = await getVerifiedUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return <>{children}</>;
}
