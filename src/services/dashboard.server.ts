import { prisma } from "../lib/prisma.server";
import type { EmailSummary, Provider } from "@prisma/client";
import type {
  EmailBucket,
  HistoryEmail,
  SummarizedEmail,
} from "../lib/email-view";

export interface DashboardCounts {
  high: number;
  medium: number;
  low: number;
  replied: number;
  snoozed: number;
  history: number;
}

export async function getDashboardCounts(userId: string): Promise<DashboardCounts> {
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

export async function getProviderForUser(userId: string): Promise<Provider> {
  const token = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { provider: true },
  });
  return token?.provider ?? "GOOGLE";
}

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
): Promise<HistoryEmail[]> {
  const rows = await prisma.emailSummary.findMany({
    where:
      bucket === "replied"
        ? { userId, status: "SENT" }
        : { userId, status: { in: ["SENT", "DISMISSED"] } },
    orderBy: { createdAt: "desc" },
    take: MAX_LIST_SIZE,
  });

  return rows.map((row) => ({
    id: row.gmailMessageId,
    subject: row.subject,
    sender: row.sender,
    status: row.status,
    date: row.createdAt.toISOString(),
  }));
}
