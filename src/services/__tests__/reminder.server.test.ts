import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpdateMany } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      emailSummary: { updateMany: mockUpdateMany },
    };
  },
}));

import { unsnoozeEmail } from "../reminder.server";

describe("unsnoozeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns a snoozed email to PENDING and clears the timer", async () => {
    await expect(unsnoozeEmail("user-1", "msg-1")).resolves.toEqual({
      unsnoozed: true,
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", gmailMessageId: "msg-1", status: "SNOOZED" },
      data: { status: "PENDING", snoozedUntil: null },
    });
  });

  // The regression this guards: a delayed reminder can outlive the snooze it was
  // created for. Dismissing from the Snoozed bucket leaves the job queued, and
  // an unconditional update would resurrect the email as PENDING, silently
  // undoing the user's decision.
  it("constrains the update to rows still snoozed, so a stale job cannot resurrect a dismissed email", async () => {
    // count 0 is what MySQL reports when the status no longer matches.
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(unsnoozeEmail("user-1", "msg-1")).resolves.toEqual({
      unsnoozed: false,
    });

    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({
      status: "SNOOZED",
    });
  });

  // A job payload must never be able to reach another account's row.
  it("scopes the lookup to the owning user", async () => {
    await unsnoozeEmail("user-1", "msg-1");

    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({
      userId: "user-1",
    });
  });

  it("is idempotent when the same reminder is delivered twice", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(unsnoozeEmail("user-1", "msg-1")).resolves.toEqual({
      unsnoozed: true,
    });
    await expect(unsnoozeEmail("user-1", "msg-1")).resolves.toEqual({
      unsnoozed: false,
    });
  });

  it("propagates a database error so the worker can record a JobFailure", async () => {
    mockUpdateMany.mockRejectedValue(new Error("deadlock"));

    await expect(unsnoozeEmail("user-1", "msg-1")).rejects.toThrow("deadlock");
  });
});
