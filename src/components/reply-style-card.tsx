/**
 * Presentation for the user's learned writing-style profile.
 *
 * A separate component so the insights page stays a server component that
 * composes: this renders data and nothing else, and has no behaviour to test
 * beyond its own shape.
 */

export interface ReplyStyleStat {
  label: string;
  value: string;
}

export function ReplyStyleCard({
  styleNote,
  stats,
}: {
  styleNote: string;
  stats: ReplyStyleStat[];
}) {
  return (
    <section
      className="rounded-2xl p-6"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      }}
    >
      <h2
        className="text-[13px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        What it has learned
      </h2>

      {/* Rendered as text, never as markup: the note is model output about the
          user, and it is not trusted to be well-formed or benign. */}
      <p
        className="mt-3 text-sm leading-relaxed"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
      >
        {styleNote}
      </p>

      <dl
        className="mt-6 grid grid-cols-3 gap-3"
        style={{ borderTop: "1px solid var(--color-line)", paddingTop: "16px" }}
      >
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-ink-faint)",
              }}
            >
              {stat.label}
            </dt>
            <dd
              className="mt-1 text-[15px] font-medium"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
