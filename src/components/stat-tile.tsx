import Link from "next/link";
import type { ReactNode } from "react";

const PALETTE = {
  high: {
    bg: "var(--color-priority-high-bg)",
    text: "var(--color-priority-high-text)",
    line: "var(--color-priority-high-line)",
  },
  medium: {
    bg: "var(--color-priority-medium-bg)",
    text: "var(--color-priority-medium-text)",
    line: "var(--color-priority-medium-line)",
  },
  low: {
    bg: "var(--color-priority-low-bg)",
    text: "var(--color-priority-low-text)",
    line: "var(--color-priority-low-line)",
  },
  card: {
    bg: "var(--color-card)",
    text: "var(--color-ink)",
    line: "var(--color-line)",
  },
} as const;

export type StatTone = keyof typeof PALETTE;

export function StatTile({
  label,
  value,
  href,
  tone = "card",
}: {
  label: string;
  value: ReactNode;
  href: string;
  tone?: StatTone;
}) {
  const colors = PALETTE[tone];

  return (
    <Link
      href={href}
      className="group block rounded-xl p-5 transition-all hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.line}`,
        outlineColor: "var(--color-brand-blue)",
      }}
    >
      <p
        className="text-[13px] font-medium"
        style={{ fontFamily: "var(--font-body)", color: colors.text }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)", color: colors.text }}
      >
        {value}
      </p>
      <p
        className="mt-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ fontFamily: "var(--font-mono)", color: colors.text }}
      >
        View &rarr;
      </p>
    </Link>
  );
}
