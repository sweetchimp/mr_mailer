import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGroqCreate, mockFindMany, mockFindUnique, mockUpsert } = vi.hoisted(() => ({
  mockGroqCreate: vi.fn(),
  mockFindMany: vi.fn().mockResolvedValue([]),
  mockFindUnique: vi.fn().mockResolvedValue(null),
  mockUpsert: vi.fn(),
}));

vi.mock("groq-sdk", () => {
  return {
    default: class {
      chat = { completions: { create: mockGroqCreate } };
    },
  };
});

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return {
      emailSummary: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        upsert: mockUpsert,
      },
    };
  },
}));

import { summarizeEmails } from "../ai.server";
import type { EmailMessage } from "../email-provider.server";

const baseEmail: EmailMessage = {
  id: "msg-1",
  threadId: "thread-1",
  messageId: "<msg-1@test>",
  subject: "Meeting tomorrow",
  sender: "alice@example.com",
  snippet: "Can we meet at 3pm?",
  date: "2026-01-01",
  body: "Hi, can we meet at 3pm tomorrow?",
};

const goodEmail: EmailMessage = { ...baseEmail, id: "msg-good", subject: "Meeting tomorrow" };
const badEmail: EmailMessage = { ...baseEmail, id: "msg-bad", subject: "Weekly newsletter" };

const goodResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          priority: "HIGH",
          summaryText: "Alice wants to schedule a meeting at 3pm.",
          suggestedReply: "Sure, 3pm works for me.",
          actionRequired: true,
        }),
      },
    },
  ],
};

/** A response shape that `summarizeEmail` cannot turn into a summary. */
const unusableResponses: Array<[string, unknown]> = [
  ["malformed JSON", { choices: [{ message: { content: "not valid json {{{" } }] }],
  ["an empty response", { choices: [{ message: { content: null } }] }],
  ["empty choices", { choices: [] }],
  [
    "an invalid priority",
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              priority: "URGENT",
              summaryText: "Some summary",
              suggestedReply: null,
              actionRequired: false,
            }),
          },
        },
      ],
    },
  ],
];

type GroqArgs = { messages: Array<{ role: string; content: string }> };

/** Fails only the email whose subject matches, so the good one still lands. */
function respondExcept(email: EmailMessage, response: unknown) {
  mockGroqCreate.mockImplementation(async ({ messages }: GroqArgs) => {
    const content = messages.find((m) => m.role === "user")?.content ?? "";
    if (content.includes(email.subject)) return response;
    return goodResponse;
  });
}

describe("summarizeEmails (AI summary parsing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does not drop implementations, so reset explicitly or a
    // mockImplementation from a previous test leaks into the next one.
    mockGroqCreate.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
  });

  it("parses a valid AI response correctly", async () => {
    mockGroqCreate.mockResolvedValue(goodResponse);

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toEqual({
      priority: "HIGH",
      summaryText: "Alice wants to schedule a meeting at 3pm.",
      suggestedReply: "Sure, 3pm works for me.",
      actionRequired: true,
    });
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it.each(unusableResponses)(
    "nulls the summary for %s without discarding the other emails",
    async (_label, unusable) => {
      respondExcept(badEmail, unusable);

      const results = await summarizeEmails("user-1", [goodEmail, badEmail]);

      expect(results[0].summary).not.toBeNull();
      expect(results[1].summary).toBeNull();
    },
  );

  // The regression this whole change exists for: a provider outage used to
  // resolve with every email null and no error, so nothing was recorded and the
  // dashboard looked like an empty inbox. It must now surface.
  it("throws when every summary fails, naming the provider error", async () => {
    mockGroqCreate.mockRejectedValue(new Error("401 Invalid API Key"));

    await expect(summarizeEmails("user-1", [baseEmail])).rejects.toThrow(
      /All 1 email summarization attempts failed: 401 Invalid API Key/,
    );
  });

  it("tags the thrown error with step ai-summarization so a JobFailure is written", async () => {
    mockGroqCreate.mockRejectedValue(new Error("401 Invalid API Key"));

    await expect(summarizeEmails("user-1", [baseEmail])).rejects.toMatchObject({
      step: "ai-summarization",
    });
  });

  it("does not throw when every email is already cached", async () => {
    mockFindMany.mockResolvedValue([{ gmailMessageId: baseEmail.id }]);
    mockFindUnique.mockResolvedValue({
      priority: "LOW",
      summaryText: "Already summarised.",
      suggestedReply: null,
      status: "PENDING",
    });

    const results = await summarizeEmails("user-1", [baseEmail]);

    expect(results[0].summary?.summaryText).toBe("Already summarised.");
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });

  it("does not throw when there is nothing to summarize", async () => {
    await expect(summarizeEmails("user-1", [])).resolves.toEqual([]);
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });
});
