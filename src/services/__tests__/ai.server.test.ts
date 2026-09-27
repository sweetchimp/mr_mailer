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

describe("summarizeEmails (AI summary parsing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
  });

  it("parses a valid AI response correctly", async () => {
    mockGroqCreate.mockResolvedValue({
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
    });

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toEqual({
      priority: "HIGH",
      summaryText: "Alice wants to schedule a meeting at 3pm.",
      suggestedReply: "Sure, 3pm works for me.",
      actionRequired: true,
    });
  });

  it("returns null for malformed JSON response", async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: "not valid json {{{" } }],
    });

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toBeNull();
  });

  it("returns null for empty response", async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toBeNull();
  });

  it("returns null when priority is missing/invalid", async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summaryText: "Some summary",
              suggestedReply: null,
              actionRequired: false,
            }),
          },
        },
      ],
    });

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toBeNull();
  });

  it("returns null for completely empty choices", async () => {
    mockGroqCreate.mockResolvedValue({
      choices: [],
    });

    const results = await summarizeEmails("user-1", [baseEmail]);
    expect(results[0].summary).toBeNull();
  });
});
