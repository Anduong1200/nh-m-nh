export type PublicEnvironmentSource = Readonly<{
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
}>;

export type SupabasePublicConfiguration = Readonly<{
  url: string;
  publishableKey: string;
}>;

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

/** Read only these public fields; never serialize or spread process.env. */
function readPublicEnvironment(): PublicEnvironmentSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * An unconfigured bootstrap may show the public shell. Partial or malformed
 * configuration always fails, including when called from next.config.ts.
 * Validation errors never include the supplied values.
 */
export function validateEnvironment(
  source: PublicEnvironmentSource = readPublicEnvironment(),
): SupabasePublicConfiguration | null {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url && !publishableKey) return null;

  if (!url || !publishableKey) {
    throw new EnvironmentConfigurationError(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY together, or leave both empty for the public bootstrap shell.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new EnvironmentConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute Supabase project URL.",
    );
  }

  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsedUrl.hostname,
  );
  const isAllowedProtocol =
    parsedUrl.protocol === "https:" ||
    (parsedUrl.protocol === "http:" && isLoopback);

  if (
    !isAllowedProtocol ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new EnvironmentConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, path, query, or fragment. HTTP is allowed only for a local loopback Supabase instance.",
    );
  }

  // Accept only the modern, browser-safe key format. In particular this rejects
  // sb_secret_ keys and all legacy JWTs, including service-role JWTs.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new EnvironmentConfigurationError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a modern sb_publishable_ key. Secret and legacy service-role keys are forbidden.",
    );
  }

  return Object.freeze({ url: parsedUrl.origin, publishableKey });
}

export function getSupabasePublicConfiguration(): SupabasePublicConfiguration | null {
  return validateEnvironment();
}

/** A real auth/data operation must fail closed when configuration is absent. */
export function requireSupabasePublicConfiguration(): SupabasePublicConfiguration {
  const configuration = getSupabasePublicConfiguration();
  if (!configuration) {
    throw new EnvironmentConfigurationError(
      "Supabase is not configured. Set both public Supabase environment variables before using authentication or private data.",
    );
  }
  return configuration;
}
