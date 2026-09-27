import { prisma } from "../lib/prisma.server";
import { getValidAccessToken, TokenRevokedError } from "../lib/google-auth.server";

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
 * Returns an empty array (rather than throwing) when the user has no Google
 * token or connected Microsoft instead — meeting reminders and the dashboard's
 * "Today's Meetings" simply have nothing to show. Throws TokenRevokedError only
 * when a Google token exists but was never granted the calendar scope.
 */
export async function getTodaysEvents(userId: string): Promise<CalendarEvent[]> {
  const tokenRecord = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { provider: true, scope: true },
  });

  if (!tokenRecord || tokenRecord.provider !== "GOOGLE") return [];

  if (!tokenRecord.scope?.includes(CALENDAR_SCOPE)) {
    throw new TokenRevokedError(
      "Calendar access not granted. Re-authenticate to grant calendar access.",
      userId,
    );
  }

  const accessToken = await getValidAccessToken(userId);

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0);
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
    await prisma.user
      .update({ where: { id: userId }, data: { tokenRevokedAt: new Date() } })
      .catch(() => {});
    throw new TokenRevokedError(
      "Calendar access revoked. Re-authentication required.",
      userId,
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
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
