import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnection } from "./lib/redis.server";
import { prisma } from "./lib/prisma.server";
import { runDigestPipeline } from "./services/digest.server";
import { sendWeeklyDigest } from "./services/weekly-digest.server";
import { unsnoozeEmail } from "./services/reminder.server";
import {
  getMorningDigestQueue,
  getWeeklyDigestQueue,
} from "./services/queue.server";
import { cleanupOldRecords } from "./services/cleanup.server";
import { TokenRevokedError } from "./lib/google-auth.server";

const connection = getRedisConnection();

/**
 * Schedules are pinned to this zone explicitly rather than inheriting whatever
 * the host happens to be set to. `preferredMorningTime` is a wall-clock time the
 * user chose, and "7am" silently becoming "5am" because the container moved
 * between UTC and Europe/Bucharest is exactly the kind of change nobody notices
 * until a digest arrives at the wrong hour. A per-user timezone is the real fix
 * and needs a schema migration; until then, at least the behaviour is explicit
 * and logged rather than accidental.
 */
const SERVER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Sunday 18:00 — see the scheduler registration for why this is not a setting. */
const WEEKLY_DIGEST_CRON = "0 18 * * 0";

const startTime = Date.now();
let processedJobs = 0;
let failedJobs = 0;
let unsnoozedJobs = 0;
let weeklyDigestsSent = 0;

function log(level: "info" | "error" | "warn", message: string) {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : "log"](`[${ts}] [Worker] ${message}`);
}

/**
 * Persist a failure so it is visible in the admin view instead of only in a log
 * line that nobody reads. Scoped to a user because `JobFailure.userId` is
 * required, which is why the `data-cleanup` branch below cannot use this and
 * logs instead.
 */
async function recordFailure(
  userId: string,
  jobType: string,
  step: string,
  errorMessage: string,
  jobId?: string,
): Promise<void> {
  await prisma.jobFailure.create({
    data: {
      userId,
      jobType,
      step,
      errorMessage,
      context: JSON.stringify({
        jobId,
        timestamp: new Date().toISOString(),
      }),
    },
  });
}

