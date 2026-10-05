import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appUrl, getAppBaseUrl } from "../env.server";

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

describe("appUrl", () => {
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

  /**
   * The property under test is independence from the request. Behind Railway the
   * server seeds its own origin from HOSTNAME/PORT, so every request.url reads
   * http://0.0.0.0:8080/... A helper that took a request as its base would pass
   * every "does it produce a valid URL" test while still sending the browser to
   * an unroutable address, so the poisoning below is the point: with no request
   * involved, the origin can only have come from the environment.
   */
  it("builds absolute URLs from the configured origin, not from a request", () => {
    setEnv("production", "https://app.example.com");

    expect(appUrl("/login").toString()).toBe("https://app.example.com/login");
    expect(appUrl("/dashboard").toString()).toBe(
      "https://app.example.com/dashboard",
    );
  });

  it("never yields a container bind address, the shape the bug took", () => {
    setEnv("production", "https://app.example.com");

    for (const path of ["/login", "/dashboard", "/minutes/abc"]) {
      const location = appUrl(path).toString();
      expect(location).not.toContain("0.0.0.0");
      expect(location).not.toContain(":8080");
      expect(location.startsWith("https://app.example.com/")).toBe(true);
    }
  });

  it("keeps the path and query the caller asked for", () => {
    setEnv("production", "https://app.example.com");

    expect(appUrl("/minutes/42?tab=notes").toString()).toBe(
      "https://app.example.com/minutes/42?tab=notes",
    );
  });

  it("returns a URL so callers can attach search params afterwards", () => {
    setEnv("production", "https://app.example.com");

    // How the OAuth callbacks build /login?error=... . Asserted here because a
    // string return type would force that call site to re-parse, and re-parsing
    // is where an origin quietly goes back to being request-derived.
    const loginUrl = appUrl("/login");
    loginUrl.searchParams.set("error", "invalid_state");

    expect(loginUrl.toString()).toBe(
      "https://app.example.com/login?error=invalid_state",
    );
  });

  it("resolves an origin with a port without dropping it", () => {
    setEnv("development", "https://app.example.com:8443");
    expect(appUrl("/dashboard").toString()).toBe(
      "https://app.example.com:8443/dashboard",
    );
  });

  it("throws in production when the origin is missing, rather than guessing", () => {
    setEnv("production");
    expect(() => appUrl("/login")).toThrow(/APP_BASE_URL is missing/);
  });
});
