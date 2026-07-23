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
      cookie: "oauth2",
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
          },
        });

        const encryptedAccessToken = encrypt(tokens.accessToken());
        const encryptedRefreshToken = tokens.hasRefreshToken()
          ? encrypt(tokens.refreshToken())
          : "";
        const expiresAt = tokens.accessTokenExpiresAt();

      const existingToken = await prisma.oAuthToken.findFirst({
        where: { userId: user.id },
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
