import { Suspense } from "react";
import { requireUser } from "@/lib/current-session.server";
import { getReplyStyleProfile } from "@/services/reply-style.server";
import { MIN_SAMPLES_FOR_STYLE } from "@/lib/reply-style";
import { ReplyStyleCard } from "@/components/reply-style-card";
import { formatLocalTime } from "@/lib/date.server";

export const metadata = { title: "Your writing style — Mr Mailer" };

/**
 * A read-only view of what the background analyser has concluded.
 *
 * There is deliberately no button here and nothing to trigger. The analysis runs
 * on a schedule in the worker, because the signal it learns from is a user's
 * replies accumulating over time — a page someone has to remember to visit
 * would only ever reflect the people who visit it.
 *
 * What remains is the reason to keep the page at all: the profile is fed into
 * the reply prompt, which means it is shaping what the app drafts on the user's
 * behalf, and that is worth being able to see and check. The sample count is
 * shown for the same reason — a note derived from five replies should not read
 * as a considered judgement about how someone writes.
 */
export default async function InsightsPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1
        className="text-[24px] font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        Your writing style
      </h1>

      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
      >
        Mr Mailer studies the replies you send and adjusts its drafts to match.
        This runs on its own &mdash; there is nothing to press.
      </p>

      <div className="mt-6">
        {/* The profile is one indexed row, so this resolves immediately. The
            boundary is here to keep the page shape identical between the
            learned and not-yet-learned states rather than for the latency. */}
        <Suspense fallback={<p className="text-sm">Loading your profile&hellip;</p>}>
          <StyleProfile userId={user.id} />
        </Suspense>
      </div>

      <p
        className="mt-8 text-[11px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        Only how you write is used. Nothing here changes how your inbox is
        triaged, and a note is never applied without{" "}
        {MIN_SAMPLES_FOR_STYLE} replies behind it.
      </p>
    </main>
  );
}

async function StyleProfile({ userId }: { userId: string }) {
  const profile = await getReplyStyleProfile(userId);

  if (!profile) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
        }}
      >
        <p
          className="text-sm font-medium"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
        >
          Still learning.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Once you have sent {MIN_SAMPLES_FOR_STYLE} replies &mdash; using a
          suggested reply so there is something to compare against &mdash; your
          style profile will appear here.
        </p>
      </div>
    );
  }

  const acceptRate =
    profile.sampleCount > 0
      ? Math.round((profile.acceptedCount / profile.sampleCount) * 100)
      : 0;

  return (
    <ReplyStyleCard
      styleNote={profile.styleNote}
      stats={[
        { label: "Replies studied", value: String(profile.sampleCount) },
        { label: "Sent as suggested", value: `${acceptRate}%` },
        {
          label: "Last updated",
          value: formatLocalTime(profile.analyzedAt),
        },
      ]}
    />
  );
}
