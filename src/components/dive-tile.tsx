import Link from "next/link";

const TONES = {
  high: "var(--color-priority-high-text)",
  medium: "var(--color-priority-medium-text)",
  low: "var(--color-priority-low-text)",
} as const;

export type DiveTone = keyof typeof TONES;

/**
 * The large "Let's dive in" destination tiles. Deliberately its own component
 * rather than a StatTile variant: these carry a hint line and the sliding
 * arrow the dashboard design calls for, and StatTile is still used elsewhere.
 */
export function DiveTile({
  href,
  label,
  count,
  hint,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
  tone: DiveTone;
}) {
  const accent = TONES[tone];

  return (
    <Link
      href={href}
      className="group block rounded-2xl p-5"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <span
        style={{
          display: "block",
          height: 4,
          width: 44,
          borderRadius: 999,
          background: accent,
        }}
      />
      <span
        className="mt-4 block text-[32px] font-semibold leading-none"
        style={{ fontFamily: "var(--font-display)", color: accent }}
      >
        {count}
      </span>
      <span
        className="mt-2 block text-[14px] font-medium"
        style={{ color: "var(--color-ink)" }}
      >
        {label}
      </span>
      <span
        className="mt-1 block text-[11px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        {hint}
      </span>
      <span
        className="mt-4 inline-flex items-center gap-1 text-[12px] transition-transform group-hover:translate-x-1"
        style={{ fontFamily: "var(--font-mono)", color: accent }}
      >
        Open &rarr;
      </span>
    </Link>
  );
}
