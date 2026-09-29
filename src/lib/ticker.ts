/**
 * Builds the dashboard activity ticker from real rows.
 *
 * A plain module rather than `.server` so the ordering, labelling and cap can
 * be unit tested without a database. The time formatter is injected rather
 * than imported so the output is deterministic in tests and stays decoupled
 * from the server's timezone helper.
 */

import type { Priority } from "@prisma/client";

export type TickerKind = "meeting" | "snooze" | "reply" | "email";

export interface TickerItem {
  id: string;
  kind: TickerKind;
  text: string;
}

export interface TickerInput {
  meetings: { eventId: string; title: string; startTime: Date }[];
  snoozes: { id: string; subject: string; snoozedUntil: Date }[];
  replies: { id: string; subject: string; sentAt: Date }[];
  emails: { id: string; subject: string; priority: Priority }[];
}

/** Enough to feel alive without turning the bar into a wall of text. */
export const MAX_TICKER_ITEMS = 8;

const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: "Needs a reply",
  MEDIUM: "Worth a glance",
  LOW: "FYI",
};

export function buildTickerItems(
  input: TickerInput,
  formatTime: (value: Date) => string,
): TickerItem[] {
  const items: TickerItem[] = [];

  for (const meeting of input.meetings) {
    items.push({
      id: `meeting:${meeting.eventId}`,
      kind: "meeting",
      text: `Meeting ${formatTime(meeting.startTime)} · ${meeting.title}`,
    });
  }

  for (const snooze of input.snoozes) {
    items.push({
      id: `snooze:${snooze.id}`,
      kind: "snooze",
      text: `Reminder due · ${snooze.subject}`,
    });
  }

  for (const reply of input.replies) {
    items.push({
      id: `reply:${reply.id}`,
      kind: "reply",
      text: `Replied · ${reply.subject}`,
    });
  }

  for (const email of input.emails) {
    items.push({
      id: `email:${email.id}`,
      kind: "email",
      text: `${PRIORITY_LABEL[email.priority]} · ${email.subject}`,
    });
  }

  return items.slice(0, MAX_TICKER_ITEMS);
}
