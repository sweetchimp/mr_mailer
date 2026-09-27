import { NextRequest, NextResponse } from "next/server";
import {
  clearStateCookie,
  completeAuth,
  decodeStateCookie,
} from "@/lib/oauth.server";
import { sessionCookie, signSession } from "@/lib/session.server";
import { runPostLogin } from "@/lib/auth-callback.server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const loginUrl = new URL("/login", request.url);
  const oauthState = decodeStateCookie(request.headers.get("Cookie"));

  if (
    !oauthState ||
    oauthState.provider !== "MICROSOFT" ||
    !state ||
    oauthState.state !== state
  ) {
    loginUrl.searchParams.set("error", "invalid_state");
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }

  if (!code) {
    loginUrl.searchParams.set("error", "oauth_failed");
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }

  try {
    const user = await completeAuth("MICROSOFT", code, oauthState.codeVerifier);
    const token = await signSession({
      userId: user.id,
      lastActivity: Date.now(),
    });

    runPostLogin(user);

    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    res.headers.append("Set-Cookie", sessionCookie(token));
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  } catch {
    loginUrl.searchParams.set("error", "oauth_failed");
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }
}