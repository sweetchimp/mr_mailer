import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnection } from "./lib/redis.server";
import { prisma } from "./lib/prisma.server";
import { runDigestPipeline } from "./services/digest.server";
import { getMorningDigestQueue } from "./services/queue.server";
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

const startTime = Date.now();
let processedJobs = 0;
let failedJobs = 0;

function log(level: "info" | "error" | "warn", message: string) {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : "log"](`[${ts}] [Worker] ${message}`);
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

      await prisma.jobFailure.create({
        data: {
          userId,
          jobType: "morning-digest",
          step,
          errorMessage,
          context: JSON.stringify({
            jobId: job.id,
            timestamp: new Date().toISOString(),
          }),
        },
      });

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

async function registerRepeatableJobs() {
  const users = await prisma.user.findMany({
    select: { id: true, preferredMorningTime: true },
  });

  const digestQueue = getMorningDigestQueue();

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
  log("info", `Health: uptime=${uptime}s, processed=${processedJobs}, failed=${failedJobs}`);
}, 300_000);