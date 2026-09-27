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
