import {
  pluralizeEdits,
  summarizeEdits,
  type ReplyFeedbackEntry,
} from "@/lib/reply-insights";

/** A `getRecentReplyFeedback` row rendered as a stat. */
function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="flex-1 rounded-xl px-4 py-3"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.1em]"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          color: "var(--color-ink-faint)",
        }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[18px] font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        {value}
      </p>
    </div>
  );
}

function DeltaChip({
  symbol,
  value,
  tone,
}: {
  symbol: string;
  value: number;
  tone: string;
}) {
  return (
    <span
      className="rounded-full px-2 py-px text-[11px]"
      style={{ fontFamily: "var(--font-mono)", color: tone }}
    >
      {symbol}
      {value}
    </span>
  );
}

function ReplyColumn({
  heading,
  body,
  tone,
}: {
  heading: string;
  body: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p
        className="mb-1 text-[10px] uppercase tracking-[0.1em]"
        style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: tone }}
      >
        {heading}
      </p>
      <p
        className="text-sm whitespace-pre-wrap break-words"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
      >
        {body}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The side-by-side diff log.
 *
 * A server component: there is nothing to interact with. Each entry shows the
 * suggestion the model produced next to the text that actually went out, with
 * the per-entry character counts, so the pattern — add detail, cut hedging,
 * rewrite the opening — is visible without expanding anything.
 */
export function ReplyInsights({ entries }: { entries: ReplyFeedbackEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="mt-6 rounded-xl p-6 text-center"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
      >
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Nothing here yet. Edit an AI-suggested reply before sending it and the
          difference will show up on this page.
        </p>
      </div>
    );
  }

  const summary = summarizeEdits(entries);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <Stat label="Rewrites" value={summary.editCount} />
        <Stat label="Avg. chars added" value={summary.avgInsertions} />
        <Stat label="Avg. chars removed" value={summary.avgDeletions} />
        <Stat label="Avg. chars rewritten" value={summary.avgModifications} />
      </div>

      <p
        className="mt-3 text-[12px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        Most recent {pluralizeEdits(entries.length).toLowerCase()}.
      </p>

      <ul className="mt-4 space-y-3">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl p-4"
            style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                suppressHydrationWarning
                className="text-[11px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
              >
                {formatDate(entry.date)}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <DeltaChip
                  symbol="+"
                  value={entry.insertions}
                  tone="var(--color-priority-low-text)"
                />
                <DeltaChip
                  symbol="−"
                  value={entry.deletions}
                  tone="var(--color-priority-high-text)"
                />
                <DeltaChip
                  symbol="~"
                  value={entry.modifications}
                  tone="var(--color-ink-soft)"
                />
              </span>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
              <ReplyColumn
                heading="AI suggested"
                body={entry.generatedReply}
                tone="var(--color-ink-faint)"
              />
              <ReplyColumn
                heading="You sent"
                body={entry.finalReply}
                tone="var(--color-brand-blue)"
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
