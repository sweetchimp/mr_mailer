import type { Priority } from "@prisma/client";
import { prisma } from "../lib/prisma.server";
import { extractSenderName } from "../lib/sender";

/** Low-priority dismissals from one sender before we suggest unsubscribing. */
export const UNSUBSCRIBE_THRESHOLD = 5;

/**
 * Records one signal against a sender, if this dismissal is that signal.
 *
 * The rule is a conjunction — LOW *and* dismissed — and each half rules out a
 * different false positive:
 *
 * - A LOW email the user read is not evidence they want less of this sender.
 *   It only ever reached the FYI bucket because the model guessed it was
 *   unimportant; some of those guesses are wrong.
 * - A MEDIUM or HIGH email they dismissed is a decision about that one message,
 *   not about the sender. People dismiss the reply they already sent elsewhere.
 *
 * Idempotent via `alreadyDismissed`, which the caller reads off the row it has
 * already loaded. Without it a card dismiss racing a bulk dismiss would count
 * twice, and `Promise.all` over `dismissAction` in the bulk bar is exactly that
 * kind of race.
 */
export async function recordLowPriorityDismissal(params: {
  userId: string;
  sender: string;
  senderAddress: string | null;
  priority: Priority;
  alreadyDismissed: boolean;
}): Promise<boolean> {
  const { userId, sender, senderAddress, priority, alreadyDismissed } = params;

  if (alreadyDismissed) return false;
  if (priority !== "LOW") return false;
  if (!senderAddress) return false;

  const senderName = extractSenderName(sender);

  await prisma.senderPreference.upsert({
    where: { userId_senderAddress: { userId, senderAddress } },
    create: {
      userId,
      senderAddress,
      senderName,
      lowDismissals: 1,
    },
    update: {
      lowDismissals: { increment: 1 },
      // Senders rename themselves, and a banner reading a stale name is worse
      // than no banner. Omitted entirely when there is no name so it cannot
      // overwrite a good one with null.
      ...(senderName ? { senderName } : {}),
    },
  });

  return true;
}

export interface UnsubscribeNotice {
  senderName: string | null;
  count: number;
}

/**
 * Senders over the threshold whose suggestion has not been dismissed, keyed by
 * address for a card to look itself up.
 *
 * The `suggestionDismissedAt: null` filter is the whole reason this is a stored
 * row rather than a `groupBy` over the summaries — a derived count has nowhere
 * to record that the user already said no.
 */
export async function getUnsubscribeNotices(
  userId: string,
  threshold: number = UNSUBSCRIBE_THRESHOLD,
): Promise<Record<string, UnsubscribeNotice>> {
  const rows = await prisma.senderPreference.findMany({
    where: { userId, lowDismissals: { gte: threshold }, suggestionDismissedAt: null },
    select: { senderAddress: true, senderName: true, lowDismissals: true },
  });

  const notices: Record<string, UnsubscribeNotice> = {};
  for (const row of rows) {
    notices[row.senderAddress] = {
      senderName: row.senderName,
      count: row.lowDismissals,
    };
  }
  return notices;
}

/**
 * Marks a sender's suggestion as declined, forever.
 *
 * `updateMany` rather than `update` for the same reason `findOwnedSummary`
 * exists: the address arrives from the client, so the write has to be scoped by
 * `userId` in the query rather than trusted to match a row the caller owns. A
 * zero count simply means the row was already dismissed.
 */
export async function dismissSenderSuggestion(
  userId: string,
  senderAddress: string,
): Promise<{ dismissed: boolean }> {
  const { count } = await prisma.senderPreference.updateMany({
    where: { userId, senderAddress },
    data: { suggestionDismissedAt: new Date() },
  });

  return { dismissed: count > 0 };
}
