import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedisConnection(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
  }
  return globalForRedis.redis;
}