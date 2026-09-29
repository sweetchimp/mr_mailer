import { describe, it, expect } from "vitest";

import {
  averageResponseTime,
  formatDuration,
  renderWeeklySummaryText,
  WEEKLY_SUBJECT,
  type WeeklyStats,
} from "../weekly-digest";

const BASE: WeeklyStats = {
  windowStart: "2026-09-21T18:00:00.000Z",
  windowEnd: "2026-09-28T18:00:00.000Z",
  replied: 12,
  dismissed: 34,
  pendingHigh: 3,
  pendingMedium: 8,
  pendingLow: 21,
  snoozed: 4,
  avgTimeToReplyMs: 15_120_000,
  replySamples: 12,
};

describe("averageResponseTime", () => {
  it("returns null rather than zero when nothing was replied to", () => {
    // "You replied instantly" and "we have no data" are different claims.
    expect(
      averageResponseTime([{ createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: null }]),
    ).toEqual({ avgTimeToReplyMs: null, replySamples: 0 });
  });

  it("averages the deltas across every reply in the window", () => {
    const result = averageResponseTime([
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:01:00Z") },
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:03:00Z") },
    ]);

    expect(result).toEqual({ avgTimeToReplyMs: 120_000, replySamples: 2 });
  });

  it("handles a single sample", () => {
    expect(
      averageResponseTime([
        { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:00:30Z") },
      ]),
    ).toEqual({ avgTimeToReplyMs: 30_000, replySamples: 1 });
  });

  it("skips a row whose sentAt precedes createdAt", () => {
    // Clock skew or a re-summarized row. Counting it would register as an
    // instant reply and drag the average down.
    const result = averageResponseTime([
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T09:00:00Z") },
      { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:01:00Z") },
    ]);

    expect(result).toEqual({ avgTimeToReplyMs: 60_000, replySamples: 1 });
  });

  it("returns null when every row is unusable", () => {
    expect(
      averageResponseTime([
        { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: null },
        { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T09:00:00Z") },
      ]),
    ).toEqual({ avgTimeToReplyMs: null, replySamples: 0 });
  });

  it("counts a zero-length reply as a valid sample", () => {
    expect(
      averageResponseTime([
        { createdAt: new Date("2026-09-28T10:00:00Z"), sentAt: new Date("2026-09-28T10:00:00Z") },
      ]),
    ).toEqual({ avgTimeToReplyMs: 0, replySamples: 1 });
  });
});

describe("formatDuration", () => {
  it("renders sub-hour spans in minutes", () => {
    expect(formatDuration(38 * 60_000)).toBe("38m");
  });

  it("drops a zero minute remainder", () => {
    expect(formatDuration(4 * 3_600_000)).toBe("4h");
  });

  it("splits hours and minutes", () => {
    expect(formatDuration((4 * 3_600_000) + (12 * 60_000))).toBe("4h 12m");
  });

  it("switches to days past 24 hours", () => {
    expect(formatDuration((2 * 86_400_000) + (3 * 3_600_000))).toBe("2d 3h");
  });

  it("rounds to whole minutes", () => {
    expect(formatDuration(90_000)).toBe("2m");
  });
});

describe("renderWeeklySummaryText", () => {
  it("carries every headline number into the body", () => {
    const body = renderWeeklySummaryText(BASE, "Ada");

    expect(body).toContain("Hi Ada — here's your week.");
    expect(body).toContain("12 replies sent");
    expect(body).toContain("34 emails dismissed");
    expect(body).toContain("3 emails needing a reply");
    expect(body).toContain("8 emails worth a glance");
    expect(body).toContain("21 emails for your eyes only");
    expect(body).toContain("4 emails snoozed");
    expect(body).toContain("4h 12m on average across 12 replies");
  });

  it("agrees with the counts on every plural", () => {
    const body = renderWeeklySummaryText(
      { ...BASE, replied: 1, dismissed: 1, pendingHigh: 1, pendingMedium: 1, pendingLow: 1, snoozed: 1 },
      null,
    );

    expect(body).toContain("1 reply sent");
    expect(body).toContain("1 email dismissed");
    expect(body).toContain("1 email needing a reply");
    expect(body).toContain("1 email snoozed");
  });

  it("falls back to a nameless greeting", () => {
    expect(renderWeeklySummaryText(BASE)).toContain("Here's your week.");
  });

  it("explains the missing average instead of rendering a zero", () => {
    const body = renderWeeklySummaryText(
      { ...BASE, avgTimeToReplyMs: null, replySamples: 0 },
      "Ada",
    );

    expect(body).toContain("Not enough data yet");
    expect(body).not.toContain("0m");
  });

  it("points at the page for the same numbers", () => {
    expect(renderWeeklySummaryText(BASE)).toContain("/weekly-summary");
  });

  it("has a stable subject for the mail", () => {
    expect(WEEKLY_SUBJECT).toBe("Your week in the inbox");
  });
});