const worker = new Worker(
  "morning-digest",
  async (job) => {
    if (job.name === "data-cleanup") {
      log("info", "Running data cleanup job");
      try {
        const result = await cleanupOldRecords();
        log("info", `Cleanup completed: ${result.emailSummariesDeleted} summaries, ${result.jobFailuresDeleted} failures deleted`);
      } catch (error) {
        log("error", `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    const { userId } = job.data as { userId: string };
    log("info", `Processing digest for user ${userId}`);

    try {
      await runDigestPipeline(userId);
      processedJobs++;
      log("info", `Digest completed for user ${userId}`);
    } catch (error) {
      if (error instanceof TokenRevokedError) {
        failedJobs++;
        log("warn", `Token revoked for user ${userId} — skipping retries`);
        return;
      }

      const err = error as Error & { step?: string };
      const step = err.step ?? "unknown";
      const errorMessage = err.message;

      log("error", `Failed for user ${userId} at step "${step}": ${errorMessage}`);

      await recordFailure(userId, "morning-digest", step, errorMessage, job.id);

      failedJobs++;
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: {
      max: 10,
      duration: 60_000,
    },
  },
);

worker.on("completed", (job) => {
  // The cleanup scheduler carries `data: {}`, so there is no user to name.
  // Reading job.data.userId unconditionally logged "completed for user
  // undefined" every night at the cleanup hour.
  const userId = (job.data as { userId?: string } | undefined)?.userId;
  log(
    "info",
    userId
      ? `Job ${job.id} completed for user ${userId}`
      : `Job ${job.id} (${job.name}) completed`,
  );
});

worker.on("failed", (job, err) => {
  log("error", `Job ${job?.id} failed: ${err.message}`);
});

/**
 * Consumer for the `email-reminder` queue.
 *
 * This queue was previously produced but never consumed: `snoozeAction` wrote
 * SNOOZED + snoozedUntil and enqueued a delayed job, and nothing ever read it.
 * An email snoozed "until tomorrow" therefore sat in the Snoozed bucket showing
 * "Reminds <date>" indefinitely, because no code path ever moved it back. This
 * worker is what makes snooze terminate.
 */
const reminderWorker = new Worker(
  "email-reminder",
  async (job) => {
    const { userId, emailId } = job.data as {
      userId: string;
      emailId: string;
    };

    try {
      const { unsnoozed } = await unsnoozeEmail(userId, emailId);

      if (unsnoozed) {
        unsnoozedJobs++;
        log("info", `Un-snoozed email ${emailId} for user ${userId}`);
      } else {
        // The row is no longer SNOOZED: the user dismissed it or re-snoozed it
        // while this job was queued. Leave their decision alone.
        log(
          "info",
          `Skipping reminder for email ${emailId} (user ${userId}): no longer snoozed`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log("error", `Un-snooze failed for email ${emailId}: ${errorMessage}`);
      await recordFailure(
        userId,
        "email-reminder",
        "unsnooze",
        errorMessage,
        job.id,
      );
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 10, duration: 60_000 },
  },
);

reminderWorker.on("completed", (job) => {
  const userId = (job.data as { userId?: string } | undefined)?.userId;
  log(
    "info",
    userId
      ? `Reminder ${job.id} completed for user ${userId}`
      : `Reminder ${job.id} (${job.name}) completed`,
  );
});

reminderWorker.on("failed", (job, err) => {
  log("error", `Reminder ${job?.id} failed: ${err.message}`);
});

/**
 * Consumer for the `weekly-digest` queue.
 *
 * Separate from `morning-digest` rather than a branch inside it: the two run on
 * different cadences for different people, and folding a Sunday-evening
 * opt-in-optional job into the daily pipeline would mean every user paid for a
 * summary most of them never asked to receive. `sendWeeklyDigest` reports
 * "opted out" as a normal result, not an error.
 */
const weeklyWorker = new Worker(
  "weekly-digest",
  async (job) => {
    const { userId } = job.data as { userId: string };

    try {
      const result = await sendWeeklyDigest(userId);

      if (result.sent) {
        weeklyDigestsSent++;
        log("info", `Weekly summary sent for user ${userId}`);
      } else {
        log("info", `Weekly summary skipped for user ${userId}: ${result.reason}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      log("error", `Weekly summary failed for user ${userId}: ${errorMessage}`);
      await recordFailure(userId, "weekly-digest", "send", errorMessage, job.id);

      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 10, duration: 60_000 },
  },
);

weeklyWorker.on("completed", (job) => {
  const userId = (job.data as { userId?: string } | undefined)?.userId;
  log("info", `Weekly digest ${job.id} completed for user ${userId}`);
});

weeklyWorker.on("failed", (job, err) => {
  log("error", `Weekly digest ${job?.id} failed: ${err.message}`);
});

async function registerRepeatableJobs() {
  const users = await prisma.user.findMany({
    select: { id: true, preferredMorningTime: true },
  });

  const digestQueue = getMorningDigestQueue();
  const weeklyQueue = getWeeklyDigestQueue();

  for (const user of users) {
    const [hour, minute] = (user.preferredMorningTime ?? "07:00").split(":");
    const cron = `${minute ?? "0"} ${hour} * * *`;

    await digestQueue.upsertJobScheduler(
      `morning-digest-${user.id}`,
      { pattern: cron, tz: SERVER_TZ },
      {
        name: `digest-${user.id}`,
        data: { userId: user.id },
      },
    );
    log(
      "info",
      `Registered daily digest for user ${user.id} at ${user.preferredMorningTime} (${SERVER_TZ})`,
    );

    // Sunday 18:00. Fixed rather than user-configurable, and unlike
    // `preferredMorningTime` it is not a "when do you start work" preference —
    // it is a delivery slot, so there is nothing to ask about.
    await weeklyQueue.upsertJobScheduler(
      `weekly-digest-${user.id}`,
      { pattern: WEEKLY_DIGEST_CRON, tz: SERVER_TZ },
      {
        name: `weekly-${user.id}`,
        data: { userId: user.id },
      },
    );
  }

  await digestQueue.upsertJobScheduler(
    "data-cleanup",
    { pattern: "0 3 * * *", tz: SERVER_TZ },
    {
      name: "data-cleanup",
      data: {},
    },
  );
  log("info", `Registered daily data-cleanup job at 03:00 (${SERVER_TZ})`);
}

async function startWorker() {
  await registerRepeatableJobs();
  log("info", "Worker started");
}

async function gracefulShutdown(signal: string) {
  log("info", `Received ${signal}, shutting down gracefully...`);

  try {
    await worker.close();
    await reminderWorker.close();
    await weeklyWorker.close();
    await connection.quit();
    log("info", "All connections closed");
  } catch (err) {
    log("error", `Error during shutdown: ${err}`);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startWorker().catch((err) => {
  log("error", `Failed to start worker: ${err}`);
  process.exit(1);
});

setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  log(
    "info",
    `Health: uptime=${uptime}s, processed=${processedJobs}, failed=${failedJobs}, unsnoozed=${unsnoozedJobs}, weeklySent=${weeklyDigestsSent}`,
  );
}, 300_000);