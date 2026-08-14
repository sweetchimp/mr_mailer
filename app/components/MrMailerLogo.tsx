export function BrandMark({
  size = 36,
  className,
  id,
}: {
  size?: number;
  className?: string;
  id?: string;
}) {
  const gradId = id ?? "brand-mark-grad";
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#155EEF" />
          <stop offset="33%" stopColor="#168AFF" />
          <stop offset="66%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#6D5DFB" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill={`url(#${gradId})`} />
      <path
        d="M20 45V19L44 45V19"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <img
        src="/logo.png"
        alt="Mr Mailer logo"
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain" }}
      />
      <span
        className="font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontSize: size * 0.5 }}
      >
        Mr Mailer
      </span>
    </span>
  );
}
