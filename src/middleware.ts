import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
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

  if (!token?.startsWith("eyJ")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySession(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
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
  // rather than landing on a page whose requireUser() then throws. The
  // middleware is only a redirect guard either way.
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
