/**
 * The Mr Mailer envelope mark.
 *
 * A single shared inline SVG rather than a raster `logo.png`: it stays crisp at
 * every size the app renders it (favicon through login hero), inherits the
 * palette, and removes the 885 KB PNG from the repo.
 *
 * The gradient id is fixed rather than generated. The mark is identical
 * everywhere it appears, so the duplicate ids a page with several marks
 * produces all resolve to the same definition — the alternative is `useId()`,
 * which is a client hook and would drag every renderer across the server/client
 * boundary for no visual difference.
 */
export function MrMailerMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="mm-env-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F3A5F" />
          <stop offset="1" stopColor="#3B5D8C" />
        </linearGradient>
      </defs>
      <rect
        x="5"
        y="12"
        width="54"
        height="40"
        rx="9"
        fill="#1F3A5F"
        fillOpacity="0.06"
        stroke="url(#mm-env-grad)"
        strokeWidth="3.5"
      />
      <path
        d="M9 17 L32 35 L55 17"
        fill="none"
        stroke="url(#mm-env-grad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="35" r="3.6" fill="#C08A2E" />
    </svg>
  );
}
