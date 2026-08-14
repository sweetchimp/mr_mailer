import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { getTodaysEvents } from "../services/calendar.server";
import { getLocalDayKey } from "../services/schedule.server";
import { StatTile } from "../components/StatTile";
import type { Route } from "./+types/dashboard._index";
import type { DashboardCounts } from "./dashboard";

export const middleware = [authMiddleware];

export interface TodaysMeeting {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const [high, medium, low, replied, snoozed, history] = await Promise.all([
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "HIGH" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "MEDIUM" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "LOW" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SENT" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SNOOZED" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: { in: ["SENT", "DISMISSED"] } } }),
  ]);

  const [scheduleTotal, scheduleDone] = await Promise.all([
    prisma.scheduleBlock.count({ where: { userId: user.id, date: getLocalDayKey() } }),
    prisma.scheduleBlock.count({ where: { userId: user.id, date: getLocalDayKey(), status: "DONE" } }),
  ]);

  let todayMeetings: TodaysMeeting[] = [];
  if (!user.tokenRevokedAt) {
    try {
      const events = await getTodaysEvents(user.id);
      todayMeetings = events.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        attendees: event.attendees,
      }));
    } catch {
      todayMeetings = [];
    }
  }

  const data = {
    counts: { high, medium, low, replied, snoozed, history } satisfies DashboardCounts,
    schedule: { total: scheduleTotal, done: scheduleDone },
    todayMeetings,
    tokenRevoked: !!user.tokenRevokedAt,
  };
  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

export default function DashboardIndex({ loaderData }: Route.ComponentProps) {
  const { counts, schedule, todayMeetings, tokenRevoked } = loaderData as {
    counts: DashboardCounts;
    schedule: { total: number; done: number };
    todayMeetings: TodaysMeeting[];
    tokenRevoked: boolean;
  };

  const total = counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {total === 0 && !tokenRevoked && (
        <p
          className="mb-4 text-center text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Nothing here yet — press Refresh now to fetch your inbox.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Needs a reply" value={counts.high} to="/dashboard/needs-reply" tone="high" />
        <StatTile label="Worth a glance" value={counts.medium} to="/dashboard/worth-a-glance" tone="medium" />
        <StatTile label="FYI" value={counts.low} to="/dashboard/fyi" tone="low" />
        <StatTile label="Replied" value={counts.replied} to="/dashboard/replied" />
        <StatTile label="Snoozed" value={counts.snoozed} to="/dashboard/snoozed" />
        <StatTile label="History" value={counts.history} to="/dashboard/history" />
        <StatTile
          label="Today's Schedule"
          value={schedule.total === 0 ? "Plan your day" : `${schedule.done} of ${schedule.total} done`}
          to="/schedule"
        />
      </div>

      <section className="mt-8">
        <h2
          className="text-[13px] font-medium uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          Today&apos;s Meetings
        </h2>
        {todayMeetings.length === 0 ? (
          <p
            className="mt-3 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            No meetings on your calendar today.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayMeetings.map((meeting) => (
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
