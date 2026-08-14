export function Watermark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(120px, 24vw, 360px)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: "var(--color-ink)",
          opacity: 0.025,
          whiteSpace: "nowrap",
        }}
      >
        Mr Mailer
      </span>
    </div>
  );
}
