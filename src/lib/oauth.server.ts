import crypto from "node:crypto";
import { prisma } from "./prisma.server";
import { encrypt } from "./crypto.server";
import { getAppBaseUrl } from "./env.server";
import type { Provider, User } from "@prisma/client";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export interface OAuthState {
  provider: Provider;
  state: string;
  codeVerifier: string;
}

export function generateState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function encodeStateCookie(value: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const parts = [
    `${OAUTH_STATE_COOKIE}=${payload}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function decodeStateCookie(cookieHeader: string | null): OAuthState | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`));
  if (!match) return null;
  try {
    const raw = match.slice(OAUTH_STATE_COOKIE.length + 1);
    const value = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as OAuthState;
    if (!value.state || !value.codeVerifier || !value.provider) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearStateCookie(): string {
  const parts = [
    `${OAUTH_STATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function saveOAuthTokens(
  userId: string,
  provider: Provider,
  tokens: OAuthTokens,
  fallbackScope: string,
): Promise<void> {
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : "";
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scope = tokens.scope ?? fallbackScope;

  const existing = await prisma.oAuthToken.findFirst({
    where: { userId, provider },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.oAuthToken.update({
      where: { id: existing.id },
      data: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        scope,
      },
    });
  } else {
    await prisma.oAuthToken.create({
      data: {
        userId,
        provider,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        scope,
      },
    });
  }
}

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const MICROSOFT_SCOPES = [
  "Mail.Read",
  "Mail.Send",
  "User.Read",
  "offline_access",
  "openid",
  "email",
  "profile",
];

function getMicrosoftTenant(): string {
  const raw = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  return /^(?:common|organizations|consumers|[0-9a-fA-F-]{36})$/.test(raw)
    ? raw
    : "common";
}

function getMicrosoftTokenEndpoint(): string {
  return `https://login.microsoftonline.com/${getMicrosoftTenant()}/oauth2/v2.0/token`;
}

function getMicrosoftAuthEndpoint(): string {
  return `https://login.microsoftonline.com/${getMicrosoftTenant()}/oauth2/v2.0/authorize`;
}

/**
 * Both callbacks are derived from one origin so they cannot disagree with each
 * other, and so a missing value fails at startup naming the variable instead of
 * at the provider carrying `redirect_uri=undefined`. See getAppBaseUrl() for
 * the validation rules and why the request is not consulted.
 *
 * The former GOOGLE_REDIRECT_URI and MICROSOFT_REDIRECT_URI variables are no
 * longer read and have no effect if set.
 */
export function googleRedirectUri(): string {
  return `${getAppBaseUrl()}/auth/google/callback`;
}

export function microsoftRedirectUri(): string {
  return `${getAppBaseUrl()}/auth/microsoft/callback`;
}

export function buildAuthUrl(provider: Provider, state: string, codeVerifier: string): string {
  const challenge = generateCodeChallenge(codeVerifier);

  if (provider === "GOOGLE") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "select_account consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: microsoftRedirectUri(),
    response_type: "code",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_mode: "query",
  });
  return `${getMicrosoftAuthEndpoint()}?${params.toString()}`;
}

async function exchangeCode(
  provider: Provider,
  code: string,
  codeVerifier: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
  });

  let tokenUrl: string;
  let clientId: string;
  let clientSecret: string;
  let redirectUri: string;

  if (provider === "GOOGLE") {
    tokenUrl = "https://oauth2.googleapis.com/token";
    clientId = process.env.GOOGLE_CLIENT_ID!;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    redirectUri = googleRedirectUri();
  } else {
    tokenUrl = getMicrosoftTokenEndpoint();
    clientId = process.env.MICROSOFT_CLIENT_ID!;
    clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
    redirectUri = microsoftRedirectUri();
  }

  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} token exchange failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as OAuthTokens;
}

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

interface MicrosoftProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

export async function completeAuth(
  provider: Provider,
  code: string,
  codeVerifier: string,
): Promise<User> {
  const tokens = await exchangeCode(provider, code, codeVerifier);

  if (provider === "GOOGLE") {
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileRes.ok) {
      throw new Error(`Google profile fetch failed: ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as GoogleProfile;

    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      create: {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name ?? null,
      },
      update: {
        email: profile.email,
        name: profile.name ?? null,
        tokenRevokedAt: null,
      },
    });

    await saveOAuthTokens(user.id, "GOOGLE", tokens, GOOGLE_SCOPES.join(" "));
    return user;
  }

  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Microsoft Graph profile fetch failed: ${profileRes.status}`);
  }
  const profile = (await profileRes.json()) as MicrosoftProfile;
  const email = profile.mail ?? profile.userPrincipalName;
  if (!email) {
    throw new Error("Microsoft account has no email address");
  }

  let user = await prisma.user.findUnique({ where: { microsoftId: profile.id } });

  if (!user) {
    const byEmail = await prisma.user.findFirst({ where: { email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { microsoftId: profile.id, tokenRevokedAt: null },
      });
    } else {
      user = await prisma.user.create({
        data: {
          microsoftId: profile.id,
          email,
          name: profile.displayName ?? null,
        },
      });
    }
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email, tokenRevokedAt: null },
    });
  }

  await saveOAuthTokens(user.id, "MICROSOFT", tokens, MICROSOFT_SCOPES.join(" "));
  return user;
}