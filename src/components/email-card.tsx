"use client";

import { useState, useTransition } from "react";
import {
  dismissAction,
  dismissUnsubscribeSuggestionAction,
  sendReplyAction,
  snoozeAction,
} from "@/app/dashboard/actions";
import type { SummarizedEmail } from "@/lib/email-view";
import { OriginalEmail } from "@/components/original-email";

const TONES = {
  HIGH: {
    bg: "var(--color-priority-high-bg)",
    text: "var(--color-priority-high-text)",
    line: "var(--color-priority-high-line)",
  },
  MEDIUM: {
    bg: "var(--color-priority-medium-bg)",
    text: "var(--color-priority-medium-text)",
    line: "var(--color-priority-medium-line)",
  },
  LOW: {
    bg: "var(--color-priority-low-bg)",
    text: "var(--color-priority-low-text)",
    line: "var(--color-priority-low-line)",
  },
} as const;

const SNOOZE_PRESETS: { label: string; at: () => Date }[] = [
  {
    label: "Later today",
    at: () => {
      const d = new Date();
      d.setHours(d.getHours() + 4);
      return d;
    },
  },
  {
    label: "Tomorrow 8am",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next week",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    },
  },
];

function SnoozeButton({
  emailId,
  disabled,
}: {
  emailId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [isPending, startTransition] = useTransition();

  const snooze = (date: Date) => {
    setOpen(false);
    startTransition(async () => {
      await snoozeAction(emailId, date.toISOString());
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className="btn btn-soft px-4 py-2 text-sm disabled:opacity-50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Snooze
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-52 rounded-lg py-1"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {SNOOZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => snooze(preset.at())}
              disabled={isPending}
              className="block w-full cursor-pointer px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-soft)]"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {preset.label}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--color-line)", margin: "4px 0" }} />
          <div className="px-4 py-2">
            <input
              type="datetime-local"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="w-full cursor-pointer rounded-md border p-1 text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-ink)",
                borderColor: "var(--color-line)",
                background: "var(--color-card)",
              }}
            />
            {custom && (
              <button
                type="button"
                onClick={() => snooze(new Date(custom))}
                disabled={isPending}
                className="btn btn-primary mt-2 w-full px-3 py-1.5 text-xs disabled:opacity-50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Set custom
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmailCard({
  email,
  selectable = false,
  selected = false,
  onToggleSelect,
  unsubscribeNotice = null,
}: {
  email: SummarizedEmail;
  /** Bulk-dismiss affordance. Only set on the Worth a glance and FYI buckets. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  unsubscribeNotice?: { senderName: string | null; count: number } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestionGone, setSuggestionGone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasReplied = email.status === "SENT";
  const priority = email.summary?.priority ?? "LOW";
  const tone = TONES[priority];
  const suggestedReply = email.summary?.suggestedReply ?? null;
  const effectiveReply = replyText || suggestedReply || "";

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setNotice(ok);
        setReplyText("");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  };

  const handleSend = () =>
    run(() => sendReplyAction(email.id, effectiveReply), "Reply sent!");

  const handleDismiss = () =>
    run(() => dismissAction(email.id), "Dismissed");

  // Hidden locally first so the banner disappears on tap; `revalidatePath` then
  // refetches the page. A failure re-renders from the server and brings it back.
  const showSuggestion = !!unsubscribeNotice && !suggestionGone;
  const dismissSuggestion = () => {
    if (!email.senderAddress) return;
    setSuggestionGone(true);
    startTransition(async () => {
      await dismissUnsubscribeSuggestionAction(email.senderAddress!);
    });
  };

  const dateLabel = email.date
    ? new Date(email.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="cursor-pointer transition-shadow"
      style={{
        background: "var(--color-card)",
        border: hasReplied
          ? "1px solid var(--color-priority-low-line)"
          : "1px solid var(--color-line)",
        borderLeft: hasReplied
          ? "3px solid var(--color-priority-low-line)"
          : "1px solid var(--color-line)",
        borderRadius: "10px",
        padding: expanded ? "20px" : "16px",
      }}
      onClick={expanded ? undefined : () => setExpanded(true)}
    >
      <div className="flex items-start justify-between gap-4">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(email.id)}
            // The collapsed card expands on any click (see the onClick on the
            // wrapper below), so without this every tick would also open the
            // card. Also the reason it is a sibling of the clickable area rather
            // than inside the header text.
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${email.subject}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
            style={{ accentColor: "var(--color-brand-blue)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="truncate text-[15px]"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                color: "var(--color-ink)",
              }}
            >
              {email.subject}
            </h3>
            {hasReplied && (
              <span
                className="inline-block shrink-0 rounded-full px-2 py-px text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  background: TONES.LOW.bg,
                  color: TONES.LOW.text,
                }}
              >
                Replied
              </span>
            )}
            {email.summary && (
              <span
                className="inline-block shrink-0 rounded-full px-2 py-px text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  background: tone.bg,
                  color: tone.text,
                }}
              >
                {email.summary.priority}
              </span>
            )}
          </div>

          <p
            className="mt-1 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            {email.sender}
          </p>

          {showSuggestion && unsubscribeNotice && (
            <div
              className="mb-3 rounded-r-md border-l-[3px] p-3"
              style={{ background: TONES.LOW.bg, borderLeftColor: TONES.LOW.line }}
            >
              <p
                className="text-sm"
                style={{ fontFamily: "var(--font-body)", color: TONES.LOW.text }}
              >
                You&apos;ve dismissed {unsubscribeNotice.count} low-priority{" "}
                {unsubscribeNotice.count === 1 ? "email" : "emails"} from{" "}
                {unsubscribeNotice.senderName ?? email.senderAddress}. Consider
                unsubscribing.
              </p>
              <button
                type="button"
                onClick={dismissSuggestion}
                disabled={isPending}
                className="btn btn-link mt-1 text-xs"
                style={{ fontFamily: "var(--font-body)", color: TONES.LOW.text }}
              >
                Don&apos;t show this again
              </button>
            </div>
          )}

          {email.summary ? (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{ background: tone.bg, borderLeftColor: tone.line }}
            >
              <p
                className="mb-1 text-[10px] uppercase tracking-[0.1em]"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  color: tone.text,
                }}
              >
                AI summary
              </p>
              <p className="text-sm font-bold" style={{ color: tone.text }}>
                {email.summary.summaryText}
              </p>
            </div>
          ) : (
            <p
              className="mt-3 line-clamp-2 text-sm"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
            >
              {email.snippet}
            </p>
          )}

          {!expanded && suggestedReply && (
            // A real button rather than styled text. This used to be a bare
            // <p> with no handler of its own: it looked like a link, but the
            // only thing that responded was the card wrapper's onClick, so
            // "View & Reply" did exactly one thing — expand the card to the
            // reply box — and showed no email at all. Now the label does what
            // it says, and is reachable by keyboard.
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
              className="mt-2 text-xs font-medium"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-brand-blue)" }}
            >
              View &amp; reply &rarr;
            </button>
          )}
        </div>

        {dateLabel && (
          <span
            // Rendered on the server and again on the client, in whatever
            // timezone each happens to be in.
            suppressHydrationWarning
            className="shrink-0 text-[11px] whitespace-nowrap"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            {dateLabel}
          </span>
        )}
      </div>

      {expanded && (
        <div
          className="mt-4"
          style={{ borderTop: "1px solid var(--color-line)", paddingTop: "16px" }}
          onClick={(event) => event.stopPropagation()}
        >
          <OriginalEmail emailId={email.id} snippet={email.snippet} />

          {suggestedReply && (
            <div className="mb-3">
              <p
                className="mb-1 text-[10px] uppercase tracking-[0.1em]"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  color: "var(--color-ink-faint)",
                }}
              >
                Your reply
              </p>
              <textarea
                value={effectiveReply}
                onChange={(event) => setReplyText(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-md p-3 text-sm focus:outline-none focus:ring-2"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line)",
                  background: "var(--color-card)",
                  ["--tw-ring-color" as string]: "var(--color-brand-blue)",
                }}
              />
            </div>
          )}

          {/* Sibling buttons, not nested forms — the old markup nested a
              dismiss form and a snooze dropdown inside the send form, which is
              invalid HTML React only tolerated. */}
          <div className="flex flex-wrap items-center gap-3">
            {suggestedReply && (
              <button
                type="button"
                onClick={handleSend}
                disabled={isPending || !effectiveReply.trim()}
                className="btn btn-primary px-5 py-2 text-sm disabled:opacity-50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {isPending ? "Sending…" : "Send reply"}
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="btn btn-soft px-5 py-2 text-sm disabled:opacity-50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Dismiss
            </button>

            <SnoozeButton emailId={email.id} disabled={isPending} />

            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="btn btn-link text-xs"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Collapse
            </button>
          </div>

          {notice && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: TONES.LOW.bg,
                borderLeftColor: TONES.LOW.line,
              }}
            >
              <p className="text-sm font-medium" style={{ color: TONES.LOW.text }}>
                {notice}
              </p>
            </div>
          )}

          {error && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: TONES.HIGH.bg,
                borderLeftColor: TONES.HIGH.line,
              }}
            >
              <p className="text-sm font-medium" style={{ color: TONES.HIGH.text }}>
                {error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
