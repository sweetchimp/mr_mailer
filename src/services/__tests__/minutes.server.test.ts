import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGroqCreate,
  mockMinutesFindMany,
  mockMinutesFindFirst,
} = vi.hoisted(() => ({
  mockGroqCreate: vi.fn(),
  mockMinutesFindMany: vi.fn(),
  mockMinutesFindFirst: vi.fn(),
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
      meetingMinutes: {
        findMany: mockMinutesFindMany,
        findFirst: mockMinutesFindFirst,
      },
    };
  },
}));

import {
  generateMinutes,
  getMinutesForUser,
  getMinutesById,
} from "../minutes.server";

/** Wraps a model reply the way groq-sdk hands it back. */
function completion(content: unknown) {
  return { choices: [{ message: { content } }] };
}

const VALID_REPLY = JSON.stringify({
  summaryText: "The team agreed to ship the beta in March.",
  decisions: ["Ship the beta in March", "Drop the dark mode work"],
  actionItems: [
    { task: "Finalize the Q3 budget", owner: "Priya" },
    { task: "Book the room", owner: null },
  ],
  nextSteps: ["Kickoff on March 4"],
});

describe("generateMinutes", () => {
  beforeEach(() => {
    // vitest.config.ts sets mockReset: true, which strips implementations
    // between tests, so every default has to be re-armed here.
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_MODEL = "test-model";
    mockGroqCreate.mockResolvedValue(completion(VALID_REPLY));
  });

  it("rejects when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;

    await expect(generateMinutes("notes", "Standup")).rejects.toThrow(
      /GROQ_API_KEY/,
    );
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });

  it("uses the model from the environment, not a hardcoded one", async () => {
    await generateMinutes("notes", "Standup");

    expect(mockGroqCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );
  });

  it("asks for JSON mode and sends the title and attendees as context", async () => {
    await generateMinutes("we agreed to ship", "Beta planning", "Priya, Ada");

    const body = mockGroqCreate.mock.calls[0][0];
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toContain("Title: Beta planning");
    expect(body.messages[1].content).toContain("Attendees: Priya, Ada");
    expect(body.messages[1].content).toContain("we agreed to ship");
  });

  it("says 'Not provided' rather than leaving a dangling empty field", async () => {
    await generateMinutes("notes", "Standup");

    expect(mockGroqCreate.mock.calls[0][0].messages[1].content).toContain(
      "Attendees: Not provided",
    );
  });

  it("parses the structured reply", async () => {
    const result = await generateMinutes("notes", "Standup");

    expect(result).toEqual({
      summaryText: "The team agreed to ship the beta in March.",
      decisions: ["Ship the beta in March", "Drop the dark mode work"],
      actionItems: [
        { task: "Finalize the Q3 budget", owner: "Priya" },
        { task: "Book the room", owner: null },
      ],
      nextSteps: ["Kickoff on March 4"],
    });
  });

  it("truncates overlong notes from the head, keeping the topic and dropping the tail", async () => {
    const padding = "x".repeat(9000);

    await generateMinutes(
      `the real opening\n${padding}\nand the rambling tail`,
      "Standup",
    );

    const sent = mockGroqCreate.mock.calls[0][0].messages[1].content;
    expect(sent).toContain("the real opening");
    // The opposite of ai.server.ts, which keeps an email's *tail*: a meeting
    // note states its topic up front, so the tail is what gets dropped.
    expect(sent).not.toContain("rambling tail");
  });

  // The regression: `ai.server.ts` validates only `priority` and trusts the rest
  // of the model output verbatim. Here the reply is written into columns a page
  // parses back, so an unnormalized field becomes a permanently empty section.
  it("normalizes action items returned as bare strings", async () => {
    mockGroqCreate.mockResolvedValue(
      completion(
        JSON.stringify({
          summaryText: "ok",
          decisions: [],
          actionItems: ["Finalize the Q3 budget — Priya"],
          nextSteps: [],
        }),
      ),
    );

    const result = await generateMinutes("notes", "Standup");

    expect(result.actionItems).toEqual([
      { task: "Finalize the Q3 budget — Priya", owner: null },
    ]);
  });

  it("drops a single object where an array belongs instead of inventing a section", async () => {
    mockGroqCreate.mockResolvedValue(
      completion(
        JSON.stringify({
          summaryText: "ok",
          decisions: { a: 1 },
          actionItems: { task: "Send the deck", owner: "Ada" },
          nextSteps: null,
        }),
      ),
    );

    const result = await generateMinutes("notes", "Standup");

    expect(result.decisions).toEqual([]);
    expect(result.actionItems).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });

  it("coerces a single string decision into a one-item list", async () => {
    mockGroqCreate.mockResolvedValue(
      completion(
        JSON.stringify({
          summaryText: "ok",
          decisions: "Ship on Friday",
          actionItems: "Send the deck",
          nextSteps: [],
        }),
      ),
    );

    const result = await generateMinutes("notes", "Standup");

    expect(result.decisions).toEqual(["Ship on Friday"]);
    expect(result.actionItems).toEqual([{ task: "Send the deck", owner: null }]);
  });

  it("normalizes a blank owner and a missing summary", async () => {
    mockGroqCreate.mockResolvedValue(
      completion(
        JSON.stringify({
          summaryText: "   ",
          decisions: [],
          actionItems: [
            { task: "Draft the memo", owner: "  " },
            { owner: "Priya" },
            null,
          ],
          nextSteps: [],
        }),
      ),
    );

    const result = await generateMinutes("notes", "Standup");

    expect(result.summaryText).toMatch(/too sparse/i);
    expect(result.actionItems).toEqual([
      { task: "Draft the memo", owner: null },
    ]);
  });

  it.each([
    ["null content", completion(null)],
    ["no choices at all", { choices: [] }],
    ["a bare string, not JSON", completion("I could not summarize that.")],
    ["markdown-fenced JSON", completion("```json\n" + VALID_REPLY + "\n```")],
    ["a JSON array, not an object", completion("[]")],
  ])("throws on %s rather than saving a half-built document", async (_label, reply) => {
    mockGroqCreate.mockResolvedValue(reply);

    await expect(generateMinutes("notes", "Standup")).rejects.toThrow();
  });
});

