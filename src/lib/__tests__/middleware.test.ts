import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * The middleware redirect guard, tested against the request URL that produced
 * the production bug: a successful login landed on
 * http://0.0.0.0:8080/dashboard and the browser reported ERR_ADDRESS_INVALID.
 *
 * Next's standalone server seeds its own origin from the bind address
 * (start-server.js sets __NEXT_PRIVATE_ORIGIN from HOSTNAME/PORT), so
 * `request.url` inside the container is the container's address, not the
 * public one. Each test below therefore requests an unroutable origin and
 * asserts the Location header is the configured one. A middleware that passed
 * `request.url` to `new URL()` would pass every other assertion in this file
 * and still ship the user to 0.0.0.0.
 */

const APP_BASE_URL = "https://app.example.com";
const CONTAINER_ORIGIN = "http://0.0.0.0:8080";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_BASE_URL = process.env.APP_BASE_URL;

/** Next types NODE_ENV as readonly; see env.server.test.ts for the rationale. */
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

const verifySession = vi.fn<(token: string) => Promise<unknown>>();
const refreshSessionToken = vi.fn<(session: unknown) => Promise<string | null>>();

vi.mock("@/lib/session.server", () => ({
  verifySession: (token: string) => verifySession(token),
  refreshSessionToken: (session: unknown) => refreshSessionToken(session),
  getSessionCookieName: () => "mr_session",
  sessionCookieOptions: () => ({ path: "/", sameSite: "lax" }),
}));

// The cookie name is imported rather than spelled out: it is __session, and a
// test that hardcodes a plausible-looking "mr_session" never matches, so the
// middleware takes the no-cookie branch and the test passes for the wrong
// reason.
function request(path: string, token?: string): NextRequest {
  const headers = token
    ? { cookie: `${SESSION_COOKIE_NAME}=${token}` }
    : undefined;
  return new NextRequest(`${CONTAINER_ORIGIN}${path}`, { headers });
}

/** Reads the Location header Next set on the redirect response. */
function locationOf(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  return new URL(location!);
}

async function runMiddleware(req: NextRequest) {
  // The file under test is src/middleware.ts, at the src root — two levels up
  // from this suite rather than one.
  const { middleware } = await import("@/middleware");
  return middleware(req);
}

describe("middleware", () => {
  beforeEach(() => {
    mutableEnv.APP_BASE_URL = APP_BASE_URL;
    verifySession.mockReset();
    refreshSessionToken.mockReset();
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

  describe("redirecting an unauthenticated visitor to /login", () => {
    it("uses APP_BASE_URL even though the request arrived on the container origin", async () => {
      const response = await runMiddleware(request("/dashboard"));

      const location = locationOf(response);
      expect(location.origin).toBe(APP_BASE_URL);
      expect(location.pathname).toBe("/login");
      expect(response.status).toBe(307);
    });

    it("does not leak the container's bind address into Location", async () => {
      const response = await runMiddleware(request("/dashboard"));

      expect(response.headers.get("location")).not.toContain("0.0.0.0");
      expect(response.headers.get("location")).not.toContain(":8080");
    });

    it("redirects when the cookie is absent", async () => {
      const response = await runMiddleware(request("/insights"));

      expect(locationOf(response).pathname).toBe("/login");
      expect(verifySession).not.toHaveBeenCalled();
    });

    it("redirects when the cookie is not shaped like a JWT", async () => {
      // Middleware's only real check is the "eyJ" prefix; requireUser() does the
      // signature verification later. A garbage cookie must still be sent to
      // /login on the public origin rather than being trusted.
      const response = await runMiddleware(request("/dashboard", "garbage"));

      expect(locationOf(response).pathname).toBe("/login");
      expect(verifySession).not.toHaveBeenCalled();
    });

    it("redirects on the configured origin when the session fails verification", async () => {
      verifySession.mockResolvedValue(null);

      const response = await runMiddleware(request("/dashboard", "eyJhbGciOi"));

      expect(locationOf(response).origin).toBe(APP_BASE_URL);
      expect(locationOf(response).pathname).toBe("/login");
    });

    it.each([
      "/dashboard",
      "/dashboard/fyi",
      "/minutes/new",
      "/admin/job-failures",
      "/insights",
      "/weekly-summary",
    ])("redirects %s to the public origin", async (path) => {
      const response = await runMiddleware(request(path));

      expect(locationOf(response).origin).toBe(APP_BASE_URL);
      expect(locationOf(response).pathname).toBe("/login");
    });
  });

  describe("passing an authenticated request through", () => {
    it("does not redirect, so there is no Location to get wrong", async () => {
      verifySession.mockResolvedValue({ userId: "u1", lastActivity: Date.now() });
      refreshSessionToken.mockResolvedValue(null);

      const response = await runMiddleware(request("/dashboard", "eyJhbGciOi"));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("does not verify or slide a session for an absent cookie", async () => {
      await runMiddleware(request("/minutes/new"));

      expect(verifySession).not.toHaveBeenCalled();
      expect(refreshSessionToken).not.toHaveBeenCalled();
    });
  });

  describe("when APP_BASE_URL is missing", () => {
    it("throws instead of falling back to the container origin", async () => {
      // The chosen trade-off: a misconfigured deploy fails visibly instead of
      // quietly redirecting somewhere unroutable. Worth pinning because the
      // alternative — reusing the request — is exactly the bug being fixed.
      delete mutableEnv.APP_BASE_URL;
      mutableEnv.NODE_ENV = "production";

      await expect(runMiddleware(request("/dashboard"))).rejects.toThrow(
        /APP_BASE_URL is missing/,
      );
    });
  });
});