import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildAuthUrl, googleRedirectUri, microsoftRedirectUri } from "../oauth.server";

/**
 * The point of these is that the redirect_uri reaching a provider is never the
 * string "undefined". Before APP_BASE_URL existed, a missing variable produced
 * `redirect_uri=undefined` on the wire — accepted as a value by Google and
 * rejected as non-absolute by Microsoft (AADSTS90102) — because
 * `URLSearchParams` stringifies `undefined` rather than rejecting it, and the
 * `!` non-null assertion erased to nothing at runtime.
 *
 * `buildAuthUrl` is covered too, not just the helpers: the helpers being
 * correct does not prove the call sites use them, and a missed call site is the
 * exact regression this guards against.
 */
const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_BASE_URL = process.env.APP_BASE_URL;

/** See env.server.test.ts: NODE_ENV is readonly in Next's ProcessEnv typing. */
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

/**
 * A syntactically valid tenant GUID so the single-tenant branch of
 * getMicrosoftTenant() is exercised. Deliberately not a real tenant: the value
 * only has to match the UUID shape, and baking a live tenant into a test would
 * publish it into git history permanently for no benefit.
 */
const FAKE_TENANT_ID = "11111111-2222-3333-4444-555555555555";

function setEnv(env: "production" | "development", baseUrl?: string): void {
  mutableEnv.NODE_ENV = env;
  mutableEnv.GOOGLE_CLIENT_ID = "google-client-id";
  mutableEnv.MICROSOFT_CLIENT_ID = "microsoft-client-id";
  mutableEnv.MICROSOFT_TENANT_ID = FAKE_TENANT_ID;
  if (baseUrl === undefined) {
    delete mutableEnv.APP_BASE_URL;
  } else {
    mutableEnv.APP_BASE_URL = baseUrl;
  }
}

function redirectUriFrom(provider: "GOOGLE" | "MICROSOFT"): string | null {
  const url = new URL(buildAuthUrl(provider, "test-state", "test-verifier"));
  return url.searchParams.get("redirect_uri");
}

describe("OAuth redirect URIs", () => {
  beforeEach(() => {
    delete mutableEnv.APP_BASE_URL;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = ORIGINAL_ENV;
    }
    if (ORIGINAL_BASE_URL === undefined) {
      delete mutableEnv.APP_BASE_URL;
    } else {
      mutableEnv.APP_BASE_URL = ORIGINAL_BASE_URL;
    }
  });

  describe("builders", () => {
    it("derives the Google callback from the base URL", () => {
      setEnv("production", "https://app.example.com");
      expect(googleRedirectUri()).toBe("https://app.example.com/auth/google/callback");
    });

    it("derives the Microsoft callback from the base URL", () => {
      setEnv("production", "https://app.example.com");
      expect(microsoftRedirectUri()).toBe("https://app.example.com/auth/microsoft/callback");
    });

    it("derives localhost callbacks in development without configuration", () => {
      setEnv("development");
      expect(googleRedirectUri()).toBe("http://localhost:3000/auth/google/callback");
      expect(microsoftRedirectUri()).toBe("http://localhost:3000/auth/microsoft/callback");
    });

    it("never emits the literal string 'undefined'", () => {
      setEnv("production", "https://app.example.com");
      expect(googleRedirectUri()).not.toContain("undefined");
      expect(microsoftRedirectUri()).not.toContain("undefined");
    });

    it("produces no double slash at the join", () => {
      setEnv("production", "https://app.example.com");
      expect(googleRedirectUri()).not.toContain(".com//");
    });
  });

  describe("buildAuthUrl", () => {
    it("sends the derived Google callback as redirect_uri", () => {
      setEnv("production", "https://app.example.com");
      expect(redirectUriFrom("GOOGLE")).toBe(
        "https://app.example.com/auth/google/callback",
      );
    });

    it("sends the derived Microsoft callback as redirect_uri", () => {
      setEnv("production", "https://app.example.com");
      expect(redirectUriFrom("MICROSOFT")).toBe(
        "https://app.example.com/auth/microsoft/callback",
      );
    });

    it("sends an absolute redirect_uri for both providers", () => {
      setEnv("production", "https://app.example.com");
      for (const provider of ["GOOGLE", "MICROSOFT"] as const) {
        expect(() => new URL(redirectUriFrom(provider)!)).not.toThrow();
      }
    });

    it("fails loudly at build time when the base URL is missing", () => {
      setEnv("production");
      expect(() => buildAuthUrl("GOOGLE", "test-state", "test-verifier")).toThrow(
        /APP_BASE_URL is missing/,
      );
      expect(() => buildAuthUrl("MICROSOFT", "test-state", "test-verifier")).toThrow(
        /APP_BASE_URL is missing/,
      );
    });

    it("keeps the Microsoft callback on the single-tenant host", () => {
      setEnv("production", "https://app.example.com");
      const url = new URL(buildAuthUrl("MICROSOFT", "test-state", "test-verifier"));
      expect(url.hostname).toBe("login.microsoftonline.com");
      expect(url.pathname).toBe(`/${FAKE_TENANT_ID}/oauth2/v2.0/authorize`);
    });
  });
});
