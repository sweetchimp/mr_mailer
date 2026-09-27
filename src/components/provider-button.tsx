interface ProviderButtonProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function ProviderButton({ href, icon, children }: ProviderButtonProps) {
  return (
    <a
      href={href}
      className="btn w-full"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px 20px",
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: "10px",
        color: "var(--color-ink)",
        fontSize: "15px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s ease",
        fontFamily: "var(--font-body)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        textDecoration: "none",
      }}
    >
      <span style={{ display: "inline-flex", marginRight: "10px" }}>{icon}</span>
      {children}
    </a>
  );
}