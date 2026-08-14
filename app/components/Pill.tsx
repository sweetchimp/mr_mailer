const TONES = {
  high: {
    bg: "var(--color-priority-high-bg)",
    text: "var(--color-priority-high-text)",
  },
  medium: {
    bg: "var(--color-priority-medium-bg)",
    text: "var(--color-priority-medium-text)",
  },
  low: {
    bg: "var(--color-priority-low-bg)",
    text: "var(--color-priority-low-text)",
  },
  neutral: {
    bg: "var(--color-surface-soft)",
    text: "var(--color-ink-soft)",
  },
} as const;

export type PillTone = keyof typeof TONES;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  const colors = TONES[tone];
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-px text-[10px] font-medium uppercase tracking-wide ${className ?? ""}`}
      style={{ fontFamily: "var(--font-mono)", background: colors.bg, color: colors.text }}
    >
      {children}
    </span>
  );
}
