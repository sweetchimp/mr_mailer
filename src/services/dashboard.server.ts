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
