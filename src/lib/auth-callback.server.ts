import { runDigestPipeline } from "../services/digest.server";
import {
  getMeetingReminderQueue,
  getMorningDigestQueue,
  getReplyStyleQueue,
  getWeeklyDigestQueue,
} from "../services/queue.server";
import { areMeetingsStale, refreshTodaysMeetings } from "../services/meetings.server";
import { prisma } from "./prisma.server";
import type { User } from "@prisma/client";

/**
 * The zone every cron is pinned to.
 *
 * Duplicated from `worker.ts` rather than imported, because the worker opens a
 * Redis connection and installs signal handlers at module scope: importing it
 * from the OAuth callback would stand up a whole worker inside a Next.js
 * request. Same expression, same constant name, so the two stay visibly paired.
 */
const SERVER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Sunday 18:00. Matches `WEEKLY_DIGEST_CRON` in `worker.ts`. */
const WEEKLY_DIGEST_CRON = "0 18 * * 0";

/** Matches `STYLE_REFRESH_CRON` in `worker.ts`. */
const STYLE_REFRESH_CRON = "23 */2 * * *";

/** Matches `MEETINGS_REFRESH_CRON` in `worker.ts`. */
const MEETINGS_REFRESH_CRON = "7 */2 * * *";

export function registerDailyDigest(userId: string, preferredMorningTime: string) {
  const [hour, minute] = (preferredMorningTime ?? "07:00").split(":");
  return getMorningDigestQueue().upsertJobScheduler(
    `morning-digest-${userId}`,
    // `tz` was missing here, so BullMQ fell back to UTC while the worker
    // registered the same schedule in SERVER_TZ. Whichever path ran last won:
    // a user who logged in after a worker restart silently had their digest
    // shift by the host's UTC offset.
    { pattern: `${minute ?? "0"} ${hour} * * *`, tz: SERVER_TZ },
    {
      name: `digest-${userId}`,
      data: { userId },
    },
  );
}

export function registerWeeklyDigest(userId: string) {
  return getWeeklyDigestQueue().upsertJobScheduler(
    `weekly-digest-${userId}`,
    { pattern: WEEKLY_DIGEST_CRON, tz: SERVER_TZ },
    {
      name: `weekly-${userId}`,
      data: { userId },
    },
  );
}

/**
 * Registers the style-analysis schedule.
 *
 * Present so a new user's first profile is not a week away: the worker only
 * registers schedulers for users who already exist when it starts, so anything
 * created after boot waits for the next restart without this.
 */
export function registerReplyStyle(userId: string) {
  return getReplyStyleQueue().upsertJobScheduler(
    `reply-style-${userId}`,
    { pattern: STYLE_REFRESH_CRON, tz: SERVER_TZ },
    {
      name: `style-${userId}`,
      data: { userId },
    },
  );
}

/** Matches `registerRepeatableJobs` in `worker.ts`, for the same reason. */
export function registerMeetings(userId: string) {
  return getMeetingReminderQueue().upsertJobScheduler(
    `meeting-reminder-${userId}`,
    { pattern: MEETINGS_REFRESH_CRON, tz: SERVER_TZ },
    {
      name: `meetings-${userId}`,
      data: { userId },
    },
  );
}

/**
 * Fills today's meetings on sign-in, if the cache has gone stale.
 *
 * The dashboard reads the `MeetingReminder` table rather than calling Calendar,
 * so a user who edits their calendar and then signs in would otherwise keep
 * seeing the previous version until the next scheduled run. Doing it here costs
 * one age check when the cache is fresh and one API call when it is not.
 *
 * Fire-and-forget, like the digest: sign-in should not wait on Google, and this
 * is a nice-to-have panel.
 */
function refreshMeetingsOnSignIn(userId: string) {
  areMeetingsStale(userId)
    .then((stale) => {
      if (!stale) return;
      return refreshTodaysMeetings(userId);
    })
    .catch((err) => {
      console.warn(
        `Meeting refresh after login failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

export function runPostLogin(user: User) {
  runDigestPipeline(user.id).catch(async (err) => {
    console.error("Digest after login failed:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const step = (err as Error & { step?: string }).step ?? "unknown";
    await prisma.jobFailure
      .create({
        data: {
          userId: user.id,
          jobType: "morning-digest",
          step,
          errorMessage,
          context: JSON.stringify({
            source: "post-login",
            timestamp: new Date().toISOString(),
          }),
        },
      })
      .catch(() => {});
  });
  registerDailyDigest(user.id, user.preferredMorningTime).catch(() => {});
  registerWeeklyDigest(user.id).catch(() => {});
  registerReplyStyle(user.id).catch(() => {});
  registerMeetings(user.id).catch(() => {});
  refreshMeetingsOnSignIn(user.id);
}
