import { requireUser } from "@/lib/current-session.server";
import { getRecentReplyFeedback } from "@/services/reply-feedback.server";
import { ReplyInsights } from "@/components/reply-insights";

export default async function InsightsPage() {
  const user = await requireUser();
  const edits = await getRecentReplyFeedback(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h2
        className="text-[13px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        Reply insights
      </h2>
      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        Every AI-suggested reply you rewrote before sending, next to what you
        sent instead.
      </p>

      <ReplyInsights entries={edits} />
    </main>
  );
}
