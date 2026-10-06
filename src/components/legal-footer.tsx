import Link from "next/link";

type LegalFooterProps = {
  /**
   * `brand` is for the landing page, which paints a fixed navy gradient and
   * never reads the theme tokens — every color there has to be literal or the
   * links inherit `var(--color-ink)` and disappear into the background.
   */
  variant?: "app" | "brand";
  className?: string;
  /** Overridable because the app chrome footer is monospace throughout. */
  fontFamily?: string;
};

export function LegalFooter({
  variant = "app",
  className = "",
  fontFamily = "var(--font-body)",
}: LegalFooterProps) {
  const color =
    variant === "brand" ? "rgba(255, 255, 255, 0.72)" : "var(--color-ink-faint)";

  return (
    <nav
      aria-label="Legal"
      className={`flex items-center gap-2 text-[12px] ${className}`}
      style={{ fontFamily, color }}
    >
      <Link
        href="/privacy"
        className="underline-offset-2 hover:underline focus-visible:underline"
      >
        Privacy
      </Link>
      <span aria-hidden="true" style={{ opacity: 0.5 }}>
        ·
      </span>
      <Link
        href="/terms"
        className="underline-offset-2 hover:underline focus-visible:underline"
      >
        Terms
      </Link>
    </nav>
  );
}
