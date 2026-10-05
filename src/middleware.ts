import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { appUrl } from "@/lib/env.server";
import {
  getSessionCookieName,
  refreshSessionToken,
  sessionCookieOptions,
  verifySession,
} from "@/lib/session.server";

/**
 * Two jobs, both of which need to happen before the page renders.
 *
 * 1. Redirect guard. A session JWT always starts with "eyJ", so this is only a
 *    cheap shape check. The real gate is `requireUser()` in each page, which
 *    verifies the signature and loads the user.
 * 2. Sliding the session forward. This has to live here rather than in
 *    `requireUser()` because setting a cookie is illegal during a Server
 *    Component render — it throws and 500s the page. Middleware may set cookies
 *    and runs on every matched request, so an active user keeps their session
 *    while an idle one still expires after 30 minutes.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Built from APP_BASE_URL, never from request.url: behind Railway the latter
  // is the container's bind address (0.0.0.0:8080), so a request-derived
  // redirect sends the browser somewhere unroutable. See appUrl().
  if (!token?.startsWith("eyJ")) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const session = await verifySession(token);

  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const refreshed = await refreshSessionToken(session);
  if (!refreshed) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(
    getSessionCookieName(),
    refreshed,
    sessionCookieOptions(),
  );
  return response;
}

export const config = {
  // /admin is included so an unauthenticated visitor is redirected to /login
  // rather than landing on a page whose requireUser() then throws. /minutes,
  // /insights and /weekly-summary are here for the same reason, and for the
  // second job above: without them, a user reading minutes, their reply history
  // or their weekly numbers gets no session sliding and is logged out at the
  // 30-minute mark despite having just interacted with the app. The middleware is
  // only a redirect guard either way.
  matcher: [
    "/dashboard/:path*",
    "/minutes/:path*",
    "/admin/:path*",
    "/insights/:path*",
    "/weekly-summary/:path*",
  ],
};
