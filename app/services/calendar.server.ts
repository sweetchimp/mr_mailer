import { prisma } from "../lib/prisma.server";
import {
  getValidAccessToken,
  TokenRevokedError,
} from "../lib/google-auth.server";

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

interface CalendarApiTime {
  dateTime?: string;
  date?: string;
}

interface CalendarApiItem {
  id: string;
  summary?: string;
  status?: string;
  start?: CalendarApiTime;
  end?: CalendarApiTime;
  attendees?: { email?: string }[];
}

interface CalendarApiResponse {
  items?: CalendarApiItem[];
}

function parseTime(time?: CalendarApiTime): Date | null {
  if (time?.dateTime) {
    const parsed = new Date(time.dateTime);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (time?.date) {
    const parsed = new Date(`${time.date}T00:00:00Z`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getTodaysEvents(
  userId: string,
): Promise<CalendarEvent[]> {
  const tokenRecord = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!tokenRecord || tokenRecord.provider !== "GOOGLE") {
    return [];
  }

  if (!tokenRecord.scope.includes(CALENDAR_SCOPE)) {
    throw new TokenRevokedError(
      "Calendar access not granted. Re-authenticate to grant calendar access.",
      userId,
    );
  }

  const accessToken = await getValidAccessToken(userId);

  const params = new URLSearchParams({
    timeMin: startOfToday().toISOString(),
    timeMax: endOfToday().toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_EVENTS),
  });

  const res = await fetch(`${CALENDAR_API}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 403) {
      throw new TokenRevokedError(
        "Calendar access not granted. Re-authenticate to grant calendar access.",
        userId,
      );
    }
    throw new Error(`Calendar API error: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as CalendarApiResponse;

  return (data.items ?? [])
    .filter((item) => item.status !== "cancelled")
    .map((item) => {
      const startTime = parseTime(item.start);
      const endTime = parseTime(item.end);
      return { item, startTime, endTime };
    })
    .filter(
      (entry): entry is {
        item: CalendarApiItem;
        startTime: Date;
        endTime: Date | null;
      } => entry.startTime !== null,
    )
    .map(({ item, startTime, endTime }) => ({
      eventId: item.id,
      title: item.summary?.trim() || "(untitled)",
      startTime,
      endTime: endTime ?? startTime,
      attendees: (item.attendees ?? [])
        .map((attendee) => attendee.email ?? "")
        .filter(Boolean),
    }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
