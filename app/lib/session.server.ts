import { createContext, type RouterContextProvider } from "react-router";
import { getSession, commitSession, destroySession } from "./auth.server";

export const sessionCookieContext = createContext<string | null>(null);

export function storeRefreshedCookie(
  context: Readonly<RouterContextProvider>,
  cookie: string,
) {
  context.set(sessionCookieContext, cookie);
}

export function withSessionCookie<T extends Record<string, unknown>>(
  data: T,
  context: Readonly<RouterContextProvider>,
): Response {
  const cookie = context.get(sessionCookieContext);
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export async function validateSession(request: Request): Promise<
  | { userId: string; setCookieHeader: string }
  | { error: string; setCookieHeader?: string }
> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId") as string | undefined;

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const lastActivity = session.get("lastActivity") as number | undefined;
  if (!lastActivity || Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
    const expiredCookie = await destroySession(session);
    return { error: "Session expired", setCookieHeader: expiredCookie };
  }

  session.set("lastActivity", Date.now());
  const setCookieHeader = await commitSession(session);
  return { userId, setCookieHeader };
}
