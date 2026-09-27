import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * Cheap shape check only — a session JWT always starts with "eyJ". This is a
 * redirect guard, not the real gate: every page and server action also calls
 * requireUser(), which verifies the signature and loads the user. Nothing under
 * here is reachable without that second check.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token?.startsWith("eyJ")) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};