const TONES = {
  danger: {
    bg: "var(--color-priority-high-bg)",
    line: "var(--color-priority-high-line)",
    text: "var(--color-priority-high-text)",
  },
  success: {
    bg: "var(--color-priority-low-bg)",
    line: "var(--color-priority-low-line)",
    text: "var(--color-priority-low-text)",
  },
  neutral: {
    bg: "var(--color-surface-soft)",
    line: "var(--color-line)",
    text: "var(--color-ink-soft)",
  },
} as const;

export type InlineAlertTone = keyof typeof TONES;

export function InlineAlert({
  title,
  children,
  tone = "neutral",
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  tone?: InlineAlertTone;
  className?: string;
}) {
  const colors = TONES[tone];
  return (
    <div
      className={`rounded-r-md border-l-[3px] p-4 ${className ?? ""}`}
      style={{ background: colors.bg, borderLeftColor: colors.line }}
    >
      {title && (
        <p className="text-sm font-medium" style={{ color: colors.text }}>
          {title}
        </p>
      )}
      {children && (
        <div className="text-[13px]" style={{ color: colors.text, opacity: 0.9 }}>
          {children}
        </div>
      )}
    </div>
  );
}
