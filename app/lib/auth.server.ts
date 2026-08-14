import { Authenticator } from "remix-auth";
import { OAuth2Strategy, CodeChallengeMethod } from "remix-auth-oauth2";
import { createCookieSessionStorage } from "react-router";
import type { User } from "../../generated/prisma/client";
import { prisma } from "./prisma.server";
import { encrypt } from "./crypto.server";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge: 1800,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET!],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

export const authenticator = new Authenticator<User>();

authenticator.use(
  new OAuth2Strategy(
    {
      cookie: {
        name: "oauth2",
        sameSite: "Lax",
        ...(process.env.NODE_ENV === "production" && { secure: true }),
      },
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      redirectURI: process.env.GOOGLE_REDIRECT_URI!,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      codeChallengeMethod: CodeChallengeMethod.S256,
    },
    async ({ tokens }) => {
      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${tokens.accessToken()}` } },
      );
      const userInfo = (await userInfoRes.json()) as {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
      };

        const user = await prisma.user.upsert({
          where: { googleId: userInfo.sub },
          create: {
            googleId: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name ?? null,
          },
          update: {
            email: userInfo.email,
            name: userInfo.name ?? null,
            tokenRevokedAt: null,
          },
        });

        const encryptedAccessToken = encrypt(tokens.accessToken());
        const encryptedRefreshToken = tokens.hasRefreshToken()
          ? encrypt(tokens.refreshToken())
          : "";
        const expiresAt = tokens.accessTokenExpiresAt();

      const existingToken = await prisma.oAuthToken.findFirst({
        where: { userId: user.id, provider: "GOOGLE" },
        orderBy: { createdAt: "desc" },
      });

      if (existingToken) {
        await prisma.oAuthToken.update({
          where: { id: existingToken.id },
          data: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt,
            scope: tokens.scopes().join(" "),
          },
        });
      } else {
        await prisma.oAuthToken.create({
          data: {
            userId: user.id,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt,
            scope: tokens.scopes().join(" "),
          },
        });
      }

      return user;
    },
  ),
  "google",
);

if (process.env.MICROSOFT_CLIENT_ID) {
  const rawTenant = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  const microsoftTenant =
    /^(?:common|organizations|consumers|[0-9a-fA-F-]{36})$/.test(rawTenant)
      ? rawTenant
      : "common";

  authenticator.use(
    new OAuth2Strategy(
      {
        cookie: {
          name: "oauth2-microsoft",
          sameSite: "Lax",
          ...(process.env.NODE_ENV === "production" && { secure: true }),
        },
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? null,
        authorizationEndpoint: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/authorize`,
        tokenEndpoint: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`,
        redirectURI: process.env.MICROSOFT_REDIRECT_URI!,
        scopes: [
          "Mail.Read",
          "Mail.Send",
          "User.Read",
          "offline_access",
          "openid",
          "email",
          "profile",
        ],
        codeChallengeMethod: CodeChallengeMethod.S256,
      },
      async ({ tokens }) => {
        const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokens.accessToken()}` },
        });

        if (!profileRes.ok) {
          throw new Error(`Microsoft Graph profile fetch failed: ${profileRes.status}`);
        }

        const profile = (await profileRes.json()) as {
          id: string;
          mail?: string;
          userPrincipalName?: string;
          displayName?: string;
        };

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

        const encryptedAccessToken = encrypt(tokens.accessToken());
        const encryptedRefreshToken = tokens.hasRefreshToken()
          ? encrypt(tokens.refreshToken())
          : "";
        const expiresAt = tokens.accessTokenExpiresAt();

        const existingToken = await prisma.oAuthToken.findFirst({
          where: { userId: user.id, provider: "MICROSOFT" },
          orderBy: { createdAt: "desc" },
        });

        if (existingToken) {
          await prisma.oAuthToken.update({
            where: { id: existingToken.id },
            data: {
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              expiresAt,
              scope: tokens.scopes().join(" "),
            },
          });
        } else {
          await prisma.oAuthToken.create({
            data: {
              userId: user.id,
              provider: "MICROSOFT",
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              expiresAt,
              scope: tokens.scopes().join(" "),
            },
          });
        }

        return user;
      },
    ),
    "microsoft",
  );
}
