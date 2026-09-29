import type { CSSProperties } from "react";

/**
 * "X / Y handled today" as an animated ring.
 *
 * The sweep is pure CSS: the two stroke-dashoffset endpoints are handed to the
 * ring-sweep keyframes as custom properties, so no client JS is needed and
 * `prefers-reduced-motion` (which zeroes animation durations) snaps it straight
 * to its value.
 */
export function ProgressRing({
  value,
  total,
  size = 132,
  stroke = 12,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const center = size / 2;

  const sweep = {
    "--ring-from": circumference.toFixed(2),
    "--ring-to": offset.toFixed(2),
  } as CSSProperties;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value} of ${total} handled today`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          className="ring-progress"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-brand-gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={sweep}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: size * 0.28,
            lineHeight: 1,
            color: "var(--color-ink)",
          }}
        >
          {value}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 400,
              fontSize: size * 0.16,
              color: "var(--color-ink-faint)",
            }}
          >
            /{total}
          </span>
        </span>
        <span
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-ink-faint)",
          }}
        >
          handled today
        </span>
      </div>
    </div>
  );
}
