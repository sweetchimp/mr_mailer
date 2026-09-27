import Image from "next/image";

export function MrMailerLogo({
  size = 36,
  light = false,
  className,
}: {
  size?: number;
  light?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className ?? ""}`}
      style={{ color: light ? "#FFFFFF" : "var(--color-ink)" }}
    >
      <Image
        src="/logo.png"
        alt="Mr Mailer logo"
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain" }}
      />
      <span
        className="font-semibold tracking-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: size * 0.5,
        }}
      >
        Mr Mailer
      </span>
    </span>
  );
}
