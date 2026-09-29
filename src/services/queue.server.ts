import { Queue } from "bullmq";
import { getRedisConnection } from "../lib/redis.server";

type QueueName =
  | "morning-digest"
  | "weekly-digest"
  | "email-reminder"
  | "meeting-reminder"
  | "schedule-block";

const REMOVE_ON_COMPLETE: Record<QueueName, number> = {
  "morning-digest": 50,
  "weekly-digest": 20,
  "email-reminder": 20,
  "meeting-reminder": 50,
  "schedule-block": 50,
};

let cache: Map<QueueName, Queue> | null = null;

/**
 * Queues are created on first use rather than at module scope.
 *
 * `queue.server.ts` is imported by the dashboard server actions and by the
 * OAuth callback, so constructing the Queues eagerly meant every Next.js server
 * process — and every `next build`, which imports the route modules to collect
 * page data — opened a Redis connection whether or not a job was ever enqueued.
 * Lazy construction keeps Redis out of the picture until something needs it.
 */
function queue(name: QueueName): Queue {
  if (!cache) cache = new Map();

  const existing = cache.get(name);
  if (existing) return existing;

  const created = new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: REMOVE_ON_COMPLETE[name],
      removeOnFail: 20,
    },
  });
  cache.set(name, created);
  return created;
}

export function getMorningDigestQueue(): Queue {
  return queue("morning-digest");
}

export function getEmailReminderQueue(): Queue {
  return queue("email-reminder");
}

export function getWeeklyDigestQueue(): Queue {
  return queue("weekly-digest");
}

/** Not yet consumed — reserved for the meeting-reminder worker job. */
export function getMeetingReminderQueue(): Queue {
  return queue("meeting-reminder");
}

/** Not yet consumed — reserved for the schedule-block worker job. */
export function getScheduleBlockQueue(): Queue {
  return queue("schedule-block");
}
