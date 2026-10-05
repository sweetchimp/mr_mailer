import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as googleCallback } from "@/app/auth/google/callback/route";
import { GET as microsoftCallback } from "@/app/auth/microsoft/callback/route";

/**
 * The reported bug: a successful production login landed on
 * http://0.0.0.0:8080/dashboard and the browser reported ERR_ADDRESS_INVALID.
 *
 * The success path is what broke, because that is the only redirect a happy
 * login reaches. Every test below therefore drives the route with a request URL
 * on the container's bind address — what the standalone server sees when it
 * seeds its origin from HOSTNAME/PORT — and asserts the Location header carries
 * APP_BASE_URL instead. A route still calling `new URL("/dashboard", request.url)`
 * would satisfy every other assertion in this file and still ship the user to an
 * unroutable address, so the poisoned origin is the thing under test.
 *
 * The error paths are covered too, because they share `loginUrl` with the
 * success path and that object is where ?error=... is attached.
 */

const APP_BASE_URL = "https://app.example.com";
const CONTAINER_ORIGIN = "http://0.0.0.0:8080";
const STATE = "state-abc";
const VERIFIER = "verifier-abc";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_BASE_URL = process.env.APP_BASE_URL;

/** Next types NODE_ENV as readonly; see env.server.test.ts for the rationale. */
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

const completeAuth = vi.fn<(provider: string, code: string, verifier: string) => Promise<unknown>>();
const runPostLogin = vi.fn<(user: unknown) => void>();
const signSession = vi.fn<(data: unknown) => Promise<string>>();

vi.mock("@/lib/oauth.server", () => ({
  completeAuth: (provider: string, code: string, verifier: string) =>
    completeAuth(provider, code, verifier),
  decodeStateCookie: () => ({ provider: PROVIDER_UNDER_TEST, state: STATE, codeVerifier: VERIFIER }),
  clearStateCookie: () => "__session_state=; Path=/; Max-Age=0",
}));

vi.mock("@/lib/session.server", () => ({
  signSession: (data: unknown) => signSession(data),
  sessionCookie: (token: string) => `__session=${token}; Path=/; HttpOnly`,
}));

vi.mock("@/lib/auth-callback.server", () => ({
  runPostLogin: (user: unknown) => runPostLogin(user),
}));

/**
 * The mocked decodeStateCookie has to echo back the provider being tested, and
 * vi.mock factories are hoisted above module scope, so the provider travels
 * through this instead of a variable the factory cannot see.
 */
let PROVIDER_UNDER_TEST: "GOOGLE" | "MICROSOFT" = "GOOGLE";

const ROUTES = {
  GOOGLE: {
    provider: "GOOGLE" as const,
    handler: googleCallback,
    path: "/auth/google/callback",
  },
  MICROSOFT: {
    provider: "MICROSOFT" as const,
    handler: microsoftCallback,
    path: "/auth/microsoft/callback",
  },
};

function callbackRequest(path: string, query: string): NextRequest {
  return new NextRequest(`${CONTAINER_ORIGIN}${path}?${query}`, {
    headers: { cookie: "__session_state=state-cookie" },
  });
}

function locationOf(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  return new URL(location!);
}

describe.each(Object.entries(ROUTES))("%s callback redirects", (_name, route) => {
  beforeEach(() => {
    mutableEnv.APP_BASE_URL = APP_BASE_URL;
    mutableEnv.NODE_ENV = "production";
    PROVIDER_UNDER_TEST = route.provider;
    completeAuth.mockReset();
    runPostLogin.mockReset();
    signSession.mockReset();
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

  describe("on a successful login", () => {
    beforeEach(() => {
      completeAuth.mockResolvedValue({ id: "user-1", email: "a@b.test" });
      signSession.mockResolvedValue("signed-jwt");
    });

    it("redirects to /dashboard on APP_BASE_URL, not the container origin", async () => {
      const response = await route.handler(
        callbackRequest(route.path, `code=authcode&state=${STATE}`),
      );

      const location = locationOf(response);
      expect(location.origin).toBe(APP_BASE_URL);
      expect(location.pathname).toBe("/dashboard");
    });

    it("never emits a Location pointing at the container's bind address", async () => {
      const response = await route.handler(
        callbackRequest(route.path, `code=authcode&state=${STATE}`),
      );

      const location = response.headers.get("location")!;
      expect(location).not.toContain("0.0.0.0");
      expect(location).not.toContain(":8080");
      expect(location.startsWith(`${APP_BASE_URL}/`)).toBe(true);
    });

    it("sets the session cookie so the redirected page is authenticated", async () => {
      const response = await route.handler(
        callbackRequest(route.path, `code=authcode&state=${STATE}`),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("set-cookie")).toContain("__session=signed-jwt");
      expect(runPostLogin).toHaveBeenCalled();
    });

    it("passes the code and verifier from the state cookie to the token exchange", async () => {
      await route.handler(
        callbackRequest(route.path, `code=authcode&state=${STATE}`),
      );

      expect(completeAuth).toHaveBeenCalledWith(route.provider, "authcode", VERIFIER);
    });
  });

  describe("when the request arrives on the container origin", () => {
    it.each([
      ["invalid_state", ""],
      ["missing_code", `state=${STATE}`],
    ])("sends a %s failure to /login on APP_BASE_URL", async (_label, query) => {
      const response = await route.handler(callbackRequest(route.path, query));

      const location = locationOf(response);
      expect(location.origin).toBe(APP_BASE_URL);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).not.toBeNull();
      expect(response.headers.get("location")).not.toContain("0.0.0.0");
    });

    it("forwards a provider error verbatim on the public origin", async () => {
      const response = await route.handler(
        callbackRequest(
          route.path,
          `state=${STATE}&error=access_denied&error_description=User+declined`,
        ),
      );

      const location = locationOf(response);
      expect(location.origin).toBe(APP_BASE_URL);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).toBe("access_denied");
    });

    it("falls back to oauth_failed when the exchange throws", async () => {
      completeAuth.mockRejectedValue(new Error("token exchange failed"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await route.handler(
        callbackRequest(route.path, `code=authcode&state=${STATE}`),
      );

      const location = locationOf(response);
      expect(location.origin).toBe(APP_BASE_URL);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).toBe("oauth_failed");
    });
  });
});

describe("when APP_BASE_URL is missing in production", () => {
  beforeEach(() => {
    delete mutableEnv.APP_BASE_URL;
    mutableEnv.NODE_ENV = "production";
    completeAuth.mockResolvedValue({ id: "user-1", email: "a@b.test" });
    signSession.mockResolvedValue("signed-jwt");
    vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("throws rather than falling back to the container origin", async () => {
    // A misconfigured deploy now fails loudly on every redirect instead of
    // quietly producing an unroutable Location. Pinned so that trade-off cannot
    // be undone by reintroducing request.url as a fallback.
    await expect(
      googleCallback(
        callbackRequest("/auth/google/callback", `code=authcode&state=${STATE}`),
      ),
    ).rejects.toThrow(/APP_BASE_URL is missing/);
  });
});