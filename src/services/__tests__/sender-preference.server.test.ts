import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpsert, mockFindMany, mockUpdateMany } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      senderPreference: {
        upsert: mockUpsert,
        findMany: mockFindMany,
        updateMany: mockUpdateMany,
      },
    };
  },
}));

import {
  dismissSenderSuggestion,
  getUnsubscribeNotices,
  recordLowPriorityDismissal,
  UNSUBSCRIBE_THRESHOLD,
} from "../sender-preference.server";

const BASE = {
  userId: "user-1",
  sender: "Newsletter <news@example.com>",
  senderAddress: "news@example.com",
  priority: "LOW" as const,
  alreadyDismissed: false,
};

describe("recordLowPriorityDismissal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  it("creates the preference on the first signal", async () => {
    expect(await recordLowPriorityDismissal(BASE)).toBe(true);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId_senderAddress: { userId: "user-1", senderAddress: "news@example.com" } },
      create: {
        userId: "user-1",
        senderAddress: "news@example.com",
        senderName: "Newsletter",
        lowDismissals: 1,
      },
      update: {
        lowDismissals: { increment: 1 },
        senderName: "Newsletter",
      },
    });
  });

  it("increments without resetting the count to one", async () => {
    await recordLowPriorityDismissal(BASE);

    expect(mockUpsert.mock.calls[0][0].update.lowDismissals).toEqual({ increment: 1 });
  });

  it("ignores a dismissal of something the AI called MEDIUM", async () => {
    // Dismissing one reply is a decision about that message, not the sender.
    expect(await recordLowPriorityDismissal({ ...BASE, priority: "MEDIUM" })).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("ignores a dismissal of something the AI called HIGH", async () => {
    expect(await recordLowPriorityDismissal({ ...BASE, priority: "HIGH" })).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("ignores a re-dismissal of an already-dismissed row", async () => {
    // A card dismiss racing the bulk bar's Promise.all must not count twice.
    expect(await recordLowPriorityDismissal({ ...BASE, alreadyDismissed: true })).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("ignores a row with no parsed address", async () => {
    // Rows written before senderAddress existed, and unparseable senders.
    expect(await recordLowPriorityDismissal({ ...BASE, senderAddress: null })).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("does not blank out a known name when the header carries none", async () => {
    await recordLowPriorityDismissal({
      ...BASE,
      sender: "news@example.com",
    });

    expect(mockUpsert.mock.calls[0][0].update).toEqual({
      lowDismissals: { increment: 1 },
    });
  });
});

describe("getUnsubscribeNotices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it("asks for senders at or over the threshold that were not declined", async () => {
    await getUnsubscribeNotices("user-1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          lowDismissals: { gte: UNSUBSCRIBE_THRESHOLD },
          suggestionDismissedAt: null,
        },
      }),
    );
  });

  it("scopes to the requesting user", async () => {
    await getUnsubscribeNotices("user-2");
    expect(mockFindMany.mock.calls[0][0].where.userId).toBe("user-2");
  });

  it("keys the result by address for a card to look itself up", async () => {
    mockFindMany.mockResolvedValue([
      { senderAddress: "a@example.com", senderName: "A", lowDismissals: 9 },
      { senderAddress: "b@example.com", senderName: null, lowDismissals: 5 },
    ]);

    const notices = await getUnsubscribeNotices("user-1");

    expect(notices["a@example.com"]).toEqual({ senderName: "A", count: 9 });
    expect(notices["b@example.com"]).toEqual({ senderName: null, count: 5 });
  });

  it("returns an empty map rather than throwing when nobody qualifies", async () => {
    expect(await getUnsubscribeNotices("user-1")).toEqual({});
  });
});

describe("dismissSenderSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("scopes the write by userId, not by address alone", async () => {
    await dismissSenderSuggestion("user-1", "news@example.com");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", senderAddress: "news@example.com" },
      data: { suggestionDismissedAt: expect.any(Date) },
    });
  });

  it("reports success", async () => {
    expect(await dismissSenderSuggestion("user-1", "news@example.com")).toEqual({
      dismissed: true,
    });
  });

  it("treats an already-dismissed suggestion as a no-op, not an error", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    expect(await dismissSenderSuggestion("user-1", "news@example.com")).toEqual({
      dismissed: false,
    });
  });
});
