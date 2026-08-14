import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnection } from "./lib/redis.server";
import { prisma } from "./lib/prisma.server";
import { runDigestPipeline } from "./services/digest.server";
import { morningDigestQueue, emailReminderQueue, meetingReminderQueue, scheduleBlockQueue } from "./services/queue.server";
import { cleanupOldRecords } from "./services/cleanup.server";
import { sendReminderEmail } from "./services/reminder.server";
import { checkUpcomingMeetings } from "./services/meeting-reminder.server";
import { checkScheduleBlocks } from "./services/schedule.server";
import { TokenRevokedError } from "./lib/google-auth.server";

const connection = getRedisConnection();

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
  log("info", `Job ${job.id} completed for user ${(job.data as { userId: string }).userId}`);
});

worker.on("failed", (job, err) => {
  log("error", `Job ${job?.id} failed: ${err.message}`);
});

const reminderWorker = new Worker(
  "email-reminder",
  async (job) => {
    const { emailId, userId, subject, sender } = job.data as {
      emailId: string;
      userId: string;
      subject: string;
      sender: string;
    };

    log("info", `Processing reminder for email ${emailId}`);

    try {
      const summary = await prisma.emailSummary.findUnique({
        where: { gmailMessageId: emailId },
        select: { status: true, userId: true, user: { select: { email: true } } },
      });

      if (!summary || summary.status !== "SNOOZED") {
        log("info", `Email ${emailId} is no longer snoozed — skipping reminder`);
        return;
      }

      await sendReminderEmail(summary.user.email, subject, sender);

      await prisma.emailSummary.update({
        where: { gmailMessageId: emailId },
        data: { status: "PENDING", snoozedUntil: null },
      });

      processedJobs++;
      log("info", `Reminder sent and email ${emailId} reset to PENDING`);
    } catch (error) {
      if (error instanceof TokenRevokedError) {
        failedJobs++;
        log("warn", `Token revoked for user ${userId} — skipping reminder retries`);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      log("error", `Reminder failed for email ${emailId}: ${errorMessage}`);

      await prisma.jobFailure.create({
        data: {
          userId,
          jobType: "email-reminder",
          step: "send-reminder",
          errorMessage,
          context: JSON.stringify({
            jobId: job.id,
            emailId,
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
  },
);

reminderWorker.on("completed", (job) => {
  log("info", `Reminder job ${job.id} completed for email ${(job.data as { emailId: string }).emailId}`);
});

reminderWorker.on("failed", (job, err) => {
  log("error", `Reminder job ${job?.id} failed: ${err.message}`);
});

const meetingReminderWorker = new Worker(
  "meeting-reminder",
  async (job) => {
    log("info", "Checking upcoming meetings for reminders");

    try {
      const result = await checkUpcomingMeetings();
      processedJobs++;
      log(
        "info",
        `Meeting reminder check completed: ${result.remindersSent} reminders sent across ${result.usersChecked} users`,
      );

      for (const entry of result.errors) {
        if (entry.error.includes("Token revoked")) {
          log("warn", `Meeting reminders skipped for user ${entry.userId}: ${entry.error}`);
        } else {
          await prisma.jobFailure.create({
            data: {
              userId: entry.userId,
              jobType: "meeting-reminder",
              step: "check-meetings",
              errorMessage: entry.error,
              context: JSON.stringify({
                jobId: job.id,
                timestamp: new Date().toISOString(),
              }),
            },
          });
          failedJobs++;
          log("error", `Meeting reminder failed for user ${entry.userId}: ${entry.error}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("error", `Meeting reminder check failed: ${errorMessage}`);

      await prisma.jobFailure.create({
        data: {
          userId: "system",
          jobType: "meeting-reminder",
          step: "check-meetings",
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
  },
);

meetingReminderWorker.on("completed", (job) => {
  log("info", `Meeting reminder job ${job.id} completed`);
});

meetingReminderWorker.on("failed", (job, err) => {
  log("error", `Meeting reminder job ${job?.id} failed: ${err.message}`);
});

const scheduleBlockWorker = new Worker(
  "schedule-block",
  async (job) => {
    log("info", "Checking schedule blocks for reminders and status transitions");

    try {
      const result = await checkScheduleBlocks();
      processedJobs++;
      log(
        "info",
        `Schedule check completed: ${result.remindersSent} reminders sent, ${result.started} started, ${result.missed} missed, ${result.rolledOver} rolled over across ${result.usersChecked} users`,
      );

      for (const entry of result.errors) {
        log("warn", `Schedule check note for user ${entry.userId}: ${entry.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("error", `Schedule check failed: ${errorMessage}`);

      await prisma.jobFailure.create({
        data: {
          userId: "system",
          jobType: "schedule-block",
          step: "check-schedule",
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
  },
);

scheduleBlockWorker.on("completed", (job) => {
  log("info", `Schedule block job ${job.id} completed`);
});

scheduleBlockWorker.on("failed", (job, err) => {
  log("error", `Schedule block job ${job?.id} failed: ${err.message}`);
});

async function catchMissedReminders() {
  const overdue = await prisma.emailSummary.findMany({
    where: {
      status: "SNOOZED",
      snoozedUntil: { lte: new Date() },
    },
    select: { gmailMessageId: true, userId: true, subject: true, sender: true },
  });

  for (const email of overdue) {
    log("info", `Catching up missed reminder for email ${email.gmailMessageId}`);

    try {
      const user = await prisma.user.findUnique({
        where: { id: email.userId },
        select: { email: true },
      });
      if (!user) continue;

      await sendReminderEmail(user.email, email.subject, email.sender);

      await prisma.emailSummary.update({
        where: { gmailMessageId: email.gmailMessageId },
        data: { status: "PENDING", snoozedUntil: null },
      });
    } catch (error) {
      log("error", `Catch-up reminder failed for ${email.gmailMessageId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (overdue.length > 0) {
    log("info", `Caught up ${overdue.length} missed reminders`);
  }
}

async function registerRepeatableJobs() {
  const users = await prisma.user.findMany({
    select: { id: true, preferredMorningTime: true },
  });

  for (const user of users) {
    const [hour, minute] = (user.preferredMorningTime ?? "07:00").split(":");
    const cron = `${minute ?? "0"} ${hour} * * *`;

    await morningDigestQueue.add(
      `digest-${user.id}`,
      { userId: user.id },
      {
        repeat: { pattern: cron },
        jobId: `morning-digest-${user.id}`,
      },
    );
    log("info", `Registered daily digest for user ${user.id} at ${user.preferredMorningTime}`);
  }

  await morningDigestQueue.add(
    "data-cleanup",
    {},
    {
      repeat: { pattern: "0 3 * * *" },
      jobId: "data-cleanup",
    },
  );
  log("info", "Registered daily data-cleanup job at 03:00 UTC");

  await meetingReminderQueue.add(
    "meeting-reminder-check",
    {},
    {
      repeat: { pattern: "*/5 * * * *" },
      jobId: "meeting-reminder-check",
    },
  );
  log("info", "Registered meeting reminder check job every 5 minutes");

  await scheduleBlockQueue.add(
    "schedule-block-check",
    {},
    {
      repeat: { pattern: "*/10 * * * *" },
      jobId: "schedule-block-check",
    },
  );
  log("info", "Registered schedule block check job every 10 minutes");
}

async function startWorker() {
  await catchMissedReminders();
  await registerRepeatableJobs();
  log("info", "Worker started");
}

async function gracefulShutdown(signal: string) {
  log("info", `Received ${signal}, shutting down gracefully...`);

  try {
    await worker.close();
    await reminderWorker.close();
    await meetingReminderWorker.close();
    await scheduleBlockWorker.close();
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
