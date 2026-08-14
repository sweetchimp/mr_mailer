import { prisma } from "../lib/prisma.server";
import { TokenRevokedError } from "../lib/google-auth.server";
import { getTodaysEvents } from "./calendar.server";
import { sendMeetingReminderEmail } from "./reminder.server";

const REMIND_WINDOW_MS = 15 * 60 * 1000;

export interface MeetingReminderResult {
  usersChecked: number;
  remindersSent: number;
  errors: { userId: string; error: string }[];
}

export async function checkUpcomingMeetings(): Promise<MeetingReminderResult> {
  const users = await prisma.user.findMany({
    where: { tokenRevokedAt: null },
    select: { id: true, email: true },
  });

  const result: MeetingReminderResult = {
    usersChecked: users.length,
    remindersSent: 0,
    errors: [],
  };

  const now = Date.now();
  const windowEnd = now + REMIND_WINDOW_MS;

  for (const user of users) {
    try {
      const events = await getTodaysEvents(user.id);

      for (const event of events) {
        const startMs = event.startTime.getTime();
        if (startMs < now || startMs > windowEnd) continue;

        const existing = await prisma.meetingReminder.findUnique({
          where: {
            userId_calendarEventId_meetingTime: {
              userId: user.id,
              calendarEventId: event.eventId,
              meetingTime: event.startTime,
            },
          },
        });

        if (existing) continue;

        await sendMeetingReminderEmail(user.email, event.title, event.startTime);

        await prisma.meetingReminder.create({
          data: {
            userId: user.id,
            calendarEventId: event.eventId,
            title: event.title,
            meetingTime: event.startTime,
            remindedAt: new Date(),
          },
        });

        result.remindersSent++;
      }
    } catch (error) {
      if (error instanceof TokenRevokedError) {
        result.errors.push({
          userId: user.id,
          error: "Token revoked or missing calendar scope",
        });
      } else {
        result.errors.push({
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}
