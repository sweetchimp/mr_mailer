import { prisma } from "../lib/prisma.server";
import { computeReplyDiff } from "../lib/diff.server";
import type { StyleAnalysisSample } from "../lib/reply-style";

/**
 * Bounds an id before it reaches the database. Mirrors `findOwnedSummary` in
 * app/dashboard/actions.ts.
 */
const MAX_ID_CHARS = 512;

/**
 * How much history the style analyser reads. Sized against the prompt budget
 * rather than the database: each sample costs tokens twice (the suggested and
 * the sent text), so this is the knob that decides the model's cost per run.
 * Recent replies also matter more than old ones for a writing style, so a
 * bounded window loses very little.
 */
const DEFAULT_ANALYSIS_TAKE = 60;
const MAX_ANALYSIS_TAKE = 200;

/**
 * Records what the user did with an AI-suggested reply: kept it as written, or
 * rewrote it and by how much.
 *
 * `emailId` is the provider message id (`EmailSummary.gmailMessageId`), which is
 * what `ReplyFeedback.emailId` indexes and what the dashboard hands the client.
 * The column is deliberately not a foreign key: a feedback row is worthless once
 * the summary is cleaned up, and letting the summary cascade-delete it would
 * destroy exactly the history the style analyser learns from.
 *
 * Returns whether a row was written. The remaining early returns are defensive
 * rather than design:
 *
 * - No suggestion means there is nothing to compare against. The send UI only
 *   renders when `suggestedReply` is truthy, so this is mostly unreachable
 *   today, but the action is a public entry point that can be posted to
 *   directly.
 *
 * An unedited send used to be dropped here, on the reasoning that logging it
 * would bury real rewrites. That was right for a page counting average edit
 * size and wrong for a model learning a writing style: it removed every example
 * of a suggestion the user was *happy* with, so the only surviving evidence was
 * dissatisfaction. The style analyser needs both directions, so an unedited send
 * is now recorded with `accepted: true` and zero deltas — a positive example
 * that the suggestion was already right.
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

  const accepted = generated === final;
  // Only pay for a character diff when there is actually a difference. An
  // accepted send carries no edit information, and running the diff to
  // discover three zeroes on the hot send path is wasted work.
  const diff = accepted
    ? { insertions: 0, deletions: 0, modifications: 0 }
    : computeReplyDiff(generated, final);

  await prisma.replyFeedback.create({
    data: {
      userId,
      emailId,
      generatedReply: generated,
      finalReply: final,
      accepted,
      insertions: diff.insertions,
      deletions: diff.deletions,
      modifications: diff.modifications,
    },
  });

  return true;
}

/**
 * The user's most recent replies, for the background style analyser.
 *
 * Bounded to the newest window and ordered newest first, because the note is a
 * statement about how the user writes now: a habit that changed six months ago
 * is not what the next reply should sound like.
 */
export async function getRepliesForStyleAnalysis(
  userId: string,
  take: number = DEFAULT_ANALYSIS_TAKE,
): Promise<StyleAnalysisSample[]> {
  const limit = Math.min(Math.max(1, take), MAX_ANALYSIS_TAKE);

  const rows = await prisma.replyFeedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      emailId: true,
      generatedReply: true,
      finalReply: true,
      accepted: true,
      insertions: true,
      deletions: true,
      modifications: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) return [];

  // Resolved in a second query rather than through a Prisma `include`. There is
  // no relation field to traverse: `ReplyFeedback.emailId` points at an
  // `EmailSummary.id` by convention and nothing enforces it. A relation would
  // also drop the feedback row entirely if its summary had been cleaned up,
  // which would silently remove evidence of a reply the user actually sent.
  const summaries = await prisma.emailSummary.findMany({
    where: { id: { in: rows.map((row) => row.emailId) } },
    select: { id: true, subject: true, priority: true, senderAddress: true },
  });
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

  return rows.map((row) => {
    const summary = summaryById.get(row.emailId);
    return {
      id: row.id,
      suggested: row.generatedReply,
      sent: row.finalReply,
      accepted: row.accepted,
      insertions: row.insertions,
      deletions: row.deletions,
      modifications: row.modifications,
      sentAt: row.createdAt,
      subject: summary?.subject ?? null,
      priority: summary?.priority ?? null,
      senderAddress: summary?.senderAddress ?? null,
    };
  });
}
