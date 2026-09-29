interface ProviderButtonProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

/**
 * `btn btn-outline` supplies the surface, border, radius, transitions and the
 * hover border/color change; only layout and an ink (rather than ink-soft)
 * label are set inline so the sign-in CTAs stay the highest-contrast thing on
 * the page. Setting `background` inline would beat the class's hover rule.
 */
export function ProviderButton({ href, icon, children }: ProviderButtonProps) {
  return (
    <a
      href={href}
      className="btn btn-outline w-full"
      style={{
        padding: "14px 20px",
        color: "var(--color-ink)",
        fontSize: "15px",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
      }}
    >
      <span style={{ display: "inline-flex" }}>{icon}</span>
      {children}
    </a>
  );
}
