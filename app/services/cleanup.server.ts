import { prisma } from "../lib/prisma.server";

const DEFAULT_RETENTION_DAYS = 90;

function getRetentionDays(): number {
  const val = process.env.RETENTION_DAYS;
  if (!val) return DEFAULT_RETENTION_DAYS;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

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
