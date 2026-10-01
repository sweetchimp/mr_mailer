import { requireUser } from "@/lib/current-session.server";
import {
  getAverageReplyTime,
  getDashboardCounts,
  getLatestSummarizationFailure,
  getProviderForUser,
  getTodaysHandledCounts,
} from "@/services/dashboard.server";
import { getCachedTodaysMeetings } from "@/services/meetings.server";
import { formatLocalTime } from "@/lib/date.server";
import { StatTile } from "@/components/stat-tile";
import { DiveTile } from "@/components/dive-tile";
import { ProgressRing } from "@/components/progress-ring";

export default async function DashboardIndex() {
  const user = await requireUser();

  const tokenRevoked = !!user.tokenRevokedAt;

  // Meetings come from the `MeetingReminder` table, not from Calendar. The
  // worker refreshes it on a schedule and on sign-in, so this is one indexed
  // query instead of a live API call in the render path — the difference between
  // a dashboard that renders as fast as its own queries and one that waits on
  // Google. A revoked token skips it: the rows would be months old, and showing
  // yesterday's meetings as "today's" is worse than showing none.
  const [counts, provider, aiFailure, handled, avgReply, meetings] =
    await Promise.all([
      getDashboardCounts(user.id),
      getProviderForUser(user.id),
      getLatestSummarizationFailure(user.id),
      getTodaysHandledCounts(user.id),
      getAverageReplyTime(user.id),
      tokenRevoked
        ? Promise.resolve([])
        : getCachedTodaysMeetings(user.id).catch((error) => {
            // Logged rather than swallowed silently, so an empty panel can be
            // told apart from "no meetings".
            console.warn(
              `[dashboard] meetings panel unavailable for user ${user.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return [];
          }),
    ]);

  const total =
    counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      {aiFailure && total === 0 && (
        <p
          className="mb-4 text-center text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-danger)" }}
        >
          AI summarization is failing, so nothing could be filed.{" "}
          {aiFailure.errorMessage} &mdash; press Refresh to retry.
        </p>
      )}

      {total === 0 && !aiFailure && (
        <p
          className="mb-4 text-center text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Nothing here yet &mdash; press Refresh now to fetch your inbox.
        </p>
      )}

      <section
        className="rounded-2xl p-6"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div className="flex flex-wrap items-center justify-center gap-8 sm:justify-between">
          <ProgressRing value={handled.handled} total={handled.total} />

          <div className="flex gap-8">
            <SummaryStat
              label="Avg reply time"
              value={avgReply.label ?? "\u2014"}
              note={
                avgReply.samples > 0
                  ? `across ${avgReply.samples} ${avgReply.samples === 1 ? "reply" : "replies"}`
                  : "no replies yet"
              }
            />
            <SummaryStat
              label="Meetings today"
              value={String(meetings.length)}
              note={meetings.length === 0 ? "calendar is clear" : "on your calendar"}
            />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2
          className="text-[20px] font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
        >
          Let&apos;s dive in
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <DiveTile
            href="/dashboard/needs-reply"
            label="Needs a reply"
            count={counts.high}
            hint="Urgent, needs you"
            tone="high"
          />
          <DiveTile
            href="/dashboard/worth-a-glance"
            label="Worth a glance"
            count={counts.medium}
            hint="Not urgent, but relevant"
            tone="medium"
          />
          <DiveTile
            href="/dashboard/fyi"
            label="FYI"
            count={counts.low}
            hint="Read-only updates"
            tone="low"
          />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <StatTile label="Replied" value={counts.replied} href="/dashboard/replied" />
        <StatTile label="Snoozed" value={counts.snoozed} href="/dashboard/snoozed" />
        <StatTile label="History" value={counts.history} href="/dashboard/history" />
      </section>

      <section className="mt-8">
        <h2
          className="text-[13px] font-medium uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          Today&apos;s Meetings
        </h2>

        {provider !== "GOOGLE" ? (
          <p
            className="mt-3 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            Calendar sync is available for Google accounts.
          </p>
        ) : meetings.length === 0 ? (
          <p
            className="mt-3 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            No meetings on your calendar today.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {meetings.map((meeting) => (
              <li
                key={meeting.eventId}
                className="flex items-center gap-4 rounded-xl p-4"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                }}
              >
                <span
                  className="shrink-0 text-[12px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
                >
                  {formatLocalTime(meeting.startTime)}
                </span>
                <span
                  className="truncate text-sm font-medium"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  {meeting.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SummaryStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <p
        className="text-[11px] uppercase tracking-[0.14em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-[26px] font-semibold leading-none"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        {value}
      </p>
      <p
        className="mt-1 text-[11px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        {note}
      </p>
    </div>
  );
}
