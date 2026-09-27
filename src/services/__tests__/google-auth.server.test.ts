import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockTokenUpdate = vi.fn();
const mockUserUpdate = vi.fn().mockResolvedValue({});

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      oAuthToken: {
        findFirst: mockFindFirst,
        update: mockTokenUpdate,
      },
      user: {
        update: mockUserUpdate,
      },
    };
  },
}));

vi.mock("../../lib/crypto.server", () => ({
  encrypt: (text: string) => `encrypted:${text}`,
  decrypt: (text: string) => text.replace("encrypted:", ""),
}));

import { getValidAccessToken, TokenRevokedError } from "../../lib/google-auth.server";

describe("getValidAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdate.mockResolvedValue({});
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  it("returns decrypted access token when not expired", async () => {
    mockFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "encrypted:my-access-token",
      refreshToken: "encrypted:my-refresh-token",
      expiresAt: new Date(Date.now() + 3600_000),
      scope: "email",
    });

    const token = await getValidAccessToken("user-1");
    expect(token).toBe("my-access-token");
    expect(mockTokenUpdate).not.toHaveBeenCalled();
  });

  it("refreshes token when near expiry", async () => {
    mockFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "encrypted:old-token",
      refreshToken: "encrypted:my-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      scope: "email",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
            scope: "email",
            token_type: "Bearer",
          }),
      }),
    );

    const token = await getValidAccessToken("user-1");
    expect(token).toBe("new-access-token");
    expect(mockTokenUpdate).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({
        accessToken: "encrypted:new-access-token",
      }),
    });

    vi.unstubAllGlobals();
  });

  it("throws TokenRevokedError on invalid_grant", async () => {
    mockFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "encrypted:old-token",
      refreshToken: "encrypted:my-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      scope: "email",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("invalid_grant"),
      }),
    );

    await expect(getValidAccessToken("user-1")).rejects.toThrow(TokenRevokedError);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { tokenRevokedAt: expect.any(Date) },
    });
    vi.unstubAllGlobals();
  });

  it("throws generic error on non-invalid_grant refresh failure", async () => {
    mockFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "encrypted:old-token",
      refreshToken: "encrypted:my-refresh-token",
      expiresAt: new Date(Date.now() + 60_000),
      scope: "email",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("server_error"),
      }),
    );

    await expect(getValidAccessToken("user-1")).rejects.toThrow("Token refresh failed");
    vi.unstubAllGlobals();
  });

  it("throws when no token record exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getValidAccessToken("user-1")).rejects.toThrow("No OAuth tokens found");
  });

  it("throws when no refresh token available", async () => {
    mockFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "encrypted:old-token",
      refreshToken: "",
      expiresAt: new Date(Date.now() + 60_000),
      scope: "email",
    });
    await expect(getValidAccessToken("user-1")).rejects.toThrow("No refresh token available");
  });
});
