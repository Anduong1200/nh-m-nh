/** Restrict OAuth navigation to known internal House routes. */
export function safeAuthRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/house";
  try {
    const url = new URL(value, "https://nha-minh.invalid");
    if (url.origin !== "https://nha-minh.invalid") return "/house";
    if (!["/house", "/house/setup", "/house/join"].includes(url.pathname)) return "/house";
    const token = url.searchParams.get("token");
    return url.pathname === "/house/join" && token && /^[a-f0-9]{64}$/.test(token)
      ? `/house/join?token=${token}`
      : url.pathname;
  } catch {
    return "/house";
  }
}
