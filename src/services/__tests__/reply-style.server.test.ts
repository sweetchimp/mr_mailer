import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockGroqCreate,
  mockFeedbackFindMany,
  mockUpsert,
  mockProfileFindUnique,
} = vi.hoisted(() => ({
  mockGroqCreate: vi.fn(),
  mockFeedbackFindMany: vi.fn().mockResolvedValue([]),
  mockUpsert: vi.fn(),
  mockProfileFindUnique: vi.fn().mockResolvedValue(null),
}));

vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: mockGroqCreate } };
  },
}));

vi.mock("../reply-feedback.server", () => ({
  getRepliesForStyleAnalysis: mockFeedbackFindMany,
}));

vi.mock("../../lib/prisma.server", () => ({
  prisma: {
    replyStyleProfile: {
      upsert: mockUpsert,
      findUnique: mockProfileFindUnique,
    },
  },
}));

import { analyzeReplyStyle, getReplyStyleNote } from "../reply-style.server";
import type { StyleAnalysisSample } from "../../lib/reply-style";

const note = "Short sentences, no greeting, blunt openers.";

function samples(count: number): StyleAnalysisSample[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    suggested: "Sounds good, thanks.",
    sent: index % 2 === 0 ? "Sounds good, thanks." : "Yes, that works for me.",
    accepted: index % 2 === 0,
    insertions: 0,
    deletions: index % 2 === 0 ? 0 : 3,
    modifications: 0,
    sentAt: new Date("2026-01-01T09:00:00Z"),
    subject: "Re: Timeline",
    priority: "MEDIUM",
    senderAddress: "alice@example.com",
  }));
}

function modelResponds() {
  mockGroqCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ styleNote: note }) } }],
  });
}

describe("analyzeReplyStyle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroqCreate.mockReset();
    mockFeedbackFindMany.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({});
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_MODEL = "test-model";
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it("does not call the model until there is enough history", async () => {
    mockFeedbackFindMany.mockResolvedValue(samples(3));

    const result = await analyzeReplyStyle("user-1");

    expect(result).toEqual({ updated: false, sampleCount: 3, reason: "not enough replies yet" });
    expect(mockGroqCreate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("stores the note and the counts it was built from", async () => {
    mockFeedbackFindMany.mockResolvedValue(samples(6));
    modelResponds();

    const result = await analyzeReplyStyle("user-1");

    expect(result).toEqual({ updated: true, sampleCount: 6 });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        create: expect.objectContaining({
          userId: "user-1",
          styleNote: note,
          sampleCount: 6,
          acceptedCount: 3,
          rewriteCount: 3,
        }),
      }),
    );
  });

  it("keeps the existing profile when the model returns junk", async () => {
    mockFeedbackFindMany.mockResolvedValue(samples(6));
    mockGroqCreate.mockResolvedValue({ choices: [{ message: { content: "I think they're terse" } }] });

    const result = await analyzeReplyStyle("user-1");

    // A bad generation is a bad night, not a reason to blank a working profile.
    // The next scheduled run retries.
    expect(result.updated).toBe(false);
    expect(result.reason).toBe("model returned an unusable note");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("keeps the existing profile when the model call throws", async () => {
    mockFeedbackFindMany.mockResolvedValue(samples(6));
    mockGroqCreate.mockRejectedValue(new Error("rate limited"));

    await expect(analyzeReplyStyle("user-1")).rejects.toThrow("rate limited");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("asks for the analyser system prompt, not the summarizer's", async () => {
    mockFeedbackFindMany.mockResolvedValue(samples(6));
    modelResponds();

    await analyzeReplyStyle("user-1");

    const messages = mockGroqCreate.mock.calls[0]?.[0]?.messages as
      | { role: string; content: string }[]
      | undefined;
    const system = messages?.find((m) => m.role === "system")?.content ?? "";

    expect(system).toContain("analysing a person's own writing");
    expect(system).not.toContain("priority");
  });
});

describe("getReplyStyleNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileFindUnique.mockResolvedValue(null);
  });

  it("returns null rather than a placeholder for a user with no profile", async () => {
    await expect(getReplyStyleNote("user-1")).resolves.toBeNull();
  });

  it("reads only the note", async () => {
    mockProfileFindUnique.mockResolvedValue({ styleNote: note });

    await expect(getReplyStyleNote("user-1")).resolves.toBe(note);
    expect(mockProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { styleNote: true },
    });
  });
});
