import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindFirst, mockUserUpdate, mockGetValidAccessToken } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockGetValidAccessToken: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      oAuthToken: { findFirst: mockFindFirst },
      user: { update: mockUserUpdate },
    };
  },
}));

vi.mock("../../lib/google-auth.server", () => ({
  getValidAccessToken: mockGetValidAccessToken,
}));

import { getTodaysEvents } from "../calendar.server";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

describe("getTodaysEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockFindFirst.mockResolvedValue({ provider: "GOOGLE", scope: CALENDAR_SCOPE });
    mockGetValidAccessToken.mockResolvedValue("access-token");
  });

  it("returns today's events on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "evt-1",
              status: "confirmed",
              summary: "Standup",
              start: { dateTime: "2026-01-01T09:00:00Z" },
              end: { dateTime: "2026-01-01T09:15:00Z" },
              attendees: [{ email: "alice@example.com" }],
            },
          ],
        }),
      }),
    );

    const events = await getTodaysEvents("user-1");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Standup");
    expect(events[0].attendees).toEqual(["alice@example.com"]);
  });

  // The regression this guards: a Calendar 403 (API disabled in the project,
  // missing scope, per-calendar ACL, quota) is NOT a revoked Gmail grant. It
  // used to write user.tokenRevokedAt, which flipped the dashboard into
  // "reconnect Google" mode and hid the empty state.
  it("treats a 403 as an unavailable calendar and never marks the token revoked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: {
              code: 403,
              status: "PERMISSION_DENIED",
              message:
                "Calendar API has not been used in project 908538220193 before or it is disabled.",
            },
          }),
      }),
    );

    await expect(getTodaysEvents("user-1")).resolves.toEqual([]);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns an empty list without revoking when the scope was never granted", async () => {
    mockFindFirst.mockResolvedValue({
      provider: "GOOGLE",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });

    await expect(getTodaysEvents("user-1")).resolves.toEqual([]);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockGetValidAccessToken).not.toHaveBeenCalled();
  });

  it("returns an empty list for a non-Google account", async () => {
    mockFindFirst.mockResolvedValue({ provider: "MICROSOFT", scope: null });

    await expect(getTodaysEvents("user-1")).resolves.toEqual([]);
    expect(mockGetValidAccessToken).not.toHaveBeenCalled();
  });

  it("surfaces a non-403 API error rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "internal error",
      }),
    );

    await expect(getTodaysEvents("user-1")).rejects.toThrow(/Calendar API error: 500/);
  });
});
