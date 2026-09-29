import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCount,
  mockFindMany,
  mockUserFindFirst,
  mockSendNewMessage,
  mockGetEmailProvider,
} = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockSendNewMessage: vi.fn(),
  mockGetEmailProvider: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      emailSummary: { count: mockCount, findMany: mockFindMany },
      user: { findFirst: mockUserFindFirst },
    };
  },
}));

vi.mock("../email-provider.server", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

import {
  getWeeklyStats,
  sendWeeklyDigest,
  weeklyWindow,
} from "../weekly-digest.server";

const WINDOW = {
  start: new Date("2026-09-21T18:00:00Z"),
  end: new Date("2026-09-28T18:00:00Z"),
};

const OPTED_IN = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  weeklyDigestEmail: true,
  tokenRevokedAt: null,
};

describe("weeklyWindow", () => {
  it("reaches back seven days from the reference, not to midnight", () => {
    const window = weeklyWindow(new Date("2026-09-28T18:00:00Z"));
    expect(window.end.toISOString()).toBe("2026-09-28T18:00:00.000Z");
    expect(window.start.toISOString()).toBe("2026-09-21T18:00:00.000Z");
  });
});

describe("getWeeklyStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
  });

  it("scopes every count to the requesting user", async () => {
    await getWeeklyStats("user-7", WINDOW);

    for (const call of mockCount.mock.calls) {
      expect(call[0].where.userId).toBe("user-7");
    }
    expect(mockFindMany.mock.calls[0][0].where.userId).toBe("user-7");
  });

  it("keys handled counts off sentAt and dismissedAt, not createdAt", async () => {
    await getWeeklyStats("user-1", WINDOW);

    const where = mockCount.mock.calls.map((c) => c[0].where);
    expect(where[0]).toEqual({
      userId: "user-1",
      sentAt: { gte: WINDOW.start, lte: WINDOW.end },
    });
    expect(where[1]).toEqual({
      userId: "user-1",
      dismissedAt: { gte: WINDOW.start, lte: WINDOW.end },
    });
  });

  it("does not window the backlog", async () => {
    // A pending email is pending now; filtering it by date would understate it.
    await getWeeklyStats("user-1", WINDOW);

    const where = mockCount.mock.calls.map((c) => c[0].where);
    expect(where[2]).toEqual({ userId: "user-1", status: "PENDING", priority: "HIGH" });
    expect(where[5]).toEqual({ userId: "user-1", status: "SNOOZED" });
  });

  it("returns a null average when nothing was replied to", async () => {
    const stats = await getWeeklyStats("user-1", WINDOW);
    expect(stats.avgTimeToReplyMs).toBeNull();
    expect(stats.replySamples).toBe(0);
  });

  it("computes the average from the replied rows", async () => {
    mockFindMany.mockResolvedValue([
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:01:00Z") },
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:03:00Z") },
    ]);

    const stats = await getWeeklyStats("user-1", WINDOW);

    expect(stats.avgTimeToReplyMs).toBe(120_000);
    expect(stats.replySamples).toBe(2);
  });
});

describe("sendWeeklyDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    mockSendNewMessage.mockResolvedValue(undefined);
    mockGetEmailProvider.mockResolvedValue({ sendNewMessage: mockSendNewMessage });
    mockUserFindFirst.mockResolvedValue(OPTED_IN);
  });

  it("sends to the user's own address when opted in", async () => {
    const result = await sendWeeklyDigest("user-1");

    expect(result.sent).toBe(true);
    expect(mockSendNewMessage).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Your week in the inbox",
        body: expect.stringContaining("Hi Ada — here's your week."),
      }),
    );
  });

  it("sends nothing when the user never opted in", async () => {
    mockUserFindFirst.mockResolvedValue({
      ...OPTED_IN,
      weeklyDigestEmail: false,
    });

    const result = await sendWeeklyDigest("user-1");

    expect(result).toEqual({ sent: false, reason: "opted-out" });
    expect(mockSendNewMessage).not.toHaveBeenCalled();
  });

  it("sends nothing when the token has been revoked", async () => {
    mockUserFindFirst.mockResolvedValue({
      ...OPTED_IN,
      tokenRevokedAt: new Date("2026-09-01T00:00:00Z"),
    });

    const result = await sendWeeklyDigest("user-1");

    expect(result).toEqual({ sent: false, reason: "token-revoked" });
    expect(mockGetEmailProvider).not.toHaveBeenCalled();
  });

  it("sends nothing when there is no recipient", async () => {
    mockUserFindFirst.mockResolvedValue({ ...OPTED_IN, email: "" });

    expect(await sendWeeklyDigest("user-1")).toEqual({
      sent: false,
      reason: "no-recipient",
    });
    expect(mockSendNewMessage).not.toHaveBeenCalled();
  });

  it("propagates a provider failure so the worker records it", async () => {
    mockSendNewMessage.mockRejectedValue(new Error("Graph API error: 403"));

    await expect(sendWeeklyDigest("user-1")).rejects.toThrow("403");
  });
});
