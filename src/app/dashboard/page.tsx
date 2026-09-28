import { requireUser } from "@/lib/current-session.server";
import {
  getDashboardCounts,
  getLatestSummarizationFailure,
  getProviderForUser,
} from "@/services/dashboard.server";
import { getTodaysEvents } from "@/services/calendar.server";
import { StatTile } from "@/components/stat-tile";

export default async function DashboardIndex() {
  const user = await requireUser();

  const [counts, provider, aiFailure] = await Promise.all([
    getDashboardCounts(user.id),
    getProviderForUser(user.id),
    getLatestSummarizationFailure(user.id),
  ]);

  const tokenRevoked = !!user.tokenRevokedAt;

  let meetings: { eventId: string; title: string; startTime: string }[] = [];
  if (!tokenRevoked) {
    try {
      const events = await getTodaysEvents(user.id);
      meetings = events.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        startTime: event.startTime.toISOString(),
      }));
    } catch {
      // Calendar is a nice-to-have: a revoked or unscoped token should not
      // take the whole dashboard down.
      meetings = [];
    }
  }

  const total =
    counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {aiFailure && total === 0 && (
        <p
          className="mb-4 text-center text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-danger, #b3261e)" }}
        >
          AI summarization is failing, so nothing could be filed.{" "}
          {aiFailure.errorMessage} — press Refresh to retry.
        </p>
      )}

      {total === 0 && !aiFailure && (
        <p
          className="mb-4 text-center text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Nothing here yet — press Refresh now to fetch your inbox.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Needs a reply"
          value={counts.high}
          href="/dashboard/needs-reply"
          tone="high"
        />
        <StatTile
          label="Worth a glance"
          value={counts.medium}
          href="/dashboard/worth-a-glance"
          tone="medium"
        />
        <StatTile label="FYI" value={counts.low} href="/dashboard/fyi" tone="low" />
        <StatTile label="Replied" value={counts.replied} href="/dashboard/replied" />
        <StatTile label="Snoozed" value={counts.snoozed} href="/dashboard/snoozed" />
        <StatTile label="History" value={counts.history} href="/dashboard/history" />
      </div>

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
                  {formatTime(meeting.startTime)}
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
