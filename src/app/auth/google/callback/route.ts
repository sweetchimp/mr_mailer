import { NextRequest, NextResponse } from "next/server";
import {
  clearStateCookie,
  completeAuth,
  decodeStateCookie,
} from "@/lib/oauth.server";
import { sessionCookie, signSession } from "@/lib/session.server";
import { runPostLogin } from "@/lib/auth-callback.server";
import { appUrl } from "@/lib/env.server";

const PROVIDER = "GOOGLE";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  // Google redirects back with ?error=... rather than rendering its own page
  // when the request is refused for a consent reason. Previously we only
  // checked for a missing `code`, so every such denial collapsed into a
  // generic `oauth_failed` with the actual reason thrown away.
  const providerError = searchParams.get("error");
  const providerErrorDescription = searchParams.get("error_description");

  // appUrl() rather than new URL("/login", request.url): request.url carries the
  // container's bind address behind Railway, which sent a successful login to
  // an unroutable origin. Every Location below is a full URL, so all of them
  // have to come from the configured origin.
  const loginUrl = appUrl("/login");
  const oauthState = decodeStateCookie(request.headers.get("Cookie"));

  if (
    !oauthState ||
    oauthState.provider !== "GOOGLE" ||
    !state ||
    oauthState.state !== state
  ) {
    loginUrl.searchParams.set("error", "invalid_state");
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }

  if (!code) {
    if (providerError) {
      console.error(
        `[oauth] ${PROVIDER} authorize refused: ${providerError}`,
        providerErrorDescription ?? "",
      );
      loginUrl.searchParams.set("error", providerError);
    } else {
      loginUrl.searchParams.set("error", "oauth_failed");
    }
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }

  try {
    const user = await completeAuth(PROVIDER, code, oauthState.codeVerifier);
    const token = await signSession({
      userId: user.id,
      lastActivity: Date.now(),
    });

    runPostLogin(user);

    const res = NextResponse.redirect(appUrl("/dashboard"));
    res.headers.append("Set-Cookie", sessionCookie(token));
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  } catch (error) {
    // Log the real cause. Without this, every failure looks identical from the
    // outside and there is nothing to go on when debugging a failed sign-in.
    console.error(
      `[oauth] ${PROVIDER} callback failed:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    loginUrl.searchParams.set("error", "oauth_failed");
    const res = NextResponse.redirect(loginUrl);
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  }
}