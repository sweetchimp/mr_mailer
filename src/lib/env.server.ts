const INSECURE_PLACEHOLDERS = new Set([
  "",
  "change-me",
  "changeme",
  "secret",
  "your-secret-here",
]);

/**
 * Reads one of the two values the legal pages publish about their operator.
 *
 * Deliberately has no fallback. The contact address and operator name are
 * statements of fact about who runs this deployment, and a missing value would
 * otherwise ship a placeholder like `privacy@example.com` to a live privacy
 * policy — a worse outcome than a 500, because it looks deliberate. There is no
 * development default either: inventing a plausible-looking address here would
 * be the same failure with a nicer name.
 *
 * The `example.*` domains are rejected because `.env.example` documents one,
 * and copying that file verbatim is the most likely way a placeholder reaches
 * production.
 *
 * Throws rather than returning null so the failure happens at the point of
 * render with the variable's name in the message, not somewhere upstream as an
 * empty string in a sentence.
 */
const PLACEHOLDER_EMAIL_DOMAINS = ["example.com", "example.org", "example.net"];
const PLACEHOLDER_OPERATOR_NAMES = new Set([
  "your company name",
  "your name",
  "operator",
  "company name",
  "example",
  "example inc",
]);

function getLegalIdentityVariable(
  name: "OPERATOR_NAME" | "CONTACT_EMAIL",
): string {
  const value = process.env[name]?.trim();
  const lower = value?.toLowerCase();
  const domain = value?.split("@")[1]?.toLowerCase();

  const isPlaceholder =
    !value ||
    INSECURE_PLACEHOLDERS.has(lower!) ||
    (domain !== undefined && PLACEHOLDER_EMAIL_DOMAINS.includes(domain)) ||
    PLACEHOLDER_OPERATOR_NAMES.has(lower!);

  if (!isPlaceholder) {
    return value;
  }

  throw new Error(
    `${name} is missing or set to a placeholder. It is published on the ` +
      `/privacy and /terms pages and must name the real operator or contact ` +
      `address for this deployment — the placeholder form in .env.example is ` +
      `rejected on purpose.`,
  );
}

/** The legal operator of this deployment, as shown on /privacy and /terms. */
export function getOperatorName(): string {
  return getLegalIdentityVariable("OPERATOR_NAME");
}

/** The address privacy and deletion requests are sent to, shown on /privacy. */
export function getContactEmail(): string {
  return getLegalIdentityVariable("CONTACT_EMAIL");
}

/** Fallback used only when `RETENTION_DAYS` is unset or nonsensical. */
export const DEFAULT_RETENTION_DAYS = 90;

/**
 * How long email summaries and job-failure logs are kept.
 *
 * Lives here rather than in `cleanup.server.ts` so the privacy policy can state
 * the number the app actually enforces without importing Prisma into a page
 * that renders for logged-out visitors.
 */
export function getRetentionDays(): number {
  const raw = process.env.RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

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

/**
 * Builds an absolute in-app URL from the configured origin.
 *
 * The second argument to `new URL()` is the trap this exists to close. Passing
 * `request.url` resolves against whatever origin the request arrived with, and
 * behind a proxy that is not the public one: Next's standalone server seeds
 * __NEXT_PRIVATE_ORIGIN from its bind address (see start-server.js), so a
 * container started with HOSTNAME=0.0.0.0 on PORT=8080 believes its origin is
 * http://0.0.0.0:8080 and hands that to every request.url. A redirect built
 * that way is a well-formed URL to an unroutable address, which is why a
 * successful login could end at ERR_ADDRESS_INVALID rather than at a page.
 *
 * Returns a URL rather than a string so callers can keep setting search params
 * on it, which is how the OAuth callbacks attach ?error=... to /login.
 */
export function appUrl(path: string): URL {
  return new URL(path, getAppBaseUrl());
}
