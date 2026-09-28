import { prisma } from "../lib/prisma.server";

/**
 * Returns a snoozed email to the pending buckets once its reminder fires.
 *
 * `updateMany` rather than `update` is deliberate and load-bearing. A delayed
 * job can outlive the state it was created for: re-snoozing removes and re-adds
 * the job, but the user can also dismiss the email directly from the Snoozed
 * bucket, which leaves the queued job in place. A plain `update` would then
 * resurrect that dismissed email as PENDING, quietly undoing the user's
 * decision. Constraining on `status: "SNOOZED"` means a stale job is a no-op,
 * and the returned count says whether anything actually changed.
 *
 * `gmailMessageId` is the provider message id and is globally unique, but the
 * lookup stays scoped by `userId` so a job payload can never reach another
 * account's row.
 */
export async function unsnoozeEmail(
  userId: string,
  gmailMessageId: string,
): Promise<{ unsnoozed: boolean }> {
  const { count } = await prisma.emailSummary.updateMany({
    where: { userId, gmailMessageId, status: "SNOOZED" },
    data: { status: "PENDING", snoozedUntil: null },
  });

  return { unsnoozed: count > 0 };
}
