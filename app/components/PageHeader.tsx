export function PageHeader({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
        >
          {kicker}
        </p>
        {title && (
          <h2
            className="mt-1 text-[20px] leading-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--color-ink)" }}
          >
            {title}
          </h2>
        )}
        {description && (
          <p className="mt-1 text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}>
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
