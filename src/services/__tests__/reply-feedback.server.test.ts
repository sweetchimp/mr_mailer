import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReplyFeedbackCreate, mockReplyFeedbackFindMany, mockSummaryFindMany } = vi.hoisted(
  () => ({
    mockReplyFeedbackCreate: vi.fn(),
    mockReplyFeedbackFindMany: vi.fn(),
    mockSummaryFindMany: vi.fn(),
  }),
);

const { mockComputeReplyDiff } = vi.hoisted(() => ({
  mockComputeReplyDiff: vi.fn(() => ({ insertions: 4, deletions: 2, modifications: 2 })),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      replyFeedback: {
        create: mockReplyFeedbackCreate,
        findMany: mockReplyFeedbackFindMany,
      },
      emailSummary: {
        findMany: mockSummaryFindMany,
      },
    };
  },
}));

vi.mock("../../lib/diff.server", () => ({
  computeReplyDiff: mockComputeReplyDiff,
}));

import {
  getRepliesForStyleAnalysis,
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
    mockComputeReplyDiff.mockReturnValue({
      insertions: 4,
      deletions: 2,
      modifications: 2,
    });
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

  it("marks a rewrite as not accepted", async () => {
    await recordReplyFeedback(BASE);

    expect(mockReplyFeedbackCreate.mock.calls[0][0].data.accepted).toBe(false);
  });

  it("records an unedited send as accepted, rather than dropping it", async () => {
    // The behaviour this whole feature is built on. Dropping accepted replies
    // left the style analyser with nothing but evidence that suggestions were
    // wrong, which teaches the model to write shorter and blander every run.
    const wrote = await recordReplyFeedback({
      ...BASE,
      finalReply: BASE.suggestedReply,
    });

    expect(wrote).toBe(true);
    expect(mockReplyFeedbackCreate.mock.calls[0][0].data).toMatchObject({
      accepted: true,
      insertions: 0,
      deletions: 0,
      modifications: 0,
    });
  });

  it("treats surrounding whitespace as an accepted send, not a rewrite", async () => {
    // The action trims before calling, so an unedited send usually arrives
    // verbatim. Trimming again here keeps a stray trailing newline from
    // inflating the rewrite count with edits the user never made.
    await recordReplyFeedback({
      ...BASE,
      finalReply: `  ${BASE.suggestedReply}\n`,
    });

    expect(mockReplyFeedbackCreate.mock.calls[0][0].data.accepted).toBe(true);
  });

  it("skips the diff entirely for an accepted send", async () => {
    // The diff is the expensive part and there is nothing to diff, so the hot
    // send path should not pay for it.
    await recordReplyFeedback({
      ...BASE,
      finalReply: BASE.suggestedReply,
    });

    expect(mockComputeReplyDiff).not.toHaveBeenCalled();
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

describe("getRepliesForStyleAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplyFeedbackFindMany.mockResolvedValue([]);
    mockSummaryFindMany.mockResolvedValue([]);
  });

  function feedbackRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "rf-1",
      emailId: "sum-1",
      generatedReply: "Sounds good, thanks.",
      finalReply: "Yes, that works for me.",
      accepted: false,
      insertions: 1,
      deletions: 2,
      modifications: 3,
      createdAt: new Date("2026-09-28T10:00:00Z"),
      ...overrides,
    };
  }

  it("resolves the subject and priority by a second, id-matched query", async () => {
    // Not a Prisma relation: `ReplyFeedback.emailId` points at an
    // `EmailSummary.id` by convention and nothing enforces it, so there is no
    // relation field to traverse. The query has to be explicit.
    mockReplyFeedbackFindMany.mockResolvedValue([feedbackRow()]);
    mockSummaryFindMany.mockResolvedValue([
      {
        id: "sum-1",
        subject: "Re: Timeline",
        priority: "HIGH",
        senderAddress: "alice@example.com",
      },
    ]);

    const samples = await getRepliesForStyleAnalysis("user-1");

    expect(mockSummaryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["sum-1"] } } }),
    );
    expect(samples[0]).toMatchObject({
      suggested: "Sounds good, thanks.",
      sent: "Yes, that works for me.",
      accepted: false,
      subject: "Re: Timeline",
      priority: "HIGH",
      senderAddress: "alice@example.com",
    });
  });

  it("keeps the reply when its summary has been cleaned up", async () => {
    // Cleanup drops old summaries. The evidence that the user sent that reply
    // survives, and losing it would quietly shrink the sample an analysis is
    // built from — the user never replied less, the data was just deleted.
    mockReplyFeedbackFindMany.mockResolvedValue([feedbackRow()]);
    mockSummaryFindMany.mockResolvedValue([]);

    const samples = await getRepliesForStyleAnalysis("user-1");

    expect(samples).toHaveLength(1);
    expect(samples[0].subject).toBeNull();
    expect(samples[0].priority).toBeNull();
    expect(samples[0].sent).toBe("Yes, that works for me.");
  });

  it("carries the accepted flag through", async () => {
    mockReplyFeedbackFindMany.mockResolvedValue([
      feedbackRow({ accepted: true, finalReply: "Sounds good, thanks." }),
    ]);

    const samples = await getRepliesForStyleAnalysis("user-1");

    expect(samples[0].accepted).toBe(true);
  });

  it("scopes the query to the requesting user", async () => {
    await getRepliesForStyleAnalysis("user-2");
    expect(mockReplyFeedbackFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-2",
    });
  });

  it("reads the newest replies first, within a bounded window", async () => {
    await getRepliesForStyleAnalysis("user-1");

    const query = mockReplyFeedbackFindMany.mock.calls[0][0];
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.take).toBe(60);
  });

  it("clamps a caller-supplied take", async () => {
    await getRepliesForStyleAnalysis("user-1", 10_000);
    expect(mockReplyFeedbackFindMany.mock.calls[0][0].take).toBe(200);

    await getRepliesForStyleAnalysis("user-1", 0);
    expect(mockReplyFeedbackFindMany.mock.calls[1][0].take).toBe(1);
  });

  it("does not run the second query when there is no feedback at all", async () => {
    await getRepliesForStyleAnalysis("user-1");

    expect(mockSummaryFindMany).not.toHaveBeenCalled();
  });
});
