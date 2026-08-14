import { useState } from "react";
import { useFetcher } from "react-router";

export interface SummarizedEmail {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  sender: string;
  snippet: string;
  date: string;
  summary: {
    priority: "HIGH" | "MEDIUM" | "LOW";
    summaryText: string;
    suggestedReply: string | null;
    actionRequired: boolean;
  } | null;
  status: string;
  snoozedUntil: string | null;
}

export function SnoozeButton({
  emailId,
  snoozeFetcher,
}: {
  emailId: string;
  snoozeFetcher: ReturnType<typeof useFetcher>;
}) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");

  const presets = [
    { label: "Later today", date: () => { const d = new Date(); d.setHours(d.getHours() + 4); return d; } },
    { label: "Tomorrow 8am", date: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; } },
    { label: "Next week", date: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; } },
  ];

  const submit = (date: Date) => {
    snoozeFetcher.submit(
      { intent: "snooze", snoozedUntil: date.toISOString() },
      { method: "post", action: `/api/emails/${emailId}/snooze` },
    );
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="btn btn-soft px-4 py-2 text-sm"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Snooze
      </button>
      {open && (
        <div
          className="absolute left-0 z-10 mt-1 w-52 rounded-lg py-1"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => submit(p.date())}
              className="block w-full cursor-pointer px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-soft)]"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-ink)",
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--color-line)", margin: "4px 0" }} />
          <div className="px-4 py-2">
            <input
              type="datetime-local"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full cursor-pointer rounded-md border p-1 text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-ink)",
                borderColor: "var(--color-line)",
              }}
            />
            {customDate && (
              <button
                type="button"
                onClick={() => submit(new Date(customDate))}
                className="btn btn-primary mt-2 w-full px-3 py-1.5 text-xs"
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
  isExpanded,
  onToggle,
  sendFetcher,
  dismissFetcher,
  snoozeFetcher,
  replyText,
  onReplyChange,
}: {
  email: SummarizedEmail;
  isExpanded: boolean;
  onToggle: () => void;
  sendFetcher: ReturnType<typeof useFetcher>;
  dismissFetcher: ReturnType<typeof useFetcher>;
  snoozeFetcher: ReturnType<typeof useFetcher>;
  replyText: string;
  onReplyChange: (text: string) => void;
}) {
  const hasReplied = email.status === "SENT";
  const priority = email.summary?.priority ?? "LOW";

  const pillBg =
    priority === "HIGH"
      ? "var(--color-priority-high-bg)"
      : priority === "MEDIUM"
        ? "var(--color-priority-medium-bg)"
        : "var(--color-priority-low-bg)";
  const pillText =
    priority === "HIGH"
      ? "var(--color-priority-high-text)"
      : priority === "MEDIUM"
        ? "var(--color-priority-medium-text)"
        : "var(--color-priority-low-text)";

  const summaryBg =
    priority === "HIGH"
      ? "var(--color-priority-high-bg)"
      : priority === "MEDIUM"
        ? "var(--color-priority-medium-bg)"
        : "var(--color-priority-low-bg)";
  const summaryText =
    priority === "HIGH"
      ? "var(--color-priority-high-text)"
      : priority === "MEDIUM"
        ? "var(--color-priority-medium-text)"
        : "var(--color-priority-low-text)";
  const summaryLine =
    priority === "HIGH"
      ? "var(--color-priority-high-line)"
      : priority === "MEDIUM"
        ? "var(--color-priority-medium-line)"
        : "var(--color-priority-low-line)";

  const sendData = sendFetcher.data as { success?: boolean; error?: string } | undefined;
  const dismissData = dismissFetcher.data as { success?: boolean } | undefined;
  const isSent = sendData?.success === true;
  const sendError =
    sendData?.success === false ? sendData.error : null;
  const isDismissed = dismissData?.success === true;

  const isThisCardSending =
    sendFetcher.state !== "idle" &&
    sendFetcher.formData?.get("intent") === "send";

  const formattedDate = email.date
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
        padding: isExpanded ? "20px" : "16px",
      }}
      onClick={isExpanded ? undefined : onToggle}
    >
      {/* Collapsed header */}
      <div className="flex items-start justify-between gap-4">
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
                  background: "var(--color-priority-low-bg)",
                  color: "var(--color-priority-low-text)",
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
                  background: pillBg,
                  color: pillText,
                }}
              >
                {email.summary.priority}
              </span>
            )}
          </div>
          <p
            className="mt-1 text-sm"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-ink-faint)",
            }}
          >
            {email.sender}
          </p>

          {email.summary && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: summaryBg,
                borderLeftColor: summaryLine,
              }}
            >
              <p
                className="mb-1 text-[10px] uppercase tracking-[0.1em]"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  color: summaryText,
                }}
              >
                AI summary
              </p>
              <p
                className="text-sm font-bold"
                style={{ color: summaryText }}
              >
                {email.summary.summaryText}
              </p>
            </div>
          )}

          {!isExpanded && (
            <p
              className="mt-2 line-clamp-2 text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-ink-soft)",
              }}
            >
              {email.snippet}
            </p>
          )}

          {!isExpanded && email.summary?.suggestedReply && (
            <p
              className="mt-2 text-xs font-medium"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-brand-blue)",
              }}
            >
              View &amp; Reply &rarr;
            </p>
          )}
        </div>

        {formattedDate && (
          <span
            className="shrink-0 text-[11px] whitespace-nowrap"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-ink-faint)",
            }}
          >
            {formattedDate}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "16px" }}>
          <div className="mb-4">
            <p
              className="mb-1 text-[10px] uppercase tracking-[0.1em]"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--color-ink-faint)",
              }}
            >
              Original email
            </p>
            <p
              className="whitespace-pre-wrap text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-ink-soft)",
              }}
            >
              {email.snippet}
            </p>
          </div>

          {email.summary?.suggestedReply && !isDismissed && (
            <sendFetcher.Form
              method="post"
              action={`/api/emails/${email.id}/send`}
              onClick={(e) => e.stopPropagation()}
            >
              <input type="hidden" name="intent" value="send" />
              <input
                type="hidden"
                name="replyText"
                value={replyText || email.summary.suggestedReply}
              />
              <input type="hidden" name="senderEmail" value={email.sender} />
              <input type="hidden" name="subject" value={email.subject} />
              <input type="hidden" name="threadId" value={email.threadId} />
              <input type="hidden" name="messageId" value={email.messageId} />

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
                  value={replyText || email.summary.suggestedReply}
                  onChange={(e) => onReplyChange(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-md p-3 text-sm focus:outline-none focus:ring-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "var(--color-ink)",
                    border: "1px solid var(--color-line)",
                    background: "var(--color-card)",
                    ["--tw-ring-color" as string]: "var(--color-brand-blue)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isThisCardSending}
                  className="btn btn-primary px-5 py-2 text-sm disabled:opacity-50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {isThisCardSending ? "Sending..." : "Send reply"}
                </button>

                <dismissFetcher.Form
                  method="post"
                  action={`/api/emails/${email.id}/dismiss`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input type="hidden" name="intent" value="dismiss" />
                  <button
                    type="submit"
                    className="btn btn-soft px-5 py-2 text-sm"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Dismiss
                  </button>
                </dismissFetcher.Form>

                <SnoozeButton emailId={email.id} snoozeFetcher={snoozeFetcher} />
              </div>
            </sendFetcher.Form>
          )}

          {isSent && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: "var(--color-priority-low-bg)",
                borderLeftColor: "var(--color-priority-low-line)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-priority-low-text)" }}
              >
                Reply sent!
              </p>
            </div>
          )}

          {sendError && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: "var(--color-priority-high-bg)",
                borderLeftColor: "var(--color-priority-high-line)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-priority-high-text)" }}
              >
                Failed to send: {sendError}
              </p>
            </div>
          )}

          {!sendError && !isDismissed && email.summary?.suggestedReply && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="btn btn-link mt-3 text-xs"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Collapse
            </button>
          )}

          {isDismissed && (
            <div
              className="mt-3 rounded-r-md border-l-[3px] p-3"
              style={{
                background: "var(--color-line)",
                borderLeftColor: "var(--color-ink-faint)",
              }}
            >
              <p
                className="text-sm"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-ink-soft)",
                }}
              >
                Dismissed
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
