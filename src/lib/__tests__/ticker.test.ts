import { describe, it, expect } from "vitest";

import {
  buildTickerItems,
  MAX_TICKER_ITEMS,
  type TickerInput,
} from "../ticker";

const empty: TickerInput = {
  meetings: [],
  snoozes: [],
  replies: [],
  emails: [],
};

const time = (value: Date) => `${value.getUTCHours()}:00`;

describe("buildTickerItems", () => {
  it("returns nothing when there is no activity", () => {
    expect(buildTickerItems(empty, time)).toEqual([]);
  });

  it("gives each kind its own label", () => {
    const items = buildTickerItems(
      {
        meetings: [
          {
            eventId: "e1",
            title: "Standup",
            startTime: new Date("2026-01-01T09:00:00Z"),
          },
        ],
        snoozes: [{ id: "s1", subject: "Invoice", snoozedUntil: new Date() }],
        replies: [{ id: "r1", subject: "Contract", sentAt: new Date() }],
        emails: [{ id: "m1", subject: "Q3 budget", priority: "HIGH" }],
      },
      time,
    );

    expect(items.map((item) => item.text)).toEqual([
      "Meeting 9:00 · Standup",
      "Reminder due · Invoice",
      "Replied · Contract",
      "Needs a reply · Q3 budget",
    ]);
  });

  it("labels every priority", () => {
    const items = buildTickerItems(
      {
        ...empty,
        emails: [
          { id: "a", subject: "A", priority: "HIGH" },
          { id: "b", subject: "B", priority: "MEDIUM" },
          { id: "c", subject: "C", priority: "LOW" },
        ],
      },
      time,
    );

    expect(items.map((item) => item.text)).toEqual([
      "Needs a reply · A",
      "Worth a glance · B",
      "FYI · C",
    ]);
  });

  it("caps the list at MAX_TICKER_ITEMS", () => {
    const emails = Array.from({ length: 20 }, (_, index) => ({
      id: `m${index}`,
      subject: `S${index}`,
      priority: "LOW" as const,
    }));

    expect(buildTickerItems({ ...empty, emails }, time)).toHaveLength(
      MAX_TICKER_ITEMS,
    );
  });

  it("keeps ids unique across kinds", () => {
    const items = buildTickerItems(
      {
        ...empty,
        replies: [{ id: "x", subject: "R", sentAt: new Date() }],
        emails: [{ id: "x", subject: "E", priority: "LOW" }],
      },
      time,
    );

    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });
});
