import { Queue } from "bullmq";
import { getRedisConnection } from "../lib/redis.server";

const connection = getRedisConnection();

export const morningDigestQueue = new Queue("morning-digest", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});

export const emailReminderQueue = new Queue("email-reminder", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 20,
  },
});

export const meetingReminderQueue = new Queue("meeting-reminder", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});

export const scheduleBlockQueue = new Queue("schedule-block", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});
