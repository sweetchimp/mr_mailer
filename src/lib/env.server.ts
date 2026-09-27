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
