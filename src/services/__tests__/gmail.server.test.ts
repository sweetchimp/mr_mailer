import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const { mockGetValidAccessToken } = vi.hoisted(() => ({
  mockGetValidAccessToken: vi.fn(),
}));

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
  getValidAccessToken: mockGetValidAccessToken,
}));

import { GmailProvider } from "../gmail.server";

/** Gmail wants raw RFC 2822 as unpadded base64url. */
function decodeRaw(raw: string): string {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf-8",
  );
}

describe("GmailProvider.sendReply", () => {
  const provider = new GmailProvider();

  beforeEach(() => {
    // vitest.config.ts sets mockReset: true, which strips implementations
    // between tests, so every default has to be re-armed here.
    mockGetValidAccessToken.mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the reply to the Gmail send endpoint", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test Subject",
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await provider.sendReply("user-1", "msg-1", "My reply");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-access-token",
    );

    const raw = decodeRaw(JSON.parse(init.body as string).raw);
    expect(raw).toContain("To: alice@example.com");
    expect(raw).toContain("Subject: Re: Test Subject");
    expect(raw).toContain("My reply");
  });

  it("omits In-Reply-To and References headers", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test",
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await provider.sendReply("user-1", "msg-1", "My reply");

    const raw = decodeRaw(JSON.parse(fetchMock.mock.calls[0][1].body as string).raw);
    // These must carry real Message-IDs. EmailSummary stores neither the
    // original Message-ID nor the threadId, so we rely on subject threading
    // rather than sending a header that would be a bare email address.
    expect(raw).not.toContain("In-Reply-To");
    expect(raw).not.toContain("References");
  });

  it("does not update status — the caller owns the SENT transition", async () => {
    mockFindUnique.mockResolvedValue({
      gmailMessageId: "msg-1",
      sender: "alice@example.com",
      subject: "Test Subject",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await provider.sendReply("user-1", "msg-1", "My reply");

    // Marking SENT here used to skip Microsoft Graph replies entirely; the
    // dashboard server action now does it for every provider.
    expect(mockUpdate).not.toHaveBeenCalled();
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
        status: 403,
        text: () => Promise.resolve("quota exceeded"),
      }),
    );

    await expect(
      provider.sendReply("user-1", "msg-1", "reply"),
    ).rejects.toThrow("Gmail API error");
  });
});

describe("GmailProvider.getFullBody", () => {
  const provider = new GmailProvider();

  beforeEach(() => {
    mockGetValidAccessToken.mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("URL-encodes the message reference", async () => {
    const reference = "thread/with slashes+plus";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          payload: {
            mimeType: "text/plain",
            body: { data: Buffer.from("the body").toString("base64url") },
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await provider.getFullBody("user-1", reference);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
        reference,
      )}?format=full`,
    );
  });

  it("returns an empty string on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(provider.getFullBody("user-1", "msg-1")).resolves.toBe("");
  });

  it("decodes the first text/plain part", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              mimeType: "multipart/alternative",
              parts: [
                {
                  mimeType: "text/html",
                  body: { data: Buffer.from("<p>hi</p>").toString("base64url") },
                },
                {
                  mimeType: "text/plain",
                  body: { data: Buffer.from("hi there").toString("base64url") },
                },
              ],
            },
          }),
      }),
    );

    await expect(provider.getFullBody("user-1", "msg-1")).resolves.toBe(
      "hi there",
    );
  });
});

describe("GmailProvider.getTodaysEmails", () => {
  const provider = new GmailProvider();

  /**
   * The provider filters against the real clock, so a fixed timestamp would go
   * stale. Build times relative to the actual day boundary instead: `midToday`
   * is always inside [midnight, now], even when the suite runs at 00:01.
   */
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const midToday = Math.floor(dayStart + (now.getTime() - dayStart) / 2);
  const yesterday = dayStart - 60 * 60 * 1000;
  const justAfterNow = now.getTime() + 60 * 60 * 1000;

  interface FakeMessage {
    id: string;
    internalDate?: string;
    subject?: string;
    /** Simulate the per-message metadata request failing. */
    fail?: boolean;
  }

  function stubGmail(messages: FakeMessage[]) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/messages?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: messages.map((m) => ({ id: m.id })) }),
        };
      }
      const id = decodeURIComponent(url.match(/\/messages\/([^?]+)\?/)?.[1] ?? "");
      const found = messages.find((m) => m.id === id);
      if (found?.fail) {
        return { ok: false, status: 500, text: async () => "boom" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: found!.id,
          threadId: `thread-${found!.id}`,
          snippet: "snippet",
          internalDate: found!.internalDate,
          payload: {
            headers: [{ name: "Subject", value: found!.subject ?? "no subject" }],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    mockGetValidAccessToken.mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps only messages received today", async () => {
    stubGmail([
      { id: "today-1", internalDate: String(midToday), subject: "Today" },
      { id: "yesterday-1", internalDate: String(yesterday), subject: "Yesterday" },
      { id: "today-2", internalDate: String(midToday), subject: "Also today" },
    ]);

    const emails = await provider.getTodaysEmails("user-1");

    expect(emails.map((e) => e.id).sort()).toEqual(["today-1", "today-2"]);
    expect(emails.map((e) => e.subject)).not.toContain("Yesterday");
  });

  it("excludes messages dated in the future", async () => {
    stubGmail([{ id: "future", internalDate: String(justAfterNow) }]);

    await expect(provider.getTodaysEmails("user-1")).resolves.toEqual([]);
  });

  it("searches with an after: bound rather than taking the newest N", async () => {
    const fetchMock = stubGmail([
      { id: "today-1", internalDate: String(midToday) },
    ]);

    await provider.getTodaysEmails("user-1");

    const listUrl = new URL(fetchMock.mock.calls[0][0] as string);
    // Assert the decoded param, not the raw string: URLSearchParams also
    // percent-encodes the slashes in the date.
    expect(listUrl.searchParams.get("q")).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);
    expect(listUrl.searchParams.get("maxResults")).toBe("15");
  });

  it("caps the result at five summaries", async () => {
    stubGmail(
      Array.from({ length: 9 }, (_, i) => ({
        id: `today-${i}`,
        internalDate: String(midToday),
      })),
    );

    const emails = await provider.getTodaysEmails("user-1");

    expect(emails).toHaveLength(5);
  });

  it("drops a message whose metadata request fails", async () => {
    stubGmail([
      { id: "ok", internalDate: String(midToday), subject: "Readable" },
      { id: "broken", internalDate: String(midToday), fail: true },
    ]);

    const emails = await provider.getTodaysEmails("user-1");

    // Previously this produced a placeholder row titled "(error loading)".
    expect(emails.map((e) => e.id)).toEqual(["ok"]);
  });

  it("returns an empty array for an empty result set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );

    await expect(provider.getTodaysEmails("user-1")).resolves.toEqual([]);
  });

  it("surfaces a Gmail API failure rather than returning an empty inbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "quota" }),
    );

    await expect(provider.getTodaysEmails("user-1")).rejects.toThrow(
      "Gmail API error: 403",
    );
  });
});
