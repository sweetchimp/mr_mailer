"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma.server";
import { requireUser } from "@/lib/current-session.server";
import { decrypt } from "@/lib/crypto.server";
import { getSessionCookieName } from "@/lib/session.server";
import {
  getEmailReminderQueue,
  getMeetingReminderQueue,
  getMorningDigestQueue,
  getReplyStyleQueue,
  getScheduleBlockQueue,
  getWeeklyDigestQueue,
} from "@/services/queue.server";

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
}

/**
 * Job states BullMQ will let us remove, across all six queues.
 *
 * `active` is deliberately absent: BullMQ refuses to remove a job that is
 * already being processed, and a rejected `remove()` would abort the whole
 * loop for the sake of a job that will finish on its own in seconds and find
 * no user row left to act on. There is no `paused` member of this version's
 * `JobType`, hence four entries rather than the five the Redis state names
 * suggest.
 */
const REMOVABLE_JOB_STATES = [
  "delayed",
  "waiting",
  "prioritized",
  "waiting-children",
] as const;

async function removeQueuedJobsFor(userId: string): Promise<number> {
  const queues = [
    getMorningDigestQueue(),
    getWeeklyDigestQueue(),
    getEmailReminderQueue(),
    getMeetingReminderQueue(),
    getScheduleBlockQueue(),
    getReplyStyleQueue(),
  ];

  let removed = 0;

  for (const queue of queues) {
    const jobs = await queue
      .getJobs([...REMOVABLE_JOB_STATES])
      .catch(() => []);

    for (const job of jobs) {
      if ((job.data as { userId?: string } | undefined)?.userId !== userId) {
        continue;
      }
      // Best effort: a job that cannot be removed (already claimed, or raced
      // into `active` between the listing and the call) must not stop the
      // remaining jobs or the account deletion itself from completing.
      await job.remove().catch(() => {});
      removed += 1;
    }
  }

  return removed;
}

/**
 * Revokes the stored Google token at Google's own endpoint.
 *
 * Must run before the `oauth_tokens` rows go: the refresh token is the thing
 * being revoked, and it is only readable while the row exists.
 *
 * Best effort on purpose. Google answers 400 for an already-revoked or
 * malformed token, and neither should strand the account in the database —
 * losing the ability to revoke is bad, but leaving the user unable to delete
 * their data is worse. Microsoft has no equivalent endpoint, which is why the
 * UI links to account.microsoft.com instead.
 */
async function revokeGoogleToken(userId: string): Promise<void> {
  try {
    const token = await prisma.oAuthToken.findFirst({
      where: { userId, provider: "GOOGLE" },
      orderBy: { createdAt: "desc" },
    });
    if (!token?.refreshToken) return;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return;

    const refreshToken = decrypt(token.refreshToken);

    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  } catch {
    // Swallowed: see the doc comment above.
  }
}

/**
 * Removes the caller's account, everything stored against it, their queued
 * jobs, and their Google grant — then signs them out.
 *
 * The typed confirmation is checked here rather than only in the client. A
 * disabled button is a hint, not a check; anyone who can post to a server
 * action can skip it, so the comparison has to happen server-side against the
 * one address that is actually correct.
 */
export async function deleteAccountAction(
  formData: FormData,
): Promise<DeleteAccountResult> {
  const user = await requireUser();

  const confirmed = String(formData.get("confirmedEmail") ?? "").trim();
  if (confirmed !== user.email) {
    return {
      ok: false,
      error: "That does not match the email address on this account.",
    };
  }

  await revokeGoogleToken(user.id);

  // Every one of the ten tables with a `userId` column, named by hand in
  // dependency-safe order rather than derived from the schema. The FK cascades
  // would already cover these — each relation is `onDelete: Cascade` — but
  // listing them keeps the scoping visible in review and forces a decision
  // when a new user-scoped table appears. Forgetting a cascade is silent data
  // retention, which is the one thing this button must not do. `user` goes
  // last so a failure anywhere above leaves a signed-in account rather than a
  // dangling row with no owner.
  await prisma.$transaction([
    prisma.emailSummary.deleteMany({ where: { userId: user.id } }),
    prisma.senderPreference.deleteMany({ where: { userId: user.id } }),
    prisma.jobFailure.deleteMany({ where: { userId: user.id } }),
    prisma.subscription.deleteMany({ where: { userId: user.id } }),
    prisma.meetingReminder.deleteMany({ where: { userId: user.id } }),
    prisma.meetingMinutes.deleteMany({ where: { userId: user.id } }),
    prisma.scheduleBlock.deleteMany({ where: { userId: user.id } }),
    prisma.replyFeedback.deleteMany({ where: { userId: user.id } }),
    prisma.replyStyleProfile.deleteMany({ where: { userId: user.id } }),
    prisma.oAuthToken.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  await removeQueuedJobsFor(user.id);

  const store = await cookies();
  store.delete(getSessionCookieName());

  redirect("/account-deleted");
}
