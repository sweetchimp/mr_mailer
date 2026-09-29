"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma.server";
import { requireUser } from "@/lib/current-session.server";
import { hasManualDigestInFlight, manualDigestJobName } from "@/lib/manual-digest";
import { getEmailProvider } from "@/services/email-provider.server";
import { recordReplyFeedback } from "@/services/reply-feedback.server";
import { dismissSenderSuggestion, recordLowPriorityDismissal } from "@/services/sender-preference.server";
import {
  getEmailReminderQueue,
  getMorningDigestQueue,
} from "@/services/queue.server";

const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REPLY_CHARS = 20_000;

export interface ActionResult {
  ok: boolean;
  intent: "refresh" | "send" | "dismiss" | "snooze" | "dismiss-suggestion";
  emailId?: string;
  senderAddress?: string;
  error?: string;
}

function fail(
  intent: ActionResult["intent"],
  error: string,
  emailId?: string,
  senderAddress?: string,
): ActionResult {
  return { ok: false, intent, error, emailId, senderAddress };
}

/**
 * Looks up a summary and proves it belongs to the caller.
 *
 * The old /api/emails/:id/send action skipped this entirely, so any
 * authenticated user could POST an arbitrary message id and have the app send
 * mail from the victim's mailbox. Every mutating action goes through here.
 */
async function findOwnedSummary(userId: string, emailId: string) {
  if (!emailId || emailId.length > 512) return null;
  return prisma.emailSummary.findFirst({
    where: { gmailMessageId: emailId, userId },
  });
}

function refreshDashboard() {
  revalidatePath("/dashboard", "layout");
}

export async function refreshDigestAction(): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const queue = getMorningDigestQueue();

    // Do NOT pin a jobId here. A fixed `manual-digest-<userId>` occupies the id
    // for as long as the finished job is retained (`removeOnComplete: 20`), and
    // BullMQ silently drops an add whose jobId already exists. That made every
    // Refresh click after the first a no-op that still answered `{ ok: true }`,
    // so the dashboard appeared to ignore the user entirely.
    const inFlight = await queue.getJobs(["waiting", "active"]);

    if (!hasManualDigestInFlight(inFlight, user.id)) {
      await queue.add(
        manualDigestJobName(user.id),
        { userId: user.id },
        { removeOnComplete: 20, removeOnFail: 20 },
      );
    }

    return { ok: true, intent: "refresh" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await prisma.jobFailure
      .create({
        data: {
          userId: user.id,
          jobType: "morning-digest",
          step: "queue",
          errorMessage,
          context: JSON.stringify({
            source: "manual-refresh",
            timestamp: new Date().toISOString(),
          }),
        },
      })
      .catch(() => {});

    return fail("refresh", errorMessage);
  }
}

export async function sendReplyAction(
  emailId: string,
  replyText: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const text = (replyText ?? "").trim();
  if (!text) return fail("send", "Missing required fields", emailId);
  if (text.length > MAX_REPLY_CHARS) {
    return fail("send", "Reply is too long to send.", emailId);
  }

  const summary = await findOwnedSummary(user.id, emailId);
  if (!summary) return fail("send", "Summary not found", emailId);

  try {
    const provider = await getEmailProvider(user.id);
    await provider.sendReply(user.id, summary.gmailMessageId, text);

    await prisma.emailSummary.update({
      where: { id: summary.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    // The message is already accepted by the provider at this point, so a
    // failed feedback write must not turn a delivered reply into an error the
    // user answers by sending again.
    await recordReplyFeedback({
      userId: user.id,
      emailId: summary.gmailMessageId,
      suggestedReply: summary.suggestedReply,
      finalReply: text,
    }).catch(() => {});

    refreshDashboard();
    return { ok: true, intent: "send", emailId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return fail("send", errorMessage, emailId);
  }
}

export async function dismissAction(emailId: string): Promise<ActionResult> {
  const user = await requireUser();

  const summary = await findOwnedSummary(user.id, emailId);
  if (!summary) return fail("dismiss", "Summary not found", emailId);

  try {
    await prisma.emailSummary.update({
      where: { id: summary.id },
      // Clear snoozedUntil too: leaving it set left a stale "reminds you at"
      // timestamp on an email that is no longer snoozed. dismissedAt is the
      // handling timestamp the weekly summary counts against.
      data: { status: "DISMISSED", snoozedUntil: null, dismissedAt: new Date() },
    });

    // The email is already dismissed at this point, so a failure to record the
    // sender signal must not turn the action into an error the user retries.
    await recordLowPriorityDismissal({
      userId: user.id,
      sender: summary.sender,
      senderAddress: summary.senderAddress,
      priority: summary.priority,
      alreadyDismissed: summary.status === "DISMISSED",
    }).catch(() => {});

    refreshDashboard();
    return { ok: true, intent: "dismiss", emailId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return fail("dismiss", errorMessage, emailId);
  }
}

/**
 * Declines the "consider unsubscribing" banner for one sender, permanently.
 *
 * Scoped by `userId` inside the query rather than matched on a unique key alone,
 * because the address comes from the client.
 */
export async function dismissUnsubscribeSuggestionAction(
  senderAddress: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const address = (senderAddress ?? "").trim();
  if (!address || address.length > 320) {
    return fail("dismiss-suggestion", "Invalid sender", senderAddress);
  }

  try {
    await dismissSenderSuggestion(user.id, address);

    refreshDashboard();
    return { ok: true, intent: "dismiss-suggestion", senderAddress: address };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return fail("dismiss-suggestion", errorMessage, undefined, address);
  }
}

/** `snoozedUntil` of null means "cancel the snooze". */
export async function snoozeAction(
  emailId: string,
  snoozedUntil: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  const summary = await findOwnedSummary(user.id, emailId);
  if (!summary) return fail("snooze", "Summary not found", emailId);

  const jobId = `snooze-${summary.gmailMessageId}`;

  if (snoozedUntil === null) {
    try {
      await prisma.emailSummary.update({
        where: { id: summary.id },
        data: { status: "PENDING", snoozedUntil: null },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return fail("snooze", errorMessage, emailId);
    }

    // The job may be gone already, or may have already fired.
    await getEmailReminderQueue().remove(jobId).catch(() => {});

    refreshDashboard();
    return { ok: true, intent: "snooze", emailId };
  }

  const target = new Date(snoozedUntil);
  const now = Date.now();
  if (Number.isNaN(target.getTime())) {
    return fail("snooze", "Invalid snooze time", emailId);
  }
  if (target.getTime() <= now) {
    return fail("snooze", "Invalid snooze time", emailId);
  }
  if (target.getTime() - now > MAX_SNOOZE_MS) {
    return fail("snooze", "Snoozed emails can only be deferred up to 30 days", emailId);
  }

  try {
    await prisma.emailSummary.update({
      where: { id: summary.id },
      data: { status: "SNOOZED", snoozedUntil: target },
    });

    // Replace any prior reminder for this email: BullMQ treats a repeated jobId
    // as a duplicate no-op, so re-snoozing would otherwise keep the old timer.
    const reminderQueue = getEmailReminderQueue();
    await reminderQueue.remove(jobId).catch(() => {});
    await reminderQueue.add(
      jobId,
      {
        emailId: summary.gmailMessageId,
        userId: user.id,
        subject: summary.subject,
        sender: summary.sender,
      },
      {
        jobId,
        delay: target.getTime() - now,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );

    refreshDashboard();
    return { ok: true, intent: "snooze", emailId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return fail("snooze", errorMessage, emailId);
  }
}
