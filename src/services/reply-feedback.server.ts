import { prisma } from "../lib/prisma.server";
import { computeReplyDiff } from "../lib/diff.server";
import type { ReplyFeedbackEntry } from "../lib/reply-insights";

/**
 * Bounds an id before it reaches the database. Mirrors `findOwnedSummary` in
 * app/dashboard/actions.ts.
 */
const MAX_ID_CHARS = 512;

/** Enough rows to show a habit without turning the page into a log. */
const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

/**
 * Records how much the user rewrote an AI-suggested reply before sending.
 *
 * `emailId` is the provider message id (`EmailSummary.gmailMessageId`), which is
 * what `ReplyFeedback.emailId` indexes and what the dashboard hands the client.
 * The column is deliberately not a foreign key: a feedback row is worthless once
 * the summary is cleaned up, and letting the summary cascade-delete it would
 * destroy exactly the history this page exists to show.
 *
 * Returns whether a row was written. The two early returns are the whole point
 * of the feature rather than defensive noise:
 *
 * - No suggestion means there is nothing to compare against. The send UI only
 *   renders when `suggestedReply` is truthy, so this is mostly unreachable
 *   today, but the action is a public entry point that can be posted to
 *   directly.
 * - An unedited send is not a learning signal. Logging it would bury the real
 *   rewrites under however many replies the user accepted verbatim, and the
 *   average edit size on the page would decay toward zero for reasons that have
 *   nothing to do with how the user writes.
 */
export async function recordReplyFeedback(params: {
  userId: string;
  emailId: string;
  suggestedReply: string | null;
  finalReply: string;
}): Promise<boolean> {
  const { userId, emailId, suggestedReply, finalReply } = params;

  const generated = (suggestedReply ?? "").trim();
  const final = (finalReply ?? "").trim();

  if (!emailId || emailId.length > MAX_ID_CHARS) return false;
  if (!generated) return false;
  if (generated === final) return false;

  const diff = computeReplyDiff(generated, final);

  await prisma.replyFeedback.create({
    data: {
      userId,
      emailId,
      generatedReply: generated,
      finalReply: final,
      insertions: diff.insertions,
      deletions: diff.deletions,
      modifications: diff.modifications,
    },
  });

  return true;
}

/**
 * This user's most recent reply edits, newest first.
 *
 * Scoped by `userId` in the query rather than filtered after the fetch, matching
 * `getMinutesForUser`. A caller never has to reason about rows that belong to
 * someone else.
 */
export async function getRecentReplyFeedback(
  userId: string,
  take: number = DEFAULT_TAKE,
): Promise<ReplyFeedbackEntry[]> {
  const limit = Math.min(Math.max(1, take), MAX_TAKE);

  const rows = await prisma.replyFeedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      emailId: true,
      generatedReply: true,
      finalReply: true,
      insertions: true,
      deletions: true,
      modifications: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    emailId: row.emailId,
    generatedReply: row.generatedReply,
    finalReply: row.finalReply,
    insertions: row.insertions,
    deletions: row.deletions,
    modifications: row.modifications,
    date: row.createdAt.toISOString(),
  }));
}
