import { prisma } from "../lib/prisma.server";
import { getRetentionDays } from "../lib/env.server";

export interface CleanupResult {
  emailSummariesDeleted: number;
  jobFailuresDeleted: number;
}

export async function cleanupOldRecords(): Promise<CleanupResult> {
  const retentionDays = getRetentionDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const [emailSummariesResult, jobFailuresResult] = await prisma.$transaction([
    prisma.emailSummary.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    prisma.jobFailure.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
  ]);

  const result: CleanupResult = {
    emailSummariesDeleted: emailSummariesResult.count,
    jobFailuresDeleted: jobFailuresResult.count,
  };

  const total = result.emailSummariesDeleted + result.jobFailuresDeleted;
  if (total > 0) {
    console.log(
      `[Cleanup] Deleted ${result.emailSummariesDeleted} email summaries and ${result.jobFailuresDeleted} job failures older than ${retentionDays} days`,
    );
  } else {
    console.log(`[Cleanup] No records older than ${retentionDays} days to delete`);
  }

  return result;
}