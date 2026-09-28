import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetMicrosoftAccessToken } = vi.hoisted(() => ({
  mockGetMicrosoftAccessToken: vi.fn(),
}));

vi.mock("../../lib/microsoft-auth.server", () => ({
  getMicrosoftAccessToken: mockGetMicrosoftAccessToken,
}));

vi.mock("../../lib/prisma.server", () => ({
  get prisma() {
    return { oAuthToken: { findFirst: vi.fn() } };
  },
}));

import { MicrosoftGraphProvider } from "../microsoft-graph.server";

describe("MicrosoftGraphProvider.getTodaysEmails", () => {
  const provider = new MicrosoftGraphProvider();

  beforeEach(() => {
    mockGetMicrosoftAccessToken.mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function stubGraph(messages: unknown[] = []) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: messages }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  /**
   * Graph's receivedDateTime is a UTC ISO string, so the filter can be exact
   * rather than scanning a wider set. This asserts we stopped asking for "the
   * 5 most recent regardless of age" — which is what surfaced a three-day-old
   * promotional email in the digest.
   */
  it("filters the query to the current local day", async () => {
    const fetchMock = stubGraph();

    await provider.getTodaysEmails("user-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const filter = url.searchParams.get("$filter") ?? "";
    const orderBy = url.searchParams.get("$orderby");

    expect(filter).toMatch(
      /^receivedDateTime ge \d{4}-\d{2}-\d{2}T[\d:.]+Z and receivedDateTime le \d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
    );

    // The lower bound is local midnight expressed in UTC, so reading that
    // instant back in local time must land on 00:00. Converting it through
    // local calendar components would be wrong: an instant that is midnight
    // locally is often the previous day in UTC.
    const start = new Date(filter.match(/ge (\S+)/)![1]);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    // The upper bound is "now" and must not precede the start of the day.
    const end = new Date(filter.match(/le (\S+)/)![1]);
    expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(end.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);

    expect(orderBy).toBe("receivedDateTime desc");
  });

  it("keeps the top and select params the list call needs", async () => {
    const fetchMock = stubGraph();

    await provider.getTodaysEmails("user-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("$top")).toBe("5");
    expect(url.searchParams.get("$select")).toContain("receivedDateTime");
  });

  it("maps Graph messages into EmailMessage", async () => {
    stubGraph([
      {
        id: "msg-1",
        conversationId: "conv-1",
        subject: "Standup notes",
        from: { emailAddress: { name: "Alice", address: "alice@example.com" } },
        bodyPreview: "here are the notes",
        receivedDateTime: "2026-09-28T09:00:00Z",
      },
    ]);

    const emails = await provider.getTodaysEmails("user-1");

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      id: "msg-1",
      threadId: "conv-1",
      subject: "Standup notes",
      sender: "Alice <alice@example.com>",
      snippet: "here are the notes",
    });
  });

  it("returns an empty array when Graph returns no messages", async () => {
    stubGraph([]);

    await expect(provider.getTodaysEmails("user-1")).resolves.toEqual([]);
  });

  it("surfaces a Graph API failure rather than returning an empty inbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" }),
    );

    await expect(provider.getTodaysEmails("user-1")).rejects.toThrow(
      /Microsoft Graph API error: 401/,
    );
  });
});
