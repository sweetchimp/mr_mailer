/**
 * IMPORTANT: Every route that exports `middleware = [authMiddleware]`
 * MUST wrap its loader/action return value with `withSessionCookie(data, context)`
 * from `app/lib/session.server.ts`.
 *
 * This is required because React Router v8 middleware cannot set response
 * headers while continuing to the loader. The middleware stores the refreshed
 * session cookie in context; `withSessionCookie()` attaches it to the response.
 *
 * If a route forgets this call, the sliding session still works (userId is
 * validated), but the cookie expiry is NOT refreshed — meaning the user will
 * be logged out after 30 minutes of inactivity even if they were active on
 * that specific route. There is no runtime error for this omission.
 *
 * Protected routes that MUST use withSessionCookie():
 *   - routes/dashboard.tsx          (loader)
 *   - routes/admin.job-failures.tsx (loader)
 *   - routes/api.emails.$id.send.tsx    (action — uses validateSession() instead)
 *   - routes/api.emails.$id.dismiss.tsx  (action — uses validateSession() instead)
 */
import { redirect, type MiddlewareFunction } from "react-router";
import {
  getSession,
  commitSession,
  destroySession,
} from "../lib/auth.server";
import { storeRefreshedCookie, sessionCookieContext } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const authMiddleware: MiddlewareFunction = async ({
  request,
  context,
}) => {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId") as string | undefined;

  if (!userId) {
    throw redirect("/login");
  }

  const lastActivity = session.get("lastActivity") as number | undefined;
  if (!lastActivity || Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
    throw redirect("/login", {
      headers: { "Set-Cookie": await destroySession(session) },
    });
  }

  session.set("lastActivity", Date.now());
  const newCookie = await commitSession(session);
  storeRefreshedCookie(context, newCookie);

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw redirect("/login");
  }

  context.set(userContext, user);
};
