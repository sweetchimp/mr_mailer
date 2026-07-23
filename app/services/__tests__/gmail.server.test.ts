import { describe, it, expect, vi, afterEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      emailSummary: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    };
  },
}));

vi.mock("../../lib/google-auth.server", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("test-access-token"),
}));

vi.mock("../../lib/diff.server", () => ({
  computeReplyDiff: vi.fn().mockReturnValue({ insertions: 0, deletions: 0, modifications: 0 }),
}));

vi.mock("../../services/reply-feedback.server", () => ({
  storeReplyFeedback: vi.fn(),
}));

import { GmailProvider } from "../gmail.server";

describe("GmailProvider.sendReply", () => {
  const provider = new GmailProvider();

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends reply successfully and updates status to SENT", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test Subject",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await provider.sendReply("user-1", "msg-1", "My reply");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { gmailMessageId: "msg-1" },
      data: { status: "SENT" },
    });
  });

  it("throws when email summary not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      provider.sendReply("user-1", "nonexistent", "reply"),
    ).rejects.toThrow("Email summary not found");
  });

  it("throws on Gmail API failure", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("quota exceeded"),
      }),
    );

    await expect(
      provider.sendReply("user-1", "msg-1", "reply"),
    ).rejects.toThrow("Gmail API error");
  });

  it("does not update status when send fails", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("error"),
      }),
    );

    await provider.sendReply("user-1", "msg-1", "reply").catch(() => {});
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
