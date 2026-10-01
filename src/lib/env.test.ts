import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EnvironmentConfigurationError,
  getSupabasePublicConfiguration,
  requireSupabasePublicConfiguration,
  validateEnvironment,
} from "./env";

const publishableKey = "sb_publishable_test_key_not_a_real_credential";
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
};

afterEach(() => vi.unstubAllEnvs());

describe("environment validation", () => {
  it("allows the public bootstrap shell without connecting to Supabase", () => {
    expect(validateEnvironment({})).toBeNull();
    expect(
      validateEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: " ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toBeNull();
  });

  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey },
  ])("rejects partial configuration", (source) => {
    expect(() => validateEnvironment(source)).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it("returns only the public allowlist with a normalized origin", () => {
    const source = {
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co/ ",
      SUPABASE_SERVICE_ROLE_KEY: "private-value-must-not-escape",
    };
    const configuration = validateEnvironment(source);
    expect(configuration).toEqual({
      url: "https://example.supabase.co",
      publishableKey,
    });
    expect(JSON.stringify(configuration)).not.toContain(source.SUPABASE_SERVICE_ROLE_KEY);
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
  ])("accepts local development Supabase at %s", (url) => {
    expect(
      validateEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url })?.url,
    ).toBe(url);
  });

  it.each([
    "not-a-url",
    "http://example.supabase.co",
    "http://localhost.example.com",
    "https://user:password@example.supabase.co",
    "https://example.supabase.co/rest/v1",
    "https://example.supabase.co?secret=value",
    "https://example.supabase.co#fragment",
    "file:///private/data",
    "javascript:alert(1)",
  ])("rejects unsafe or malformed endpoints without echoing values", (url) => {
    try {
      validateEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as Error).message).not.toContain(url);
      expect((error as Error).message).not.toContain(publishableKey);
    }
  });

  it.each([
    "sb_secret_private_value",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature",
    "sb_publishable_",
    "sb_publishable_bad key",
  ])("rejects keys outside the publishable format", (key) => {
    try {
      validateEnvironment({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      // The documented format prefix is public; supplied key material is not.
      if (key !== "sb_publishable_") {
        expect((error as Error).message).not.toContain(key);
      }
    }
  });

  it("fails closed for actual Supabase operations when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabasePublicConfiguration()).toBeNull();
    expect(() => requireSupabasePublicConfiguration()).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it("reads the explicitly named public variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", valid.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-value");
    expect(requireSupabasePublicConfiguration()).toEqual({
      url: valid.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey,
    });
  });
});
