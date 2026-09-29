import { describe, it, expect } from "vitest";

import {
  buildSenderHistory,
  describeSenderHistory,
  type SenderHistoryRow,
} from "../sender-history";

function row(
  senderAddress: string | null,
  priority: SenderHistoryRow["priority"],
  status: SenderHistoryRow["status"],
  count: number,
): SenderHistoryRow {
  return { senderAddress, priority, status, _count: { _all: count } };
}

describe("buildSenderHistory", () => {
  it("adds up priority and dismissal counts per sender", () => {
    const history = buildSenderHistory(
      [
        row("alice@example.com", "HIGH", "PENDING", 2),
        row("alice@example.com", "LOW", "DISMISSED", 6),
        row("alice@example.com", "LOW", "SENT", 1),
      ],
      [],
    );

    expect(history.get("alice@example.com")).toMatchObject({
      total: 9,
      high: 2,
      medium: 0,
      low: 7,
      dismissed: 6,
    });
  });

  it("keeps senders separate", () => {
    const history = buildSenderHistory(
      [
        row("alice@example.com", "LOW", "PENDING", 1),
        row("bob@example.com", "HIGH", "PENDING", 4),
      ],
      [],
    );

    expect(history.get("alice@example.com")?.total).toBe(1);
    expect(history.get("bob@example.com")?.total).toBe(4);
  });

  it("ignores rows written before senderAddress existed", () => {
    const history = buildSenderHistory(
      [row(null, "HIGH", "PENDING", 3)],
      [],
    );

    expect(history.size).toBe(0);
  });

  it("carries the low-dismissal signal from SenderPreference", () => {
    const history = buildSenderHistory(
      [row("news@example.com", "LOW", "DISMISSED", 5)],
      [{ senderAddress: "news@example.com", lowDismissals: 5 }],
    );

    expect(history.get("news@example.com")?.lowDismissals).toBe(5);
  });

  it("drops a sender whose only trace is an all-zero preference row", () => {
    const history = buildSenderHistory(
      [],
      [{ senderAddress: "ghost@example.com", lowDismissals: 0 }],
    );

    expect(history.has("ghost@example.com")).toBe(false);
  });
});

describe("describeSenderHistory", () => {
  it("reads as a pattern about the user's past behaviour", () => {
    const history = buildSenderHistory(
      [
        row("alice@example.com", "LOW", "PENDING", 2),
        row("alice@example.com", "MEDIUM", "PENDING", 1),
        row("alice@example.com", "HIGH", "PENDING", 1),
        row("alice@example.com", "LOW", "DISMISSED", 5),
      ],
      [],
    );

    expect(describeSenderHistory(history.get("alice@example.com")!)).toBe(
      "Sender history: this user has classified 9 past emails from this sender as 7 LOW, 1 MEDIUM, 1 HIGH, and dismissed 5 of them.",
    );
  });

  it("says '1 past email' in the singular", () => {
    const history = buildSenderHistory(
      [row("solo@example.com", "HIGH", "PENDING", 1)],
      [],
    );

    expect(describeSenderHistory(history.get("solo@example.com")!)).toBe(
      "Sender history: this user has classified 1 past email from this sender as 0 LOW, 0 MEDIUM, 1 HIGH.",
    );
  });
});
