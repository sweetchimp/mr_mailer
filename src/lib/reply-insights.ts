/**
 * Read-side types and arithmetic for the reply-learning feature.
 *
 * Kept out of `reply-feedback.server.ts` so the aggregation can be unit tested
 * without standing up a Prisma mock, and so the page component can import the
 * row shape without reaching into a `.server` module. Mirrors the split between
 * `minutes-view.ts` and `minutes.server.ts`.
 */

export interface ReplyFeedbackEntry {
  id: string;
  /** The provider message id — `EmailSummary.gmailMessageId`. */
  emailId: string;
  generatedReply: string;
  finalReply: string;
  insertions: number;
  deletions: number;
  modifications: number;
  date: string;
}

/** The three character-level counts `computeReplyDiff` produces. */
export interface ReplyEdit {
  insertions: number;
  deletions: number;
  modifications: number;
}

export interface ReplyEditSummary {
  editCount: number;
  avgInsertions: number;
  avgDeletions: number;
  avgModifications: number;
}

/**
 * Mean edit size across the captured replies.
 *
 * Averaged rather than summed because the interesting number is "how much do
 * you rewrite a suggestion on a typical send", and a sum would grow with the
 * list length and say nothing about per-edit behaviour. Rounded because a
 * fractional character is not a thing, and the header renders this as a stat.
 */
export function summarizeEdits(edits: ReplyEdit[]): ReplyEditSummary {
  if (edits.length === 0) {
    return {
      editCount: 0,
      avgInsertions: 0,
      avgDeletions: 0,
      avgModifications: 0,
    };
  }

  const total = edits.reduce(
    (acc, edit) => ({
      insertions: acc.insertions + edit.insertions,
      deletions: acc.deletions + edit.deletions,
      modifications: acc.modifications + edit.modifications,
    }),
    { insertions: 0, deletions: 0, modifications: 0 },
  );

  return {
    editCount: edits.length,
    avgInsertions: Math.round(total.insertions / edits.length),
    avgDeletions: Math.round(total.deletions / edits.length),
    avgModifications: Math.round(total.modifications / edits.length),
  };
}

export function pluralizeEdits(count: number): string {
  return count === 1 ? "1 edited reply" : `${count} edited replies`;
}
