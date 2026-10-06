import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Account deletion, and specifically the property that matters most: it takes
 * one account's data and leaves everyone else's alone.
 *
 * A mocked `deleteMany` asserting on its `where` clause would prove the right
 * argument was passed and nothing about the outcome, so the fake Prisma in
 * here is a small in-memory database with two users seeded into every table.
 * The assertions read the rows that survive.
 */

const T = vi.hoisted(() => {
  const USER_SCOPED_MODELS = [
    "emailSummary",
    "senderPreference",
    "jobFailure",
    "subscription",
    "meetingReminder",
    "meetingMinutes",
    "scheduleBlock",
    "replyFeedback",
    "replyStyleProfile",
    "oAuthToken",
  ] as const;

  type UserScopedModel = (typeof USER_SCOPED_MODELS)[number];

  const USER_A = { id: "user-a", email: "ada@example.test" };
  const USER_B = { id: "user-b", email: "bob@example.test" };

  interface Row {
    id: string;
    userId: string;
    provider?: string;
    refreshToken?: string;
  }

  interface OwnedJob {
    queue: string;
    data: { userId?: string };
    removed: boolean;
    remove?: () => Promise<void>;
  }

  function makeDb() {
    const tables = Object.fromEntries(
      USER_SCOPED_MODELS.map((model) => [model, []]),
    ) as unknown as Record<UserScopedModel, Row[]>;

    // Every table gets a row for both users, so a delete that ignored the
    // filter would visibly take B's data with it.
    for (const model of USER_SCOPED_MODELS) {
      tables[model].push({ id: `${model}-a`, userId: USER_A.id });
      tables[model].push({ id: `${model}-b`, userId: USER_B.id });
    }

    // Only A has a Google grant, so the Microsoft case below is a genuine
    // "no Google token exists" path rather than one filtered out by provider.
    tables.oAuthToken = [
      {
        id: "token-a-google",
        userId: USER_A.id,
        provider: "GOOGLE",
        refreshToken: "ciphertext:of:refresh",
      },
      { id: "token-a-ms", userId: USER_A.id, provider: "MICROSOFT" },
      { id: "token-b-google", userId: USER_B.id, provider: "GOOGLE" },
    ];

    const jobs: OwnedJob[] = [
      { queue: "morning-digest", data: { userId: USER_A.id }, removed: false },
      { queue: "morning-digest", data: { userId: USER_B.id }, removed: false },
      { queue: "email-reminder", data: { userId: USER_A.id }, removed: false },
      { queue: "reply-style", data: { userId: USER_B.id }, removed: false },
      // No owner at all — a repeatable scheduler entry. Must be left alone.
      { queue: "morning-digest", data: {}, removed: false },
    ];
    for (const job of jobs) {
      job.remove = async () => {
        job.removed = true;
      };
    }

    return {
      tables,
      users: [
        { ...USER_A },
        { ...USER_B },
      ] as { id: string; email: string }[],
      jobs,
      deleteManyCalls: [] as {
        model: UserScopedModel;
        where: { userId?: string };
      }[],
      userDeletes: [] as string[],
    };
  }

  type Db = ReturnType<typeof makeDb>;

  function makePrisma(db: Db) {
    const client: Record<string, unknown> = {
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    };

    for (const model of USER_SCOPED_MODELS) {
      client[model] = {
        findFirst: async ({
          where,
        }: {
          where: { userId?: string; provider?: string };
        }) =>
          db.tables[model].find(
            (row) =>
              (where.userId === undefined || row.userId === where.userId) &&
              (where.provider === undefined || row.provider === where.provider),
          ) ?? null,
        deleteMany: async ({ where }: { where: { userId?: string } }) => {
          db.deleteManyCalls.push({ model, where });
          const before = db.tables[model].length;
          db.tables[model] = db.tables[model].filter(
            (row) => row.userId !== where.userId,
          );
          return { count: before - db.tables[model].length };
        },
      };
    }

    client.user = {
      delete: async ({ where }: { where: { id: string } }) => {
        db.userDeletes.push(where.id);
        const index = db.users.findIndex((user) => user.id === where.id);
        const [removed] = db.users.splice(index, 1);
        return removed;
      },
    };

    return client;
  }

  return {
    USER_SCOPED_MODELS,
    USER_A,
    USER_B,
    makeDb,
    makePrisma,
    cookiesDelete: vi.fn(),
    redirect: vi.fn<(path: string) => never>(),
    fetchMock: vi.fn(),
    requireUser: vi.fn(),
    decrypt: vi.fn((payload: string) => `decrypted:${payload}`),
  };
});

const db = T.makeDb();

vi.mock("@/lib/prisma.server", () => ({
  get prisma() {
    return T.makePrisma(db);
  },
}));

vi.mock("@/lib/current-session.server", () => ({
  requireUser: () => T.requireUser(),
}));

vi.mock("@/lib/crypto.server", () => ({ decrypt: T.decrypt }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: T.cookiesDelete }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => T.redirect(path),
}));

