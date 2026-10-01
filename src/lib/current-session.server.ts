import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./prisma.server";
import { SESSION_MAX_AGE_SECONDS } from "./session-cookie";
import {
  getSessionCookieName,
  verifySession,
} from "./session.server";
import type { SessionData } from "./session.server";
import type { User } from "@prisma/client";

async function loadSession(): Promise<SessionData | null> {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  if (!token) return null;
  return verifySession(token);
}

async function loadCurrentUser(): Promise<User | null> {
  const session = await loadSession();
  if (!session?.userId) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

/**
 * Memoized for the duration of one request.
 *
 * `cache` from React, not a module-level variable: the point is to collapse the
 * repeated calls *within a single render*, not to hold a user object in a
 * process-global that could outlive the request and serve one account's data to
 * another. Every server component, layout, and action that calls this in the
 * same render shares one result.
 *
 * This was not a micro-optimisation. A dashboard render called `requireUser`
 * three or four times — layout, ticker, page, and any action helper — and each
 * call independently verified the JWT and ran a `user.findUnique`. On top of
 * that, `verifySession` is cheap but `readSession` is not free, and the query is
 * a network round trip to MySQL on every one of them.
 *
 * Outside a React render, `cache` is a pass-through, so server actions and
 * middleware keep their uncached behaviour.
 */
export const getCurrentUser = cache(loadCurrentUser);

/**
 * No sliding refresh here on purpose: writing the cookie from a Server
 * Component render throws and 500s the page. `refreshSessionToken` runs in
 * middleware instead, which is allowed to set cookies and sees every matched
 * request. This function stays a pure read so it is safe to call from pages.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Re-exported so callers can reason about the idle window without duplicating it. */
export const SESSION_IDLE_TIMEOUT_MS = SESSION_MAX_AGE_SECONDS * 1000;
