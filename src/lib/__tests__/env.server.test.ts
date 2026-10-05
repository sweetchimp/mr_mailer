import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAppBaseUrl } from "../env.server";

/**
 * Every assertion here is about one guarantee: a value that reaches a provider
 * as `redirect_uri` must be the exact string that was registered, or the
 * handshake fails with an error that says nothing about configuration.
 *
 * NODE_ENV and APP_BASE_URL are both process-wide and the function reads them
 * per call, so each test sets what it needs and the suite restores both
 * afterwards. Without that, one test's `NODE_ENV = "production"` silently
 * decides whether a later "throws" case passes.
 */
const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_BASE_URL = process.env.APP_BASE_URL;

/**
 * Next augments ProcessEnv with a readonly NODE_ENV, so assigning through
 * `process.env` directly is a type error even though it is legal at runtime.
 * Widening to a mutable record states the intent instead of hiding it behind a
 * cast at every assignment.
 */
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

function setEnv(env: "production" | "development", value?: string): void {
  mutableEnv.NODE_ENV = env;
  if (value === undefined) {
    delete mutableEnv.APP_BASE_URL;
  } else {
    mutableEnv.APP_BASE_URL = value;
  }
}

describe("getAppBaseUrl", () => {
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

  describe("when set", () => {
    it("returns an https origin unchanged", () => {
      setEnv("production", "https://app.example.com");
      expect(getAppBaseUrl()).toBe("https://app.example.com");
    });

    it("trims surrounding whitespace", () => {
      setEnv("production", "  https://app.example.com  ");
      expect(getAppBaseUrl()).toBe("https://app.example.com");
    });

    it("preserves a non-default port", () => {
      setEnv("development", "https://app.example.com:8443");
      expect(getAppBaseUrl()).toBe("https://app.example.com:8443");
    });

    it("discards a stray path so it cannot leak into the callback", () => {
      setEnv("production", "https://app.example.com/some/path");
      expect(getAppBaseUrl()).toBe("https://app.example.com");
    });

    it("allows http for localhost", () => {
      setEnv("development", "http://localhost:3000");
      expect(getAppBaseUrl()).toBe("http://localhost:3000");
    });

    it("allows http for the IPv4 loopback", () => {
      setEnv("development", "http://127.0.0.1:3000");
      expect(getAppBaseUrl()).toBe("http://127.0.0.1:3000");
    });

    it("rejects a trailing slash and names the variable", () => {
      setEnv("production", "https://app.example.com/");
      expect(() => getAppBaseUrl()).toThrow(/APP_BASE_URL/);
      expect(() => getAppBaseUrl()).toThrow(/trailing slash/);
    });

    it("rejects a trailing slash in development too", () => {
      setEnv("development", "http://localhost:3000/");
      expect(() => getAppBaseUrl()).toThrow(/APP_BASE_URL/);
    });

    it("rejects a relative value", () => {
      setEnv("production", "app.example.com");
      expect(() => getAppBaseUrl()).toThrow(/absolute URL/);
    });

    it("rejects a scheme-relative value", () => {
      setEnv("production", "//app.example.com");
      expect(() => getAppBaseUrl()).toThrow(/APP_BASE_URL/);
    });

    it("rejects http for a non-localhost host and explains why", () => {
      setEnv("production", "http://app.example.com");
      expect(() => getAppBaseUrl()).toThrow(/must use https:\/\//);
    });

    it("rejects a hostname that merely contains 'localhost'", () => {
      setEnv("production", "http://localhost.attacker.example");
      expect(() => getAppBaseUrl()).toThrow(/must use https:\/\//);
    });

    it("rejects a non-http protocol", () => {
      setEnv("production", "ftp://app.example.com");
      expect(() => getAppBaseUrl()).toThrow(/must use https:\/\//);
    });

    it("treats an empty value as missing rather than as a URL", () => {
      setEnv("production", "   ");
      expect(() => getAppBaseUrl()).toThrow(/APP_BASE_URL is missing/);
    });
  });

  describe("when missing", () => {
    it("throws in production and names the variable", () => {
      setEnv("production");
      expect(() => getAppBaseUrl()).toThrow(/APP_BASE_URL is missing/);
    });

    it("names both callback paths so the error is actionable", () => {
      setEnv("production");
      expect(() => getAppBaseUrl()).toThrow(/auth\/google\/callback/);
      expect(() => getAppBaseUrl()).toThrow(/auth\/microsoft\/callback/);
    });

    it("falls back to the dev server in development", () => {
      setEnv("development");
      expect(getAppBaseUrl()).toBe("http://localhost:3000");
    });
  });
});
