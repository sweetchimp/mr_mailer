import { cache } from "react";
import { prisma } from "../lib/prisma.server";
import type { EmailSummary, Prisma, Priority, Provider } from "@prisma/client";
import type {
  EmailBucket,
  HistoryEmail,
  SummarizedEmail,
} from "../lib/email-view";
import { startOfLocalDay, formatLocalTime } from "../lib/date.server";
import { buildTickerItems, type TickerItem } from "../lib/ticker";
import { averageResponseTime, formatDuration } from "../lib/weekly-digest";

export interface DashboardCounts {
  high: number;
  medium: number;
  low: number;
  replied: number;
  snoozed: number;
  history: number;
}

async function loadDashboardCounts(userId: string): Promise<DashboardCounts> {
  const [high, medium, low, replied, snoozed, history] = await Promise.all([
    prisma.emailSummary.count({
      where: { userId, status: "PENDING", priority: "HIGH" },
    }),
    prisma.emailSummary.count({
      where: { userId, status: "PENDING", priority: "MEDIUM" },
    }),
    prisma.emailSummary.count({
      where: { userId, status: "PENDING", priority: "LOW" },
    }),
    prisma.emailSummary.count({ where: { userId, status: "SENT" } }),
    prisma.emailSummary.count({ where: { userId, status: "SNOOZED" } }),
    prisma.emailSummary.count({
      where: { userId, status: { in: ["SENT", "DISMISSED"] } },
    }),
  ]);

  return { high, medium, low, replied, snoozed, history };
}

/**
 * Request-memoized, because the dashboard asks for these counts from more than
 * one place in a single render and each call was six separate `count` queries.
 *
 * `cache` is per-request, not per-process: a count that a background job changes
 * must not be pinned for the lifetime of the server, and it is a pass-through
 * outside a render, so worker and action callers are unaffected.
 */
export const getDashboardCounts = cache(loadDashboardCounts);

async function loadProviderForUser(userId: string): Promise<Provider> {
  const token = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { provider: true },
  });
  return token?.provider ?? "GOOGLE";
}

/**
 * Request-memoized for the same reason as `getDashboardCounts`: every bucket
 * page resolves the provider to decide whether to mention calendar sync, so a
 * layout, a page, and the ticker were each re-reading the token row.
 */
export const getProviderForUser = cache(loadProviderForUser);

/**
 * How recent an AI-summarization failure must be to be worth reporting.
 *
 * Without a bound this is the most recent failure *ever*, so a single outage
 * recorded days ago kept presenting itself as a current problem: the banner
 * claims "press Refresh to retry" long after the key was fixed, and keeps
 * claiming it every time the buckets happen to be empty. Empty buckets are the
 * normal state for a caught-up inbox, so a stale failure is indistinguishable
 * from a broken provider — the same "looks broken, is fine" trap as the
 * swallowed Refresh click and the blank calendar panel.
 */
const SUMMARIZATION_FAILURE_WINDOW_HOURS = 24;

/**
 * The most recent AI-summarization failure for this user, if any. The dashboard
 * renders this so a provider outage (bad key, decommissioned model, outage)
 * appears as a named problem instead of six silently zeroed buckets.
 */
