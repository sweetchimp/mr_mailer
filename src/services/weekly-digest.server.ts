import { prisma } from "../lib/prisma.server";
import { trailingWindow, type DateWindow } from "../lib/date.server";
import { getEmailProvider } from "./email-provider.server";
import {
  averageResponseTime,
  renderWeeklySummaryText,
  WEEKLY_SUBJECT,
  type WeeklyStats,
} from "../lib/weekly-digest";

/** How far back the Sunday summary reaches. */
export const WEEKLY_WINDOW_DAYS = 7;

export function weeklyWindow(reference: Date = new Date()): DateWindow {
  return trailingWindow(WEEKLY_WINDOW_DAYS, reference);
}

/**
 * The Sunday rollup, over the trailing week.
 *
 * Handled counts are keyed off `sentAt`/`dismissedAt` rather than `createdAt`.
 * That is the whole reason those columns exist: status is mutable and unlogged,
 * so the only other option is to count emails that *arrived* this week, which
 * credits the week with mail still sitting untouched and misses anything handled
 * later than it arrived. The pending counts are deliberately not windowed — a
 * backlog is the state right now, and filtering it by date would understate it.
 */
export async function getWeeklyStats(
  userId: string,
  window: DateWindow = weeklyWindow(),
): Promise<WeeklyStats> {
  const inWindow = { gte: window.start, lte: window.end };

  const [replied, dismissed, pendingHigh, pendingMedium, pendingLow, snoozed, sentRows] =
    await Promise.all([
      prisma.emailSummary.count({ where: { userId, sentAt: inWindow } }),
      prisma.emailSummary.count({ where: { userId, dismissedAt: inWindow } }),
      prisma.emailSummary.count({
        where: { userId, status: "PENDING", priority: "HIGH" },
      }),
      prisma.emailSummary.count({
        where: { userId, status: "PENDING", priority: "MEDIUM" },
      }),
      prisma.emailSummary.count({
        where: { userId, status: "PENDING", priority: "LOW" },
      }),
      prisma.emailSummary.count({ where: { userId, status: "SNOOZED" } }),
      prisma.emailSummary.findMany({
        where: { userId, sentAt: inWindow },
        select: { createdAt: true, sentAt: true },
      }),
    ]);

  const { avgTimeToReplyMs, replySamples } = averageResponseTime(sentRows);

  return {
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    replied,
    dismissed,
    pendingHigh,
    pendingMedium,
    pendingLow,
    snoozed,
    avgTimeToReplyMs,
    replySamples,
  };
}

export type SendWeeklyDigestResult =
  | { sent: true; stats: WeeklyStats }
  | { sent: false; reason: "opted-out" | "no-recipient" | "token-revoked" };

/**
 * Sends the Sunday summary, if this user asked for it.
 *
 * Three separate opt-out checks, each of which returns a distinct reason rather
 * than throwing, because "nothing was sent" is the normal outcome for a user
 * who never turned it on and must not read as a failure in the job log.
 *
 * Throws on a genuine send error so the worker records a JobFailure and the
 * failure is visible on the admin page.
 */
export async function sendWeeklyDigest(userId: string): Promise<SendWeeklyDigestResult> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, email: true, name: true, weeklyDigestEmail: true, tokenRevokedAt: true },
  });

  if (!user) return { sent: false, reason: "opted-out" };
  if (!user.weeklyDigestEmail) return { sent: false, reason: "opted-out" };
  if (!user.email) return { sent: false, reason: "no-recipient" };
  if (user.tokenRevokedAt) return { sent: false, reason: "token-revoked" };

  const stats = await getWeeklyStats(userId);
  const provider = await getEmailProvider(userId);
  const firstName = user.name?.split(" ")[0] ?? null;

  await provider.sendNewMessage(user.id, {
    to: user.email,
    subject: WEEKLY_SUBJECT,
    body: renderWeeklySummaryText(stats, firstName),
  });

  return { sent: true, stats };
}
