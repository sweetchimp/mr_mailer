import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReplyFeedbackCreate, mockReplyFeedbackFindMany } = vi.hoisted(() => ({
  mockReplyFeedbackCreate: vi.fn(),
  mockReplyFeedbackFindMany: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      replyFeedback: {
        create: mockReplyFeedbackCreate,
        findMany: mockReplyFeedbackFindMany,
      },
    };
  },
}));

import {
  getRecentReplyFeedback,
  recordReplyFeedback,
} from "../reply-feedback.server";

const BASE = {
  userId: "user-1",
  emailId: "msg-1",
  suggestedReply: "Sounds good, thanks!",
  finalReply: "Sounds good — thanks for turning this around so quickly.",
};

describe("recordReplyFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplyFeedbackCreate.mockResolvedValue({});
  });

  it("stores the diff when the user rewrote the suggestion", async () => {
    const wrote = await recordReplyFeedback(BASE);

    expect(wrote).toBe(true);
    expect(mockReplyFeedbackCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        emailId: "msg-1",
        generatedReply: BASE.suggestedReply,
        finalReply: BASE.finalReply,
        modifications: expect.any(Number),
      }),
    });
  });

  it("records a real character count, not just a flag", async () => {
    await recordReplyFeedback({
      ...BASE,
      suggestedReply: "ok",
      finalReply: "okay then",
    });

    const data = mockReplyFeedbackCreate.mock.calls[0][0].data;
    expect(data.insertions).toBeGreaterThan(0);
  });

  it("writes nothing when the reply was sent unedited", async () => {
    const wrote = await recordReplyFeedback({
      ...BASE,
      finalReply: BASE.suggestedReply,
    });

    expect(wrote).toBe(false);
    expect(mockReplyFeedbackCreate).not.toHaveBeenCalled();
  });

  it("treats surrounding whitespace as no edit", async () => {
    // The action trims before calling, so an unedited send arrives as the
    // suggestion verbatim. Guarding anyway keeps a stray trailing newline from
    // logging every accepted reply.
    const wrote = await recordReplyFeedback({
      ...BASE,
      finalReply: `  ${BASE.suggestedReply}\n`,
    });

    expect(wrote).toBe(false);
    expect(mockReplyFeedbackCreate).not.toHaveBeenCalled();
  });

  it("writes nothing when there was no AI suggestion to compare against", async () => {
    expect(await recordReplyFeedback({ ...BASE, suggestedReply: null })).toBe(false);
    expect(await recordReplyFeedback({ ...BASE, suggestedReply: "   " })).toBe(false);
    expect(mockReplyFeedbackCreate).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long email id without writing", async () => {
    const wrote = await recordReplyFeedback({ ...BASE, emailId: "x".repeat(513) });

    expect(wrote).toBe(false);
    expect(mockReplyFeedbackCreate).not.toHaveBeenCalled();
  });

  it("keys the row to the caller's userId and the provider message id", async () => {
    await recordReplyFeedback(BASE);

    expect(mockReplyFeedbackCreate.mock.calls[0][0].data).toMatchObject({
      userId: "user-1",
      emailId: "msg-1",
    });
  });
});

describe("getRecentReplyFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplyFeedbackFindMany.mockResolvedValue([]);
  });

  it("scopes the query to the requesting user", async () => {
    await getRecentReplyFeedback("user-2");
    expect(mockReplyFeedbackFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-2",
    });
  });

  it("defaults to a bounded, newest-first page", async () => {
    await getRecentReplyFeedback("user-1");

    const query = mockReplyFeedbackFindMany.mock.calls[0][0];
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.take).toBe(20);
  });

  it("clamps a caller-supplied take into range", async () => {
    await getRecentReplyFeedback("user-1", 5_000);
    expect(mockReplyFeedbackFindMany.mock.calls[0][0].take).toBe(100);

    await getRecentReplyFeedback("user-1", 0);
    expect(mockReplyFeedbackFindMany.mock.calls[1][0].take).toBe(1);
  });

  it("flattens createdAt into an ISO date for the client", async () => {
    mockReplyFeedbackFindMany.mockResolvedValue([
      {
        id: "rf-1",
        emailId: "msg-1",
        generatedReply: "a",
        finalReply: "b",
        insertions: 1,
        deletions: 2,
        modifications: 3,
        createdAt: new Date("2026-09-28T10:00:00Z"),
      },
    ]);

    const rows = await getRecentReplyFeedback("user-1");

    expect(rows[0].date).toBe("2026-09-28T10:00:00.000Z");
  });
});
