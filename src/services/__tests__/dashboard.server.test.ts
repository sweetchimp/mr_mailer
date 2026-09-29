import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockJobFailureFindMany,
  mockJobFailureFindFirst,
  mockEmailSummaryFindMany,
  mockEmailSummaryCount,
} = vi.hoisted(() => ({
  mockJobFailureFindMany: vi.fn(),
  mockJobFailureFindFirst: vi.fn(),
  mockEmailSummaryFindMany: vi.fn(),
  mockEmailSummaryCount: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      jobFailure: {
        findMany: mockJobFailureFindMany,
        findFirst: mockJobFailureFindFirst,
      },
      emailSummary: {
        findMany: mockEmailSummaryFindMany,
        count: mockEmailSummaryCount,
      },
    };
  },
}));

import {
  getAverageReplyTime,
  getHistoryEmails,
  getJobFailures,
  getLatestSummarizationFailure,
  getTickerItems,
  getTodaysHandledCounts,
} from "../dashboard.server";

const ARCHIVE_ROW = {
  gmailMessageId: "msg-1",
  subject: "Q3 budget review",
  sender: "Dana <dana@example.com>",
  summaryText: "Asks for the revised budget numbers.",
  status: "SENT",
  createdAt: new Date("2026-09-20T09:00:00Z"),
};

describe("getHistoryEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailSummaryFindMany.mockResolvedValue([]);
  });

  it("returns unsearched history newest first, capped at the list size", async () => {
    mockEmailSummaryFindMany.mockResolvedValue([ARCHIVE_ROW]);

    const rows = await getHistoryEmails("user-1", "history");

    expect(mockEmailSummaryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: { in: ["SENT", "DISMISSED"] } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    );
    expect(rows).toEqual([
      {
        id: "msg-1",
        subject: "Q3 budget review",
        sender: "Dana <dana@example.com>",
        status: "SENT",
        date: "2026-09-20T09:00:00.000Z",
        summary: "Asks for the revised budget numbers.",
      },
    ]);
  });

  it("adds no OR clause when there is no query", async () => {
    // A `contains: ""` would silently match every row, which reads like the
    // filter is active when it is not.
    await getHistoryEmails("user-1", "history", null);

    const { where } = mockEmailSummaryFindMany.mock.calls[0][0];
    expect(where.OR).toBeUndefined();
  });

  it("treats a whitespace-only query as no query", async () => {
    await getHistoryEmails("user-1", "history", "   ");

    const { where } = mockEmailSummaryFindMany.mock.calls[0][0];
    expect(where.OR).toBeUndefined();
  });

  it("matches subject, sender, and summary in one OR", async () => {
    await getHistoryEmails("user-1", "history", "budget");

    const { where } = mockEmailSummaryFindMany.mock.calls[0][0];
    expect(where.OR).toEqual([
      { subject: { contains: "budget" } },
      { sender: { contains: "budget" } },
      { summaryText: { contains: "budget" } },
    ]);
  });

  it("keeps the user scope and status filter alongside the search", async () => {
    await getHistoryEmails("user-1", "history", "budget");

    const { where } = mockEmailSummaryFindMany.mock.calls[0][0];
    expect(where.userId).toBe("user-1");
    expect(where.status).toEqual({ in: ["SENT", "DISMISSED"] });
  });

  it("searches replied with a SENT-only filter", async () => {
    await getHistoryEmails("user-1", "replied", "budget");

    const { where } = mockEmailSummaryFindMany.mock.calls[0][0];
    expect(where.status).toBe("SENT");
    expect(where.OR).toHaveLength(3);
  });

  it("never widens the scope to another user's archive", async () => {
    await getHistoryEmails("user-2", "history", "budget");

    expect(mockEmailSummaryFindMany.mock.calls[0][0].where.userId).toBe("user-2");
  });
});

describe("getJobFailures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobFailureFindMany.mockResolvedValue([]);
  });

  it("returns recorded failures newest first", async () => {
    mockJobFailureFindMany.mockResolvedValue([
      {
        id: "f-2",
        jobType: "email-reminder",
        step: "unsnooze",
        errorMessage: "deadlock",
        context: '{"jobId":"7"}',
        createdAt: new Date("2026-09-28T10:00:00Z"),
      },
      {
        id: "f-1",
        jobType: "morning-digest",
        step: "ai-summarization",
        errorMessage: "401 Invalid API Key",
        context: null,
        createdAt: new Date("2026-09-27T09:00:00Z"),
      },
    ]);

    const rows = await getJobFailures("user-1");

    expect(mockJobFailureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["f-2", "f-1"]);
    expect(rows[0].createdAt).toBe("2026-09-28T10:00:00.000Z");
    expect(rows[0].context).toBe('{"jobId":"7"}');
  });

  // Failures are per-user; a job payload or query must not leak across accounts.
  it("scopes the query to the requesting user", async () => {
    await getJobFailures("user-2");
    expect(mockJobFailureFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-2",
    });
  });

  it("caps the result set so an outage cannot produce an unbounded page", async () => {
    await getJobFailures("user-1");
    expect(mockJobFailureFindMany.mock.calls[0][0].take).toBe(100);
  });
});

