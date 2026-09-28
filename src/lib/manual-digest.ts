/**
 * Rules for the manual digest queue, kept out of `actions.ts` because a
 * `"use server"` module may only export async functions and this is pure logic.
 */

/** Job name used for digests started from the dashboard Refresh button. */
export const manualDigestJobName = (userId: string) => `manual-digest-${userId}`;

/** Job name used by the nightly scheduler. */
export const scheduledDigestJobName = (userId: string) => `digest-${userId}`;

/**
 * Whether this user already has a *manual* digest running, so a second Refresh
 * click can defer to it instead of queueing redundant work.
 *
 * The name check is load-bearing. The nightly scheduler parks a job named
 * `digest-<userId>` carrying the same userId, and it sits in `delayed` until
 * tomorrow morning. Matching on userId alone makes that job look permanently
 * in-flight, and Refresh becomes a no-op forever. A job whose data is missing
 * is not attributed to anyone, so it does not block either — a redundant digest
 * is cheap (summarizeEmails reuses stored summaries and makes no AI call for
 * mail it has already seen), while a swallowed click is not.
 */
export function hasManualDigestInFlight(
  jobs: ReadonlyArray<{ name: string; data?: unknown }>,
  userId: string,
): boolean {
  return jobs.some(
    (job) =>
      job.name.startsWith("manual-digest-") &&
      (job.data as { userId?: string } | undefined)?.userId === userId,
  );
}