describe("getMinutesForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMinutesFindMany.mockResolvedValue([]);
  });

  it("returns the user's minutes newest first", async () => {
    mockMinutesFindMany.mockResolvedValue([
      {
        id: "m-2",
        title: "Beta planning",
        createdAt: new Date("2026-03-02T10:00:00Z"),
        attendees: "Priya",
      },
      {
        id: "m-1",
        title: "Standup",
        createdAt: new Date("2026-03-01T10:00:00Z"),
        attendees: null,
      },
    ]);

    const rows = await getMinutesForUser("user-1");

    expect(mockMinutesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["m-2", "m-1"]);
    expect(rows[0].date).toBe("2026-03-02T10:00:00.000Z");
  });

  it("does not select the parsed columns the list never renders", async () => {
    await getMinutesForUser("user-1");

    expect(mockMinutesFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      title: true,
      createdAt: true,
      attendees: true,
    });
  });
});

describe("getMinutesById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMinutesFindFirst.mockResolvedValue(null);
  });

  it("parses the stored columns into the view model", async () => {
    mockMinutesFindFirst.mockResolvedValue({
      id: "m-1",
      title: "Beta planning",
      createdAt: new Date("2026-03-02T10:00:00Z"),
      attendees: "Priya, Ada",
      summaryText: "They agreed to ship in March.",
      decisions: '["Ship in March"]',
      actionItems: '[{"task":"Send the deck","owner":"Priya"}]',
      nextSteps: '["Kickoff on March 4"]',
      rawNotes: "ok we ship in march",
    });

    const detail = await getMinutesById("user-1", "m-1");

    expect(detail).toEqual({
      id: "m-1",
      title: "Beta planning",
      date: "2026-03-02T10:00:00.000Z",
      attendees: "Priya, Ada",
      summaryText: "They agreed to ship in March.",
      decisions: ["Ship in March"],
      actionItems: [{ task: "Send the deck", owner: "Priya" }],
      nextSteps: ["Kickoff on March 4"],
      rawNotes: "ok we ship in march",
    });
  });

  // The regression, and the same boundary `findOwnedSummary` guards in
  // app/dashboard/actions.ts. The id is a uuid and so unguessable, but the row
  // still has to belong to the caller — and "someone else's row" and "no such
  // row" must be indistinguishable to the response.
  it("scopes the lookup to the caller's userId", async () => {
    await getMinutesById("user-1", "m-1");

    expect(mockMinutesFindFirst).toHaveBeenCalledWith({
      where: { id: "m-1", userId: "user-1" },
    });
  });

  it("returns null for a row that is not the caller's", async () => {
    mockMinutesFindFirst.mockResolvedValue(null);

    await expect(getMinutesById("user-2", "m-1")).resolves.toBeNull();
  });

  it("rejects an overlong id without querying", async () => {
    await expect(getMinutesById("user-1", "x".repeat(513))).resolves.toBeNull();
    await expect(getMinutesById("user-1", "")).resolves.toBeNull();

    expect(mockMinutesFindFirst).not.toHaveBeenCalled();
  });
});
