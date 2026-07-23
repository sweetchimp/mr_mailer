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