vi.mock("@/services/queue.server", () => {
  const queue = { getJobs: async () => db.jobs };
  return {
    getMorningDigestQueue: () => queue,
    getWeeklyDigestQueue: () => queue,
    getEmailReminderQueue: () => queue,
    getMeetingReminderQueue: () => queue,
    getScheduleBlockQueue: () => queue,
    getReplyStyleQueue: () => queue,
  };
});

import { deleteAccountAction } from "../actions";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

function confirmation(email: string): FormData {
  const data = new FormData();
  data.set("confirmedEmail", email);
  return data;
}

/** `redirect()` throws a Next sentinel in production; this is the test's one. */
const NEXT_REDIRECT = "NEXT_REDIRECT";

async function deleteAs(user: { id: string; email: string }, email?: string) {
  T.requireUser.mockResolvedValue(user);
  T.redirect.mockImplementation(() => {
    throw new Error(NEXT_REDIRECT);
  });

  await expect(
    deleteAccountAction(confirmation(email ?? user.email)),
  ).rejects.toThrow(NEXT_REDIRECT);
}

describe("deleteAccountAction", () => {
  beforeEach(() => {
    const fresh = T.makeDb();
    db.tables = fresh.tables;
    db.users = fresh.users;
    db.jobs = fresh.jobs;
    db.deleteManyCalls = [];
    db.userDeletes = [];

    T.cookiesDelete.mockClear();
    T.redirect.mockClear();
    T.fetchMock.mockClear();
    T.requireUser.mockReset();
    T.decrypt.mockClear();

    T.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    // Set explicitly rather than relying on the `vi.fn` initializer:
    // `mockReset: true` in vitest.config clears implementations between tests.
    T.decrypt.mockImplementation((payload: string) => `decrypted:${payload}`);
    // revokeGoogleToken refuses to call Google without client credentials, so
    // the assertion below would silently pass on "no call" without these.
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubGlobal("fetch", T.fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("removes every row belonging to the caller and leaves the other user intact", async () => {
    await deleteAs(T.USER_A);

    for (const model of T.USER_SCOPED_MODELS) {
      expect(
        db.tables[model].map((row) => row.userId),
        `${model} should hold only B's rows`,
      ).toEqual([T.USER_B.id]);
    }

    expect(db.users.map((user) => user.id)).toEqual([T.USER_B.id]);
    expect(db.userDeletes).toEqual([T.USER_A.id]);
  });

  it("scopes every delete to the caller's userId", async () => {
    await deleteAs(T.USER_A);

    expect(db.deleteManyCalls).toHaveLength(T.USER_SCOPED_MODELS.length);
    for (const call of db.deleteManyCalls) {
      expect(call.where).toEqual({ userId: T.USER_A.id });
    }
  });

  it("revokes the Google token using the decrypted refresh token", async () => {
    await deleteAs(T.USER_A);

    expect(T.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = T.fetchMock.mock.calls[0] as [
      string,
      { method: string; body: URLSearchParams },
    ];

    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(init.method).toBe("POST");
    expect(init.body.get("token")).toBe("decrypted:ciphertext:of:refresh");
    expect(init.body.get("client_id")).toBeTruthy();
    expect(init.body.get("client_secret")).toBeTruthy();
  });

  it("makes no revocation call for a Microsoft-only account", async () => {
    db.tables.oAuthToken = [
      { id: "token-a-ms", userId: T.USER_A.id, provider: "MICROSOFT" },
    ];

    await deleteAs(T.USER_A);

    expect(T.fetchMock).not.toHaveBeenCalled();
    // The Microsoft row is still deleted — only the revoke step is skipped.
    expect(db.tables.oAuthToken).toEqual([]);
  });

  it("cancels the caller's queued jobs and keeps the other user's", async () => {
    await deleteAs(T.USER_A);

    const removed = db.jobs.filter((job) => job.removed);
    expect(removed).toHaveLength(2);
    expect(removed.every((job) => job.data.userId === T.USER_A.id)).toBe(true);

    const survivors = db.jobs.filter((job) => !job.removed);
    expect(survivors.some((job) => job.data.userId === T.USER_B.id)).toBe(true);
    // The unowned repeatable job must not match anything.
    expect(survivors.some((job) => job.data.userId === undefined)).toBe(true);
  });

  it("rejects a confirmation that does not match and changes nothing", async () => {
    T.requireUser.mockResolvedValue(T.USER_A);

    const result = await deleteAccountAction(
      confirmation("someone-else@example.test"),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not match/);
    expect(db.deleteManyCalls).toEqual([]);
    expect(db.userDeletes).toEqual([]);
    expect(db.users.map((user) => user.id)).toEqual([T.USER_A.id, T.USER_B.id]);
    expect(T.fetchMock).not.toHaveBeenCalled();
    expect(T.redirect).not.toHaveBeenCalled();
  });

  it("trims the typed confirmation so a stray space cannot lock the user out", async () => {
    await deleteAs(T.USER_A, `  ${T.USER_A.email}  `);

    expect(db.userDeletes).toEqual([T.USER_A.id]);
  });

  it("signs the caller out and lands them on the confirmation page", async () => {
    await deleteAs(T.USER_A);

    expect(T.cookiesDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(T.redirect).toHaveBeenCalledWith("/account-deleted");
  });
});
