import { prisma } from "../lib/prisma.server";
import { getValidAccessToken } from "../lib/google-auth.server";
import { startOfLocalDay } from "../lib/date.server";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MAX_EVENTS = 50;

export interface CalendarEvent {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
}

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: { email?: string }[];
}

function parseTime(time: GoogleEventTime | undefined): Date | null {
  if (!time) return null;
  if (time.dateTime) {
    const parsed = new Date(time.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (time.date) {
    const parsed = new Date(`${time.date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Google Calendar events for today, in the server's local timezone.
 *
 * Returns an empty array rather than throwing whenever the calendar simply is
 * not available: no Google token, a Microsoft-only account, a token without the
 * calendar scope, or a 403 from the API (the Calendar API not being enabled in
 * the project, a per-calendar ACL, or quota). Calendar is a nice-to-have panel
 * and must never be able to take the dashboard down or misrepresent a healthy
 * Gmail grant as a revoked one.
 *
 * This function never mutates `user.tokenRevokedAt`; the only revocation signal
 * is the refresh-time `invalid_grant` in google-auth.server.ts.
 */
export async function getTodaysEvents(userId: string): Promise<CalendarEvent[]> {
  const tokenRecord = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { provider: true, scope: true },
  });

  if (!tokenRecord || tokenRecord.provider !== "GOOGLE") return [];

  if (!tokenRecord.scope?.includes(CALENDAR_SCOPE)) {
    // Not a revocation. The grant is still healthy; it just never included
    // calendar, so there is nothing to show. Throwing TokenRevokedError here
    // told every caller the connection was dead when it was not.
    console.warn(
      `[calendar] user ${userId} has no ${CALENDAR_SCOPE} grant; skipping calendar`,
    );
    return [];
  }

  const accessToken = await getValidAccessToken(userId);

  const now = new Date();
  // The whole local day rather than up to now: a meeting later this afternoon
  // still belongs on the dashboard. This is why the calendar window differs
  // from the digest's, which stops at now because mail cannot arrive in the
  // future.
  const timeMin = startOfLocalDay(now);
  const timeMax = new Date(now);
  timeMax.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_EVENTS),
  });

  const res = await fetch(`${CALENDAR_API}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) {
    // A 403 from Calendar means many different things — the Calendar API not
    // enabled in the project, the scope missing on this token, a per-calendar
    // ACL, or quota. None of them mean the Gmail grant was revoked, so this
    // must NOT write user.tokenRevokedAt. Doing so flipped the dashboard into
    // "reconnect Google" mode and suppressed the empty state, sending the user
    // to re-authorise a credential that still worked. The only legitimate
    // revocation signal is the refresh-time `invalid_grant` handled in
    // google-auth.server.ts.
    const errorText = await res.text();
    console.warn(
      `[calendar] 403 for user ${userId}; treating calendar as unavailable: ${errorText.slice(0, 300)}`,
    );
    return [];
  }

  if (!res.ok) {
    const errorText = await res.text();
    // Still a throw — a 500 or a malformed response is a real fault, not an
    // absent calendar. But log before throwing: the dashboard wraps this call in
    // a bare `catch {}`, so without this line a 500 would surface as the same
    // silent empty meetings panel that a disabled API produces. That ambiguity is
    // exactly what made the disabled-API case hard to diagnose.
    console.warn(
      `[calendar] unexpected ${res.status} for user ${userId}: ${errorText.slice(0, 300)}`,
    );
    throw new Error(`Calendar API error: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as { items?: GoogleEvent[] };

  return (data.items ?? [])
    .filter((item) => item.status !== "cancelled")
    .map((item) => {
      const startTime = parseTime(item.start);
      if (!startTime) return null;
      return {
        eventId: item.id ?? "",
        title: item.summary?.trim() || "(untitled)",
        startTime,
        endTime: parseTime(item.end) ?? startTime,
        attendees: (item.attendees ?? [])
          .map((attendee) => attendee.email ?? "")
          .filter(Boolean),
      };
    })
    .filter((event): event is CalendarEvent => event !== null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
