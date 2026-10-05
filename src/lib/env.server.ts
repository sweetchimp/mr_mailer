const INSECURE_PLACEHOLDERS = new Set([
  "",
  "change-me",
  "changeme",
  "secret",
  "your-secret-here",
]);

/**
 * SESSION_SECRET is dual-purpose: it signs the session JWT *and* derives the
 * AES-256-GCM key that OAuth access/refresh tokens are encrypted with.
 *
 * Consequences worth knowing before you touch it:
 *  - Rotating it invalidates every stored token, forcing all users to
 *    re-authenticate. (Splitting the two into separate secrets would have the
 *    same one-time cost, which is why that is still an open decision.)
 *  - A missing value used to fall back to the literal "change-me", which meant
 *    a misconfigured production deploy would silently sign sessions with a
 *    publicly known key. That now throws instead.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();

  if (secret && !INSECURE_PLACEHOLDERS.has(secret)) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is missing or set to a known-insecure placeholder. " +
        "Set it to a long random value, e.g. `openssl rand -base64 48`. " +
        "Note: rotating it invalidates all stored OAuth tokens and forces " +
        "every user to re-authenticate.",
    );
  }

  return "dev-only-insecure-secret-do-not-use-in-production";
}

/**
 * The app's public origin, from which the OAuth callback URLs are built.
 *
 * This replaces a pair of per-provider redirect-URI variables. Two
 * independently-configured URLs can drift apart, and a missing one fails at the
 * provider rather than here: `new URLSearchParams({ redirect_uri: undefined })`
 * stringifies to the literal text "undefined", which Google passes along as a
 * value and Microsoft rejects as not-an-absolute-URI (AADSTS90102). Neither
 * error points at the configuration that caused it.
 *
 * Deliberately not derived from the incoming request. Behind a proxy the
 * scheme and host a request arrives with depend on how far the proxy rewrote
 * it, so a request-derived origin differs between local, Railway, and whatever
 * host comes next — and a redirect URI that changes shape with the proxy is
 * exactly the kind of mismatch that only shows up in production.
 */
export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "APP_BASE_URL is missing. Set it to this app's public origin, with no " +
          "trailing slash, e.g. https://your-app.example.com. The OAuth callbacks " +
          "are derived from it as <APP_BASE_URL>/auth/google/callback and " +
          "<APP_BASE_URL>/auth/microsoft/callback, and both must be registered " +
          "with their providers.",
      );
    }

    return "http://localhost:3000";
  }

  // Tested against the raw string rather than the parsed URL on purpose:
  // `new URL("https://example.com").href` appends a slash, so checking the
  // parsed form would either always fail or never fail, and either way would
  // not tell someone they had just made the mistake this guards against.
  if (raw.endsWith("/")) {
    throw new Error(
      `APP_BASE_URL must not have a trailing slash (received "${raw}"). ` +
        `Use "${raw.replace(/\/+$/, "")}" instead.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `APP_BASE_URL must be an absolute URL including the scheme, e.g. ` +
        `https://your-app.example.com (received "${raw}").`,
    );
  }

  // WHATWG URL keeps IPv6 hosts bracketed, so both spellings are checked.
  const isLocalhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "[::1]";

  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new Error(
      `APP_BASE_URL must use https:// (received "${raw}"). Plain http:// is ` +
        `allowed only for localhost, because a provider will not match an ` +
        `insecure callback against a registered https one.`,
    );
  }

  // `.origin` rather than the raw string so a stray path or query cannot leak
  // into the callback URL and produce a value the provider has never seen.
  return parsed.origin;
}