describe("getLatestSummarizationFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobFailureFindFirst.mockResolvedValue(null);
  });

  // The regression: this returned the most recent failure ever, so a single
  // outage kept presenting itself as current — "press Refresh to retry" days
  // after the key was fixed, and every time an otherwise-normal empty inbox
  // matched the zero-bucket condition.
  it("ignores failures older than the reporting window", async () => {
    await getLatestSummarizationFailure("user-1");

    const where = mockJobFailureFindFirst.mock.calls[0][0].where;
    expect(where.step).toBe("ai-summarization");
    expect(where.createdAt.gte).toBeInstanceOf(Date);

    const ageHours =
      (Date.now() - where.createdAt.gte.getTime()) / 3_600_000;
    expect(ageHours).toBeGreaterThan(23.9);
    expect(ageHours).toBeLessThan(24.1);
  });
});

describe("getTodaysHandledCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailSummaryCount.mockResolvedValue(0);
  });

  it("counts today's arrivals and the ones replied to or dismissed", async () => {
    mockEmailSummaryCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    const result = await getTodaysHandledCounts("user-1");

    expect(result).toEqual({ handled: 2, total: 5 });
  });

  it("windows both counts from the start of the local day", async () => {
    await getTodaysHandledCounts("user-1");

    for (const call of mockEmailSummaryCount.mock.calls) {
      const where = call[0].where;
      expect(where.userId).toBe("user-1");
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.gte.getHours()).toBe(0);
      expect(where.createdAt.gte.getMinutes()).toBe(0);
    }

    expect(mockEmailSummaryCount.mock.calls[1][0].where.status).toEqual({
      in: ["SENT", "DISMISSED"],
    });
  });
});

describe("getAverageReplyTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailSummaryFindMany.mockResolvedValue([]);
  });

  it("formats the mean latency of replies that have a sentAt", async () => {
    mockEmailSummaryFindMany.mockResolvedValue([
      {
        createdAt: new Date("2026-09-20T09:00:00Z"),
        sentAt: new Date("2026-09-20T11:00:00Z"),
      },
    ]);

    const result = await getAverageReplyTime("user-1");

    expect(result).toEqual({ label: "2h", samples: 1 });
    expect(mockEmailSummaryFindMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      sentAt: { not: null },
    });
  });

  it("reports no label rather than 0m when there are no replies", async () => {
    const result = await getAverageReplyTime("user-1");
    expect(result).toEqual({ label: null, samples: 0 });
  });
});

describe("getTickerItems", () => {
  const meetingStart = new Date("2026-01-01T09:30:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailSummaryFindMany.mockResolvedValue([]);
  });

  it("interleaves meetings, due snoozes, replies and new mail", async () => {
    mockEmailSummaryFindMany
      .mockResolvedValueOnce([
        {
          gmailMessageId: "m-low",
          subject: "Q3 budget",
          priority: "LOW",
          createdAt: new Date("2026-01-01T10:00:00Z"),
        },
        {
          gmailMessageId: "m-high",
          subject: "Contract",
          priority: "HIGH",
          createdAt: new Date("2026-01-01T09:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          gmailMessageId: "r1",
          subject: "Invoice",
          sentAt: new Date("2026-01-01T08:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          gmailMessageId: "s1",
          subject: "Renewal",
          snoozedUntil: new Date("2026-01-01T07:00:00Z"),
        },
      ]);

    const items = await getTickerItems("user-1", [
      { eventId: "e1", title: "Standup", startTime: meetingStart },
    ]);

    expect(items.map((item) => item.text)).toEqual([
      expect.stringMatching(/^Meeting .+ · Standup$/),
      "Reminder due · Renewal",
      "Replied · Invoice",
      // HIGH is surfaced ahead of LOW even though LOW arrived later.
      "Needs a reply · Contract",
      "FYI · Q3 budget",
    ]);
  });

  it("only surfaces snoozes whose reminder is already due", async () => {
    await getTickerItems("user-1", []);

    const snoozeCall = mockEmailSummaryFindMany.mock.calls[2][0];
    expect(snoozeCall.where).toEqual({
      userId: "user-1",
      status: "SNOOZED",
      snoozedUntil: { lte: expect.any(Date) },
    });
  });

  it("scopes every query to the requesting user", async () => {
    await getTickerItems("user-2", []);

    for (const call of mockEmailSummaryFindMany.mock.calls) {
      expect(call[0].where.userId).toBe("user-2");
    }
  });
});