export async function getLatestSummarizationFailure(
  userId: string,
): Promise<{ errorMessage: string; createdAt: Date } | null> {
  const since = new Date();
  since.setHours(since.getHours() - SUMMARIZATION_FAILURE_WINDOW_HOURS);

  return prisma.jobFailure.findFirst({
    where: {
      userId,
      step: "ai-summarization",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { errorMessage: true, createdAt: true },
  });
}

export interface JobFailureRow {
  id: string;
  jobType: string;
  step: string;
  errorMessage: string;
  context: string | null;
  createdAt: string;
}

const MAX_FAILURE_ROWS = 100;

/**
 * Recorded job failures, newest first. `JobFailure` rows are written by the
 * worker and the dashboard's queue action, but until now nothing could read
 * them back: a failing job was only visible by tailing container logs, which
 * is why several real faults went unnoticed here.
 */
export async function getJobFailures(userId: string): Promise<JobFailureRow[]> {
  const rows = await prisma.jobFailure.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_FAILURE_ROWS,
  });

  return rows.map((row) => ({
    id: row.id,
    jobType: row.jobType,
    step: row.step,
    errorMessage: row.errorMessage,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Only called for users with no summaries yet, to avoid an unbounded list. */
const MAX_LIST_SIZE = 200;

function toSummarizedEmail(row: EmailSummary): SummarizedEmail {
  return {
    id: row.gmailMessageId,
    subject: row.subject,
    sender: row.sender,
    senderAddress: row.senderAddress,
    snippet: row.summaryText,
    date: row.createdAt.toISOString(),
    summary: {
      priority: row.priority,
      summaryText: row.summaryText,
      suggestedReply: row.suggestedReply,
    },
    status: row.status,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
  };
}

/** The three priority buckets and the snoozed list render the full card. */
export async function getBucketEmails(
  userId: string,
  bucket: EmailBucket,
): Promise<SummarizedEmail[]> {
  const rows = await prisma.emailSummary.findMany({
    where:
      bucket === "snoozed"
        ? { userId, status: "SNOOZED" }
        : {
            userId,
            status: "PENDING",
            priority:
              bucket === "needs-reply"
                ? "HIGH"
                : bucket === "worth-a-glance"
                  ? "MEDIUM"
                  : "LOW",
          },
    orderBy: { createdAt: "desc" },
    take: MAX_LIST_SIZE,
  });

  return rows.map(toSummarizedEmail);
}

export async function getHistoryEmails(
  userId: string,
  bucket: "replied" | "history",
  search?: string | null,
): Promise<HistoryEmail[]> {
  const query = search?.trim() ?? "";

  const base: Prisma.EmailSummaryWhereInput =
    bucket === "replied"
      ? { userId, status: "SENT" }
      : { userId, status: { in: ["SENT", "DISMISSED"] } };

  const where: Prisma.EmailSummaryWhereInput = {
    ...base,
    // `contains` is MySQL LIKE underneath, so this is a case-insensitive
    // substring match on the connection's collation and cannot use an index.
    // Fine at this row count; the alternative that could use one would be a
    // full-text index nobody here needs yet.
    ...(query
      ? {
          OR: [
            { subject: { contains: query } },
            { sender: { contains: query } },
            { summaryText: { contains: query } },
          ],
        }
      : {}),
  };

  const rows = await prisma.emailSummary.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // Applied after the filter, so a search reaches the whole archive rather
    // than only the newest 200 rows.
    take: MAX_LIST_SIZE,
  });

  return rows.map((row) => ({
    id: row.gmailMessageId,
    subject: row.subject,
    sender: row.sender,
    status: row.status,
    date: row.createdAt.toISOString(),
    summary: row.summaryText,
  }));
}

export interface HandledToday {
  /** Of today's arrivals, the ones now replied to or dismissed. */
  handled: number;
  /** Everything the digest summarized today, i.e. today's arrivals. */
  total: number;
}

/**
 * The "X / Y handled today" ring.
 *
 * Windowed by `createdAt` (arrival) rather than by `sentAt`/`dismissedAt`, so
 * X and Y describe the same set of emails: you cannot have handled more of
 * today's mail than arrived today. Snoozed counts as not-yet-handled.
 */
export async function getTodaysHandledCounts(
  userId: string,
): Promise<HandledToday> {
  const since = startOfLocalDay();

  const [total, handled] = await Promise.all([
    prisma.emailSummary.count({
      where: { userId, createdAt: { gte: since } },
    }),
    prisma.emailSummary.count({
      where: {
        userId,
        createdAt: { gte: since },
        status: { in: ["SENT", "DISMISSED"] },
      },
    }),
  ]);

  return { handled, total };
}

export interface AverageReplyTime {
  /** `4h 12m`, or null when there are not enough replies to say. */
  label: string | null;
  samples: number;
}

const AVERAGE_REPLY_SAMPLES = 200;

export async function getAverageReplyTime(
  userId: string,
): Promise<AverageReplyTime> {
  const rows = await prisma.emailSummary.findMany({
    where: { userId, sentAt: { not: null } },
    select: { createdAt: true, sentAt: true },
    orderBy: { sentAt: "desc" },
    take: AVERAGE_REPLY_SAMPLES,
  });

  const { avgTimeToReplyMs, replySamples } = averageResponseTime(rows);
  return {
    label: avgTimeToReplyMs === null ? null : formatDuration(avgTimeToReplyMs),
    samples: replySamples,
  };
}

const TICKER_EMAILS = 4;
const TICKER_REPLIES = 3;
const TICKER_SNOOZES = 3;

// The Priority enum sorts alphabetically (HIGH, LOW, MEDIUM), which is not the
// urgency order, so the ranked sort happens here.
const PRIORITY_RANK: Record<Priority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export async function getTickerItems(
  userId: string,
  meetings: { eventId: string; title: string; startTime: Date }[],
): Promise<TickerItem[]> {
  const now = new Date();

  const [emailRows, replies, snoozes] = await Promise.all([
    prisma.emailSummary.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: TICKER_EMAILS * 3,
      select: {
        gmailMessageId: true,
        subject: true,
        priority: true,
        createdAt: true,
      },
    }),
    prisma.emailSummary.findMany({
      where: { userId, status: "SENT", sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      take: TICKER_REPLIES,
      select: { gmailMessageId: true, subject: true, sentAt: true },
    }),
    prisma.emailSummary.findMany({
      where: { userId, status: "SNOOZED", snoozedUntil: { lte: now } },
      orderBy: { snoozedUntil: "asc" },
      take: TICKER_SNOOZES,
      select: { gmailMessageId: true, subject: true, snoozedUntil: true },
    }),
  ]);

  const emails = [...emailRows]
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .slice(0, TICKER_EMAILS);

  return buildTickerItems(
    {
      meetings,
      snoozes: snoozes.map((row) => ({
        id: row.gmailMessageId,
        subject: row.subject,
        snoozedUntil: row.snoozedUntil as Date,
      })),
      replies: replies.map((row) => ({
        id: row.gmailMessageId,
        subject: row.subject,
        sentAt: row.sentAt as Date,
      })),
      emails: emails.map((row) => ({
        id: row.gmailMessageId,
        subject: row.subject,
        priority: row.priority,
      })),
    },
    formatLocalTime,
  );
}
