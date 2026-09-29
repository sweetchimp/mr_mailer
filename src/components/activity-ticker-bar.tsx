import { requireUser } from "@/lib/current-session.server";
import { getTodaysEvents } from "@/services/calendar.server";
import { getTickerItems } from "@/services/dashboard.server";
import { ActivityTicker } from "@/components/activity-ticker";

/**
 * Server-side data for the activity bar.
 *
 * Self-contained so the dashboard layout stays a one-liner. Calendar is a
 * nice-to-have here exactly as it is on the dashboard: a revoked or unscoped
 * token must not take the whole bar down, so it degrades to the DB-sourced
 * items. `getTodaysEvents` is request-cached, so the dashboard page pays for
 * the Calendar call once even though the bar and the page both ask for it.
 */
export async function ActivityTickerBar() {
  const user = await requireUser();

  let meetings: { eventId: string; title: string; startTime: Date }[] = [];
  if (!user.tokenRevokedAt) {
    try {
      meetings = await getTodaysEvents(user.id);
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
