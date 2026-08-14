import { runDigestPipeline } from "../services/digest.server";
import { morningDigestQueue } from "../services/queue.server";
import { prisma } from "./prisma.server";
import type { User } from "../../generated/prisma/client";

export function registerDailyDigest(userId: string, preferredMorningTime: string) {
  const [hour, minute] = (preferredMorningTime ?? "07:00").split(":");
  return morningDigestQueue.add(
    `digest-${userId}`,
    { userId },
    {
      repeat: { pattern: `${minute ?? "0"} ${hour} * * *` },
      jobId: `morning-digest-${userId}`,
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
}
