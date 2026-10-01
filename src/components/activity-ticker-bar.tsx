import { requireUser } from "@/lib/current-session.server";
import { getCachedTodaysMeetings } from "@/services/meetings.server";
import { getTickerItems } from "@/services/dashboard.server";
import { ActivityTicker } from "@/components/activity-ticker";

/**
 * Server-side data for the activity bar.
 *
 * Self-contained so the dashboard layout stays a one-liner. Meetings come from
 * the `MeetingReminder` table rather than the Calendar API, so this never makes
 * a network call: the worker fills that table on a schedule and on sign-in.
 * A missing row means an empty meetings strip for an hour or two, which is a
 * better trade than a ticker whose arrival depends on Google's latency.
 */
export async function ActivityTickerBar() {
  const user = await requireUser();

    let meetings: { eventId: string; title: string; startTime: Date }[] = [];
    if (!user.tokenRevokedAt) {
      try {
        meetings = await getCachedTodaysMeetings(user.id);
      } catch (error) {
        console.warn(
          `[ticker] meetings unavailable for user ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

  const items = await getTickerItems(user.id, meetings);

  return <ActivityTicker items={items} />;
}
