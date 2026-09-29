import { runDigestPipeline } from "../services/digest.server";
import { getMorningDigestQueue, getWeeklyDigestQueue } from "../services/queue.server";
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
}
