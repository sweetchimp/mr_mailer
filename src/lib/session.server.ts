import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getSessionSecret } from "./env.server";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session-cookie";

const secretKey = new TextEncoder().encode(getSessionSecret());

export interface SessionData {
  userId: string;
  lastActivity: number;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export async function signSession(data: SessionData): Promise<string> {
  const payload: JWTPayload = {
    userId: data.userId,
    lastActivity: data.lastActivity,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const userId = payload.userId;
    if (typeof userId !== "string" || userId.length === 0) return null;
    return {
      userId,
      lastActivity:
        typeof payload.lastActivity === "number" ? payload.lastActivity : 0,
    };
  } catch {
    return null;
  }
}

/**
 * How stale `lastActivity` must get before the session is re-signed.
 *
 * Re-signing on *every* request would keep the JWT's expiry permanently rolled
 * forward (the old cookie-session behaviour) but also emit a Set-Cookie on every
 * render, so the refresh is batched instead. Any value well under the
 * 30-minute lifetime preserves the "30 minutes of inactivity logs you out"
 * guarantee: activity within this window keeps the cookie ahead of the deadline.
 */
export const SESSION_TOUCH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Returns a fresh session token when the current one is stale enough to slide,
 * or null when it should be left alone.
 *
 * This lives outside `requireUser()` on purpose. Sliding the session means
 * writing a cookie, and Next.js only permits that in a Server Action or Route
 * Handler — calling `cookies().set()` while a Server Component renders throws
 * "Cookies can only be modified in a Server Action or Route Handler" and
 * 500s the page. Because every dashboard page and every server action starts
 * with `requireUser()`, doing the touch there meant any session idle for longer
 * than this interval failed to render at all until the JWT expired and forced a
 * fresh login. Middleware runs on every matched request and is allowed to set
 * cookies, so that is where the refresh happens now.
 */
export async function refreshSessionToken(
  session: SessionData,
): Promise<string | null> {
  if (Date.now() - session.lastActivity <= SESSION_TOUCH_INTERVAL_MS) {
    return null;
  }
  return signSession({ userId: session.userId, lastActivity: Date.now() });
}

/**
 * Single source of truth for the session cookie's attributes, shared by the
 * string serializer below (used in route handlers) and by `cookies().set()`
 * (used when re-issuing a sliding session from a server component).
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}

function serialize(name: string, value: string, maxAge: number): string {
  const { httpOnly, sameSite, path, secure } = sessionCookieOptions();
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    ...(httpOnly ? ["HttpOnly"] : []),
    `SameSite=${sameSite === "lax" ? "Lax" : sameSite}`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookie(token: string): string {
  return serialize(SESSION_COOKIE_NAME, token, SESSION_MAX_AGE_SECONDS);
}

export function destroySessionCookie(): string {
  return serialize(SESSION_COOKIE_NAME, "", 0);
}
