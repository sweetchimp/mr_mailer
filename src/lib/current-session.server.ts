import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma.server";
import { SESSION_MAX_AGE_SECONDS } from "./session-cookie";
import {
  getSessionCookieName,
  verifySession,
} from "./session.server";
import type { SessionData } from "./session.server";
import type { User } from "@prisma/client";

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

  // No sliding refresh here on purpose: writing the cookie from a Server
  // Component render throws and 500s the page. `refreshSessionToken` runs in
  // middleware instead, which is allowed to set cookies and sees every matched
  // request. This function stays a pure read so it is safe to call from pages.
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");
  return user;
}

/** Re-exported so callers can reason about the idle window without duplicating it. */
export const SESSION_IDLE_TIMEOUT_MS = SESSION_MAX_AGE_SECONDS * 1000;
