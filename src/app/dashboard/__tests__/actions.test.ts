import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockEmailSummaryFindFirst,
  mockEmailSummaryUpdate,
  mockJobFailureCreate,
  mockRequireUser,
  mockGetEmailProvider,
  mockSendReply,
  mockQueueAdd,
  mockQueueRemove,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const queue = { add: vi.fn(), remove: vi.fn() };
  queue.add.mockResolvedValue({ id: "job" });
  queue.remove.mockResolvedValue(undefined);

  return {
    mockEmailSummaryFindFirst: vi.fn(),
    mockEmailSummaryUpdate: vi.fn().mockResolvedValue({}),
    mockJobFailureCreate: vi.fn().mockResolvedValue({}),
    mockRequireUser: vi.fn(),
    mockGetEmailProvider: vi.fn(),
    mockSendReply: vi.fn().mockResolvedValue(undefined),
    mockQueueAdd: queue.add,
    mockQueueRemove: queue.remove,
    mockRevalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/prisma.server", () => ({
  get prisma() {
    return {
      emailSummary: {
        findFirst: mockEmailSummaryFindFirst,
        update: mockEmailSummaryUpdate,
      },
      jobFailure: { create: mockJobFailureCreate },
    };
  },
}));

vi.mock("@/lib/current-session.server", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/services/email-provider.server", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

vi.mock("@/services/queue.server", () => ({
  getEmailReminderQueue: () => ({
    add: mockQueueAdd,
    remove: mockQueueRemove,
  }),
  getMorningDigestQueue: () => ({
    add: mockQueueAdd,
  }),
}));

import {
  sendReplyAction,
  dismissAction,
  snoozeAction,
  refreshDigestAction,
} from "../actions";

const OWNED = {
  id: "summary-1",
  gmailMessageId: "msg-1",
  userId: "user-1",
  sender: "alice@example.com",
  subject: "Test Subject",
};

describe("dashboard server actions", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset: true, which strips implementations
    // between tests, so every default has to be re-armed here.
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetEmailProvider.mockResolvedValue({ sendReply: mockSendReply });
    mockEmailSummaryUpdate.mockResolvedValue({});
    mockJobFailureCreate.mockResolvedValue({});
    mockQueueAdd.mockResolvedValue({ id: "job" });
    mockQueueRemove.mockResolvedValue(undefined);
  });

  describe("ownership (IDOR regression)", () => {
    it("scopes the summary lookup to the caller's userId", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      await dismissAction("msg-1");

      expect(mockEmailSummaryFindFirst).toHaveBeenCalledWith({
        where: { gmailMessageId: "msg-1", userId: "user-1" },
      });
    });

    it("refuses to send a reply to another user's email", async () => {
      // The scoped lookup returns null for a row owned by someone else.
      mockEmailSummaryFindFirst.mockResolvedValue(null);

      const result = await sendReplyAction("someone-elses-msg", "hello");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Summary not found");
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(mockEmailSummaryUpdate).not.toHaveBeenCalled();
    });

    it("refuses to dismiss another user's email", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(null);

      const result = await dismissAction("someone-elses-msg");

      expect(result.ok).toBe(false);
      expect(mockEmailSummaryUpdate).not.toHaveBeenCalled();
    });

    it("refuses to snooze another user's email", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(null);

      const result = await snoozeAction(
        "someone-elses-msg",
        new Date(Date.now() + 60_000).toISOString(),
      );

      expect(result.ok).toBe(false);
      expect(mockEmailSummaryUpdate).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("rejects an absurdly long email id without querying", async () => {
      const result = await dismissAction("x".repeat(513));

      expect(result.ok).toBe(false);
      expect(mockEmailSummaryFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("sendReplyAction", () => {
    it("marks the summary SENT after a successful send", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      const result = await sendReplyAction("msg-1", "My reply");

      expect(result.ok).toBe(true);
      expect(mockSendReply).toHaveBeenCalledWith(
        "user-1",
        "msg-1",
        "My reply",
      );
      // Providers no longer write this themselves, so Microsoft replies are
      // marked too.
      expect(mockEmailSummaryUpdate).toHaveBeenCalledWith({
        where: { id: "summary-1" },
        data: { status: "SENT" },
      });
    });

    it("does not mark SENT when the provider throws", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);
      mockSendReply.mockRejectedValue(new Error("Gmail API error: 403"));

      const result = await sendReplyAction("msg-1", "My reply");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Gmail API error");
      expect(mockEmailSummaryUpdate).not.toHaveBeenCalled();
    });

    it("rejects an empty reply", async () => {
      const result = await sendReplyAction("msg-1", "   ");

      expect(result.ok).toBe(false);
      expect(mockEmailSummaryFindFirst).not.toHaveBeenCalled();
    });

    it("rejects an oversized reply", async () => {
      const result = await sendReplyAction("msg-1", "x".repeat(20_001));

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Reply is too long to send.");
      expect(mockEmailSummaryFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("dismissAction", () => {
    it("clears any pending snooze alongside the dismissal", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      await dismissAction("msg-1");

      expect(mockEmailSummaryUpdate).toHaveBeenCalledWith({
        where: { id: "summary-1" },
        data: { status: "DISMISSED", snoozedUntil: null },
      });
    });
  });

  describe("snoozeAction", () => {
    it("defers the email and enqueues a reminder", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);
      const target = new Date(Date.now() + 60 * 60 * 1000);

      const result = await snoozeAction("msg-1", target.toISOString());

      expect(result.ok).toBe(true);
      expect(mockEmailSummaryUpdate).toHaveBeenCalledWith({
        where: { id: "summary-1" },
        data: { status: "SNOOZED", snoozedUntil: new Date(target.toISOString()) },
      });

      const [jobId, payload, opts] = mockQueueAdd.mock.calls[0];
      expect(jobId).toBe("snooze-msg-1");
      expect(opts.jobId).toBe("snooze-msg-1");
      expect(opts.delay).toBeGreaterThan(0);
      expect(payload).toMatchObject({
        emailId: "msg-1",
        userId: "user-1",
        subject: "Test Subject",
        sender: "alice@example.com",
      });
    });

    it("replaces an existing reminder job so the timer actually moves", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      await snoozeAction("msg-1", new Date(Date.now() + 60_000).toISOString());

      expect(mockQueueRemove).toHaveBeenCalledWith("snooze-msg-1");
    });

    it("rejects a snooze in the past", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      const result = await snoozeAction(
        "msg-1",
        new Date(Date.now() - 60_000).toISOString(),
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Invalid snooze time");
      expect(mockEmailSummaryUpdate).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("rejects an unparseable snooze time", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      const result = await snoozeAction("msg-1", "next tuesday-ish");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Invalid snooze time");
    });

    it("rejects a snooze beyond 30 days", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      const result = await snoozeAction(
        "msg-1",
        new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("30 days");
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("cancels the snooze when passed null", async () => {
      mockEmailSummaryFindFirst.mockResolvedValue(OWNED);

      const result = await snoozeAction("msg-1", null);

      expect(result.ok).toBe(true);
      expect(mockEmailSummaryUpdate).toHaveBeenCalledWith({
        where: { id: "summary-1" },
        data: { status: "PENDING", snoozedUntil: null },
      });
      expect(mockQueueRemove).toHaveBeenCalledWith("snooze-msg-1");
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("refreshDigestAction", () => {
    it("enqueues a digest job for the caller", async () => {
      const result = await refreshDigestAction();

      expect(result.ok).toBe(true);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "manual-digest-user-1",
        { userId: "user-1" },
        expect.objectContaining({ jobId: "manual-digest-user-1" }),
      );
    });

    it("records a JobFailure when the queue rejects", async () => {
      mockQueueAdd.mockRejectedValue(new Error("redis down"));

      const result = await refreshDigestAction();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("redis down");
      expect(mockJobFailureCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          jobType: "morning-digest",
          step: "queue",
          errorMessage: "redis down",
        }),
      });
    });
  });
});
