import { describe, it, expect } from "vitest";
import {
  startOfLocalDay,
  currentDayWindow,
  isWithinWindow,
  toGmailDate,
  formatLocalTime,
  DISPLAY_TIMEZONE,
} from "../date.server";

/**
 * Every case is built from local-time components, so the assertions hold
 * regardless of the machine's timezone — that is the whole point of the
 * "local calendar day" contract.
 */
const reference = new Date(2026, 8, 28, 14, 30, 15, 250); // 28 Sep 2026, 14:30 local

describe("startOfLocalDay", () => {
  it("returns local midnight on the same calendar day", () => {
    const start = startOfLocalDay(reference);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(28);
  });

  it("does not mutate its argument", () => {
    const before = reference.getTime();
    startOfLocalDay(reference);
    expect(reference.getTime()).toBe(before);
  });

  it("handles the first minute of the month", () => {
    const start = startOfLocalDay(new Date(2026, 8, 1, 0, 5, 0));
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});

describe("currentDayWindow", () => {
  it("spans from local midnight to now", () => {
    const before = Date.now();
    const window = currentDayWindow();
    const after = Date.now();

    expect(window.start.getTime()).toBe(startOfLocalDay(window.start).getTime());
    expect(window.end.getTime()).toBeGreaterThanOrEqual(before);
    expect(window.end.getTime()).toBeLessThanOrEqual(after + 1);
  });
});

describe("isWithinWindow", () => {
  const window = { start: startOfLocalDay(reference), end: reference };

  it("accepts the start boundary", () => {
    expect(isWithinWindow(new Date(window.start), window)).toBe(true);
  });

  it("accepts the end boundary", () => {
    expect(isWithinWindow(new Date(window.end), window)).toBe(true);
  });

  it("rejects anything before local midnight", () => {
    const yesterday = new Date(window.start.getTime() - 1000);
    expect(isWithinWindow(yesterday, window)).toBe(false);
  });

  it("rejects anything after now", () => {
    const later = new Date(window.end.getTime() + 1000);
    expect(isWithinWindow(later, window)).toBe(false);
  });

  it("rejects the very start of yesterday", () => {
    expect(isWithinWindow(startOfLocalDay(new Date(2026, 8, 27)), window)).toBe(false);
  });
});

describe("toGmailDate", () => {
  it("formats as YYYY/MM/DD with zero padding", () => {
    expect(toGmailDate(new Date(2026, 8, 5))).toBe("2026/09/05");
  });

  it("pads single-digit months and days", () => {
    expect(toGmailDate(new Date(2026, 0, 9))).toBe("2026/01/09");
  });

  it("uses the local calendar day, not UTC", () => {
    // 1 Jan local, which in any timezone east of UTC is 31 Dec in UTC. This is
    // exactly the mismatch that makes a bare Gmail `after:` date unreliable.
    const localNewYear = new Date(2026, 0, 1, 12, 0, 0);
    expect(toGmailDate(localNewYear)).toBe("2026/01/01");
  });
});

describe("formatLocalTime", () => {
  // A real start time from the connected Google calendar, which reports event
  // times as absolute instants carrying the event's own offset.
  const internSession = "2026-08-03T12:30:00+03:00";

  it("renders the event's wall-clock time, not the UTC equivalent", () => {
    const expected = new Date(internSession).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: DISPLAY_TIMEZONE,
    });
    expect(formatLocalTime(internSession)).toBe(expected);
  });

  // The regression: this rendered with `timeZone: "UTC"`, so a 12:30+03:00
  // meeting was displayed as 09:30 — three hours early on every meeting row.
  it("does not shift the time into UTC", () => {
    const asUtc = new Date(internSession).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const local = formatLocalTime(internSession);

    // Only assert they differ when the host is genuinely not on UTC; on a UTC
    // host both are correct and the assertion would be meaningless.
    if (DISPLAY_TIMEZONE !== "UTC") expect(local).not.toBe(asUtc);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(formatLocalTime(new Date(internSession))).toBe(
      formatLocalTime(internSession),
    );
  });
});
