import { requireUser } from "@/lib/current-session.server";
import { getWeeklyStats } from "@/services/weekly-digest.server";
import { formatDuration } from "@/lib/weekly-digest";
import { WeeklyDigestOptIn } from "@/components/weekly-digest-opt-in";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex-1 rounded-xl px-4 py-3"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.1em]"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          color: "var(--color-ink-faint)",
        }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[18px] font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        {value}
      </p>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3
        className="text-[11px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        {heading}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function formatWindow(start: string, end: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

export default async function WeeklySummaryPage() {
  const user = await requireUser();
  const stats = await getWeeklyStats(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h2
        className="text-[13px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        Weekly summary
      </h2>
      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {formatWindow(stats.windowStart, stats.windowEnd)}
      </p>

      <Section heading="Handled">
        <div className="flex flex-wrap gap-3">
          <Stat label="Replied" value={stats.replied} />
          <Stat label="Dismissed" value={stats.dismissed} />
          <Stat
            label="Avg. time to reply"
            value={
              stats.avgTimeToReplyMs === null
                ? "—"
                : formatDuration(stats.avgTimeToReplyMs)
            }
          />
        </div>
        {stats.avgTimeToReplyMs === null && (
          <p
            className="mt-3 text-[12px]"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            No replies recorded in this window yet, so there is no average to
            show. Timing starts once you send a reply.
          </p>
        )}
      </Section>

      <Section heading="Still waiting">
        <div className="flex flex-wrap gap-3">
          <Stat label="Needs a reply" value={stats.pendingHigh} />
          <Stat label="Worth a glance" value={stats.pendingMedium} />
          <Stat label="FYI" value={stats.pendingLow} />
          <Stat label="Snoozed" value={stats.snoozed} />
        </div>
      </Section>

      <Section heading="Delivery">
        <WeeklyDigestOptIn
          initialEnabled={user.weeklyDigestEmail}
          recipient={user.email}
        />
      </Section>
    </main>
  );
}
