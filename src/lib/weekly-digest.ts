/**
 * Read-side types, arithmetic, and formatting for the Sunday weekly summary.
 *
 * Kept out of `weekly-digest.server.ts` so the average and the email body can
 * be unit tested without a Prisma mock, and so the page can import the
 * formatter without pulling in the provider. Mirrors the split between
 * `reply-insights.ts` and `reply-feedback.server.ts`.
 */

export interface WeeklyStats {
  windowStart: string;
  windowEnd: string;
  /** Replies sent inside the window, counted by `sentAt`. */
  replied: number;
  /** Dismissals inside the window, counted by `dismissedAt`. */
  dismissed: number;
  /** Current backlog, not windowed — a pending email is pending now. */
  pendingHigh: number;
  pendingMedium: number;
  pendingLow: number;
  snoozed: number;
  /**
   * Mean of `sentAt - createdAt` over the replies in the window, or null when
   * there were none. Null rather than 0 because "you replied instantly" and
   * "we have no data" are not the same claim.
   */
  avgTimeToReplyMs: number | null;
  replySamples: number;
}

export const WEEKLY_SUBJECT = "Your week in the inbox";

/**
 * Mean reply latency, ignoring rows that cannot contribute.
 *
 * Two exclusions, both of which would otherwise drag the average toward zero and
 * make the number worse than saying nothing:
 *
 * - A null `sentAt` is a row that was never replied to inside the window.
 * - A negative delta means `sentAt` precedes `createdAt`. That should not happen
 *   — `createdAt` is stamped when the digest summarizes and the send comes later
 *   — but a row imported or re-summarized out of order would otherwise count as
 *   an instant reply.
 */
export function averageResponseTime(
  rows: { createdAt: Date; sentAt: Date | null }[],
): { avgTimeToReplyMs: number | null; replySamples: number } {
  let total = 0;
  let samples = 0;

  for (const row of rows) {
    if (!row.sentAt) continue;
    const delta = row.sentAt.getTime() - row.createdAt.getTime();
    if (delta < 0) continue;
    total += delta;
    samples += 1;
  }

  if (samples === 0) return { avgTimeToReplyMs: null, replySamples: 0 };
  return { avgTimeToReplyMs: Math.round(total / samples), replySamples: samples };
}

/** `4h 12m`, `38m`, `2d 3h`. Rounded to whole minutes — nobody needs seconds. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * `1 reply` / `12 replies`.
 *
 * The `-y` rule is handled rather than blind-appending `s`, which turned
 * "reply" into "replys" in the first draft — a wrong-looking number in an email
 * the user reads on a Sunday evening.
 */
function plural(n: number, word: string): string {
  if (n === 1) return `${n} ${word}`;
  const plural = word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n} ${plural}`;
}

/**
 * The plaintext body of the summary email.
 *
 * Plain text rather than HTML on purpose: this is a personal digest of the
 * user's own activity, a markup language is one more thing to escape, and every
 * mail client renders text/plain correctly.
 */
export function renderWeeklySummaryText(
  stats: WeeklyStats,
  firstName?: string | null,
): string {
  const greeting = firstName ? `Hi ${firstName} — here's your week.` : "Here's your week.";

  const lines = [
    greeting,
    "",
    "Handled",
    `  ${plural(stats.replied, "reply")} sent`,
    `  ${plural(stats.dismissed, "email")} dismissed`,
    "",
    "Still waiting",
    `  ${plural(stats.pendingHigh, "email")} needing a reply`,
    `  ${plural(stats.pendingMedium, "email")} worth a glance`,
    `  ${plural(stats.pendingLow, "email")} for your eyes only`,
    `  ${plural(stats.snoozed, "email")} snoozed`,
    "",
    "Time to reply",
    stats.avgTimeToReplyMs === null
      ? "  Not enough data yet — this appears after your first reply."
      : `  ${formatDuration(stats.avgTimeToReplyMs)} on average across ${plural(
          stats.replySamples,
          "reply",
        )}.`,
    "",
    "Full numbers: /weekly-summary",
  ];

  return lines.join("\n");
}
