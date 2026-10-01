import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockDeleteMany,
  mockCreateMany,
  mockFindMany,
  mockFindFirst,
  mockTransaction,
} = vi.hoisted(() => ({
  mockDeleteMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
}));

const { mockLoadTodaysEvents } = vi.hoisted(() => ({
  mockLoadTodaysEvents: vi.fn(),
}));

vi.mock("../calendar.server", () => ({
  loadTodaysEvents: mockLoadTodaysEvents,
}));

vi.mock("../../lib/prisma.server", () => ({
  prisma: {
    meetingReminder: {
      deleteMany: mockDeleteMany,
      createMany: mockCreateMany,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
    },
    // The swap has to be all-or-nothing, so the callback form is used rather
    // than two independent calls that could interleave with a concurrent
    // refresh and leave the day empty.
    $transaction: mockTransaction,
  },
}));

import {
  areMeetingsStale,
  getCachedTodaysMeetings,
  refreshTodaysMeetings,
} from "../meetings.server";

const event = (eventId: string, hour: number) => ({
  eventId,
  title: `Standup ${eventId}`,
  startTime: new Date(new Date().setHours(hour, 0, 0, 0)),
});

describe("refreshTodaysMeetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockCreateMany.mockResolvedValue({ count: 1 });
    // Runs the callback against a stand-in for the transaction client, so the
    // inner calls are the same spies and assertions still see the work.
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        meetingReminder: {
          deleteMany: mockDeleteMany,
          createMany: mockCreateMany,
        },
      }),
    );
    mockLoadTodaysEvents.mockResolvedValue([event("e1", 10)]);
  });

  it("writes the day's events", async () => {
    const result = await refreshTodaysMeetings("user-1");

    expect(result).toEqual({ saved: 1 });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-1",
          calendarEventId: "e1",
          title: "Standup e1",
          meetingTime: expect.any(Date),
        },
      ],
      skipDuplicates: true,
    });
  });

  it("still clears a cancelled meeting when the day comes back empty", async () => {
    mockLoadTodaysEvents.mockResolvedValue([]);

    const result = await refreshTodaysMeetings("user-1");

    // Deleting on an empty result is the point: otherwise a cancelled meeting
    // sits on the dashboard until its own start time passes.
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: 0, reason: "no calendar or no events today" });
  });

  it("leaves the cache alone when the provider fails", async () => {
    mockLoadTodaysEvents.mockRejectedValue(new Error("Calendar timed out"));

    await expect(refreshTodaysMeetings("user-1")).rejects.toThrow("Calendar timed out");

    // The bug this guards: clearing before fetching meant a transient provider
    // fault wiped a correct panel, and the next fill was up to two hours away.
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("swaps the day inside a transaction", async () => {
    await refreshTodaysMeetings("user-1");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a recurring event expanded twice", async () => {
    mockLoadTodaysEvents.mockResolvedValue([event("e1", 10), event("e1", 10), event("e2", 14)]);

    const result = await refreshTodaysMeetings("user-1");

    expect(result).toEqual({ saved: 2 });
    expect(mockCreateMany.mock.calls[0][0].data).toHaveLength(2);
  });
});

describe("getCachedTodaysMeetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it("reads the table and never calls Calendar", async () => {
    mockFindMany.mockResolvedValue([
      {
        calendarEventId: "e1",
        title: "Standup",
        meetingTime: new Date("2026-09-29T10:00:00Z"),
      },
    ]);

    const rows = await getCachedTodaysMeetings("user-1");

    expect(rows).toEqual([
      { eventId: "e1", title: "Standup", startTime: new Date("2026-09-29T10:00:00Z") },
    ]);
    expect(mockLoadTodaysEvents).not.toHaveBeenCalled();
  });

  it("orders the day by start time", async () => {
    await getCachedTodaysMeetings("user-1");

    expect(mockFindMany.mock.calls[0][0].orderBy).toEqual({ meetingTime: "asc" });
  });
});

describe("areMeetingsStale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is false for a cache written moments ago", async () => {
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60_000) });

    await expect(areMeetingsStale("user-1")).resolves.toBe(false);
  });

  it("is true for a cache older than the window", async () => {
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });

    await expect(areMeetingsStale("user-1")).resolves.toBe(true);
  });

  it("ages from when the data was written, not from when the meeting is", async () => {
    // The bug this guards: staleness was computed from `meetingTime`, so a
    // meeting later today made the difference negative and the cache read as
    // permanently fresh — the common case, which is to say the check almost
    // never fired. The query must order by and select `createdAt`.
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60_000) });

    await areMeetingsStale("user-1");

    expect(mockFindFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
    expect(mockFindFirst.mock.calls[0][0].select).toEqual({ createdAt: true });
  });

  it("is false when there is no data to age", async () => {
    mockFindFirst.mockResolvedValue(null);

    // A refresh that legitimately returns nothing writes no row, so there would
    // never be one to age. Treating this as stale would cost a Calendar call on
    // every sign-in, forever, for a user with an empty calendar.
    await expect(areMeetingsStale("user-1")).resolves.toBe(false);
  });
});
