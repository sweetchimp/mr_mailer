import type { Priority, Status } from "@prisma/client";

/**
 * The shape a bucket page hands to <EmailList>. Mirrors the fields the old
 * dashboard loaders projected out of EmailSummary.
 *
 * Note `id` is the provider's message id (EmailSummary.gmailMessageId), not
 * the row's own primary key — the mutation actions key off it, and it is what
 * the email provider APIs accept.
 */
export interface SummarizedEmail {
  id: string;
  subject: string;
  sender: string;
  /**
   * Normalized address, used to look up an unsubscribe suggestion. Null on rows
   * summarized before the column existed, and on any sender string we could not
   * parse an address out of.
   */
  senderAddress: string | null;
  /** The AI summary. The original implementation reused this as the card's
   *  "snippet", since EmailSummary does not persist the raw body. */
  snippet: string;
  date: string;
  summary: {
    priority: Priority;
    summaryText: string;
    suggestedReply: string | null;
  } | null;
  status: Status;
  snoozedUntil: string | null;
}

/** Slimmer projection for the read-only replied/history lists. */
export interface HistoryEmail {
  id: string;
  subject: string;
  sender: string;
  status: Status;
  date: string;
  /** The AI summary, so a search hit on it is visible in the result row. */
  summary: string;
}

/** Long enough for any real query, short enough to bound the LIKE escape. */
export const MAX_SEARCH_CHARS = 100;

/**
 * Cleans a raw `?q=` value, or returns null when there is nothing to search for.
 *
 * Returns null rather than an empty string for blank input so the caller can
 * spread a conditional into the query and get the no-search path exactly, rather
 * than a `contains: ""` that matches every row and looks like the filter is on.
 *
 * Collapses internal whitespace because a URL-encoded `"budget  review"` should
 * behave like the phrase a person typed, not two independent substrings.
 */
export function normalizeSearch(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;

  return collapsed.slice(0, MAX_SEARCH_CHARS);
}

export type EmailBucket =
  | "needs-reply"
  | "worth-a-glance"
  | "fyi"
  | "snoozed"
  | "replied"
  | "history";

export interface BucketCopy {
  kicker: string;
  empty: string;
  count: (n: number) => string;
}

export const BUCKET_COPY: Record<EmailBucket, BucketCopy> = {
  "needs-reply": {
    kicker: "Needs a reply",
    empty: "No high-priority emails waiting for a reply.",
    count: (n) =>
      `${n} email${n === 1 ? "" : "s"} waiting for your reply.`,
  },
  "worth-a-glance": {
    kicker: "Worth a glance",
    empty: "No medium-priority emails to review.",
    count: (n) => `${n} email${n === 1 ? "" : "s"} worth a look.`,
  },
  fyi: {
    kicker: "FYI",
    empty: "No low-priority emails to review.",
    count: (n) => `${n} FYI email${n === 1 ? "" : "s"}.`,
  },
  snoozed: {
    kicker: "Snoozed",
    empty: "No snoozed emails.",
    count: (n) => `${n} email${n === 1 ? "" : "s"} snoozed for later.`,
  },
  replied: {
    kicker: "Replied",
    empty: "No replied emails yet.",
    count: (n) => `${n} email${n === 1 ? "" : "s"} you've replied to.`,
  },
  history: {
    kicker: "History",
    empty: "No history yet.",
    count: (n) => `${n} email${n === 1 ? "" : "s"} in your archive.`,
  },
};
