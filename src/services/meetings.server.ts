import { prisma } from "../lib/prisma.server";
import { loadTodaysEvents } from "./calendar.server";
import { startOfLocalDay } from "../lib/date.server";

/**
 * How stale a cached meeting list is allowed to get.
 *
 * A user can move a meeting, and the dashboard has no way to know. The
 * alternative to a window is calling Calendar on every render, which is exactly
 * the cost this service exists to remove, and the alternative to a window at all
 * is a push integration that does not exist for Google Calendar.
 */
const STALE_AFTER_MS = 90 * 60 * 1000;

/**
 * Writes today's meetings into `MeetingReminder` so the dashboard can read a
 * table instead of calling Calendar mid-render.
 *
 * The table and the queue both already existed and were never used by anything,
 * so this fills in scaffolding rather than inventing a new mechanism.
 *
 * Returns a reason rather than throwing for the ordinary "no calendar" cases, so
 * the worker can log them at info. A Microsoft-only account, a grant without the
 * calendar scope, and a disabled Calendar API all mean "no meetings to show",
 * and none of them is an error worth a retry or a JobFailure row.
 */
export async function refreshTodaysMeetings(userId: string): Promise<{
  saved: number;
  reason?: string;
}> {
  const today = startOfLocalDay(new Date());
  const dayEnd = new Date(today);
  dayEnd.setHours(23, 59, 59, 999);

  // Fetched before anything is written. The delete-then-insert order below is
  // what makes a cancelled meeting disappear rather than linger, but doing it
  // first means a provider fault — a timeout, a 500, a revoked token mid-call —
  // leaves the user with an empty panel that only refills on the next scheduled
  // run, up to two hours later. Fetching first means a failure leaves the last
  // known good data in place, which is the correct thing to show and is the
  // whole reason a cache is worth having.
  const events = await loadTodaysEvents(userId);

  // The swap, in one transaction: either the day ends up holding exactly what
  // Calendar just said, or it is left exactly as it was.
  const seen = new Set<string>();
  const rows = events
    .filter((event) => {
      // Deduplicated in memory: a recurring event expanded by `singleEvents` can
      // appear twice, and the unique key would turn that into an upsert
      // collision mid-loop rather than a clean insert.
      if (seen.has(event.eventId)) return false;
      seen.add(event.eventId);
      return true;
    })
    .map((event) => ({
      userId,
      calendarEventId: event.eventId,
      title: event.title,
      meetingTime: event.startTime,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.meetingReminder.deleteMany({
      where: {
        userId,
        meetingTime: { gte: today, lte: dayEnd },
      },
    });

    if (rows.length > 0) {
      await tx.meetingReminder.createMany({ data: rows, skipDuplicates: true });
    }
  });

  if (rows.length === 0) {
    return { saved: 0, reason: "no calendar or no events today" };
  }

  return { saved: rows.length };
}

/**
 * Today's meetings from the cache, for the dashboard and the activity ticker.
 *
 * Deliberately never calls Calendar. A render that reaches the network has the
 * latency problem back, and a missing row is a much better failure than a slow
 * page: the worker will fill it within a couple of hours, and the user gets an
 * empty meetings panel in the meantime rather than a stalled dashboard.
 */
export async function getCachedTodaysMeetings(
  userId: string,
): Promise<{ eventId: string; title: string; startTime: Date }[]> {
  const today = startOfLocalDay(new Date());
  const dayEnd = new Date(today);
  dayEnd.setHours(23, 59, 59, 999);

  const rows = await prisma.meetingReminder.findMany({
    where: {
      userId,
      meetingTime: { gte: today, lte: dayEnd },
    },
    orderBy: { meetingTime: "asc" },
    select: { calendarEventId: true, title: true, meetingTime: true },
  });

  return rows.map((row) => ({
    eventId: row.calendarEventId,
    title: row.title,
    startTime: row.meetingTime,
  }));
}

/**
 * Whether the cached meetings are old enough to be worth refreshing.
 *
 * Read by the OAuth callback to kick the worker once on sign-in, so a user who
 * arrives after editing their calendar sees the change without waiting for the
 * scheduled run. A plain age check on purpose: it costs one indexed read and no
 * network call, which is the whole point of having a cache.
 *
 * The age is measured from `createdAt`, not `meetingTime`. Those look similar
 * and are not: `meetingTime` is when the meeting happens, so using it compares
 * the clock against the user's diary rather than against the data. A user whose
 * next meeting is at 14:00 and who signed in at 09:00 would read as
 * permanently fresh, since the difference is negative — and future meetings are
 * the common case, so the check would almost never fire. A user whose meetings
 * are all over would read as permanently stale and cost a Calendar call on every
 * sign-in. `createdAt` is stamped by this refresh, so it is the only field here
 * that answers the question actually being asked.
 */
export async function areMeetingsStale(userId: string): Promise<boolean> {
  const newest = await prisma.meetingReminder.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // No row ever means no answer to give. This is deliberately not treated as
  // stale: for a user with a permanently empty calendar, a refresh writes
  // nothing, so there would be no row to age and the check would fire on every
  // sign-in forever. The scheduled job still covers them.
  if (!newest) return false;

  return Date.now() - newest.createdAt.getTime() > STALE_AFTER_MS;
}
