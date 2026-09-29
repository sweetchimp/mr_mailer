/**
 * Per-sender history, the personalization signal handed to the summarizer.
 *
 * Deliberately a plain module rather than `.server` so the tallying and the
 * sentence it produces can be unit tested without a Prisma mock — the
 * interesting behaviour is the aggregation, not the query.
 */

import type { Priority } from "@prisma/client";

/** Matches the `Status` enum in prisma/schema.prisma. */
export type SenderStatus = "PENDING" | "SENT" | "DISMISSED" | "SNOOZED";

export interface SenderHistory {
  address: string;
  /** Prior emails summarized from this sender. */
  total: number;
  high: number;
  medium: number;
  low: number;
  dismissed: number;
  /** From `SenderPreference`: dismissals of this sender's LOW-priority mail. */
  lowDismissals: number;
}

/** One row of the `groupBy(["senderAddress", "priority", "status"])` result. */
export interface SenderHistoryRow {
  senderAddress: string | null;
  priority: Priority;
  status: SenderStatus;
  _count: { _all: number };
}

export interface SenderPreferenceRow {
  senderAddress: string;
  lowDismissals: number;
}

/**
 * The fewest prior emails a sender needs before their history is worth a note.
 *
 * One prior message is a data point, not yet a pattern. Raise this to 2 if the
 * personalization ever reads like it is over-weighting a single stray
 * dismissal.
 */
export const SENDER_HISTORY_MIN_EMAILS = 1;

/**
 * Fold the grouped rows and preference rows into one entry per sender.
 *
 * Rows whose `senderAddress` is null predate that column and have no key to
 * group by, so they simply do not contribute — the same rule the schema
 * comment on `EmailSummary.senderAddress` records.
 */
export function buildSenderHistory(
  rows: SenderHistoryRow[],
  preferences: SenderPreferenceRow[],
): Map<string, SenderHistory> {
  const byAddress = new Map<string, SenderHistory>();

  const ensure = (address: string): SenderHistory => {
    let entry = byAddress.get(address);
    if (!entry) {
      entry = {
        address,
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
        dismissed: 0,
        lowDismissals: 0,
      };
      byAddress.set(address, entry);
    }
    return entry;
  };

  for (const row of rows) {
    if (!row.senderAddress) continue;
    const count = row._count?._all ?? 0;
    if (count === 0) continue;

    const entry = ensure(row.senderAddress);
    entry.total += count;
    if (row.priority === "HIGH") entry.high += count;
    else if (row.priority === "MEDIUM") entry.medium += count;
    else if (row.priority === "LOW") entry.low += count;
    if (row.status === "DISMISSED") entry.dismissed += count;
  }

  for (const preference of preferences) {
    ensure(preference.senderAddress).lowDismissals = preference.lowDismissals;
  }

  // Drop senders who never produced a summary and whose only trace is an
  // all-zero preference row; a note about them would carry no information.
  for (const [address, entry] of byAddress) {
    if (entry.total < SENDER_HISTORY_MIN_EMAILS && entry.lowDismissals === 0) {
      byAddress.delete(address);
    }
  }

  return byAddress;
}

/**
 * The one line injected into the prompt for a single email.
 *
 * Wording is load-bearing: it describes the user's past behaviour rather than
 * ruling on the current message, so the model treats it as a prior. Phrased as
 * a verdict ("this is LOW priority mail") it would pin a sender forever and
 * never re-classify mail whose contents have genuinely changed.
 */
export function describeSenderHistory(history: SenderHistory): string {
  const emails =
    history.total === 1 ? "1 past email" : `${history.total} past emails`;
  const breakdown = `${history.low} LOW, ${history.medium} MEDIUM, ${history.high} HIGH`;

  let sentence = `Sender history: this user has classified ${emails} from this sender as ${breakdown}`;
  if (history.dismissed > 0) {
    sentence += `, and dismissed ${history.dismissed} of them`;
  }

  return `${sentence}.`;
}
