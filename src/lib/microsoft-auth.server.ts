import { prisma } from "./prisma.server";
import { decrypt, encrypt } from "./crypto.server";
import { TokenRevokedError } from "./google-auth.server";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const MICROSOFT_SCOPES = [
  "Mail.Read",
  "Mail.Send",
  "User.Read",
  "offline_access",
  "openid",
  "email",
  "profile",
].join(" ");

function getTenant(): string {
  return process.env.MICROSOFT_TENANT_ID?.trim() || "common";
}

function getTokenEndpoint(): string {
  return `https://login.microsoftonline.com/${getTenant()}/oauth2/v2.0/token`;
}

export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const tokenRecord = await prisma.oAuthToken.findFirst({
    where: { userId, provider: "MICROSOFT" },
    orderBy: { createdAt: "desc" },
  });

  if (!tokenRecord) {
    throw new Error("No Microsoft OAuth tokens found for user");
  }

  const now = new Date();
  const expiresAt = new Date(tokenRecord.expiresAt);
  const needsRefresh = expiresAt.getTime() - now.getTime() < REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return decrypt(tokenRecord.accessToken);
  }

  if (!tokenRecord.refreshToken) {
    throw new Error("No Microsoft refresh token available");
  }

  const refreshToken = decrypt(tokenRecord.refreshToken);

  const response = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPES,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    const isInvalidGrant = error.includes("invalid_grant");

    if (isInvalidGrant) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokenRevokedAt: new Date() },
      }).catch(() => {});

      throw new TokenRevokedError(
        `Microsoft access revoked for user ${userId}. Re-authentication required.`,
        userId,
      );
    }

    throw new Error(`Microsoft token refresh failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const newAccessToken = encrypt(data.access_token);
  const newRefreshToken = data.refresh_token
    ? encrypt(data.refresh_token)
    : tokenRecord.refreshToken;
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.oAuthToken.update({
    where: { id: tokenRecord.id },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      scope: data.scope,
    },
  });

  return data.access_token;
}