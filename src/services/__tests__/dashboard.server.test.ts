import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockJobFailureFindMany, mockJobFailureFindFirst } = vi.hoisted(() => ({
  mockJobFailureFindMany: vi.fn(),
  mockJobFailureFindFirst: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      jobFailure: {
        findMany: mockJobFailureFindMany,
        findFirst: mockJobFailureFindFirst,
      },
    };
  },
}));

import {
  getJobFailures,
  getLatestSummarizationFailure,
} from "../dashboard.server";

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
