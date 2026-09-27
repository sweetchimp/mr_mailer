import { NextResponse } from "next/server";
import {
  buildAuthUrl,
  encodeStateCookie,
  generateCodeVerifier,
  generateState,
} from "@/lib/oauth.server";

export function GET() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authUrl = buildAuthUrl("MICROSOFT", state, codeVerifier);

  const res = NextResponse.redirect(authUrl);
  res.headers.append(
    "Set-Cookie",
    encodeStateCookie({ provider: "MICROSOFT", state, codeVerifier }),
  );
  return res;
}