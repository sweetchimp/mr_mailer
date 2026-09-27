import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma.server";
import { SESSION_MAX_AGE_SECONDS } from "./session-cookie";
import {
  getSessionCookieName,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "./session.server";
import type { SessionData } from "./session.server";
import type { User } from "@prisma/client";

/**
 * How stale `lastActivity` must get before we re-sign. Re-signing on *every*
 * request would keep the JWT's expiry permanently rolled forward (the old
 * cookie-session behaviour) but also emit a Set-Cookie on every render, so we
 * batch the refresh instead. Any value well under the 30-minute session lifetime
 * preserves the "30 minutes of inactivity logs you out" guarantee: activity
 * within this window keeps the cookie ahead of the idle deadline.
 */
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

async function readSession(): Promise<SessionData | null> {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession();
  if (!session?.userId) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

export async function requireUser(): Promise<User> {
  const session = await readSession();
  if (!session?.userId) redirect("/login");

  if (Date.now() - session.lastActivity > TOUCH_INTERVAL_MS) {
    const token = await signSession({
      userId: session.userId,
      lastActivity: Date.now(),
    });
    (await cookies()).set(getSessionCookieName(), token, sessionCookieOptions());
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");
  return user;
}

/** Re-exported so callers can reason about the idle window without duplicating it. */
export const SESSION_IDLE_TIMEOUT_MS = SESSION_MAX_AGE_SECONDS * 1000;
