import type { TickerItem } from "@/lib/ticker";

/**
 * The navy activity bar.
 *
 * The content is rendered twice and the track is translated by half its own
 * width, which is what makes the loop seamless (see ticker-scroll in
 * globals.css). `aria-hidden` because it is a decorative marquee whose facts
 * are also presented accessibly in the summary strip and tiles below it —
 * announcing the duplicated track would just read everything out twice.
 */
export function ActivityTicker({ items }: { items: TickerItem[] }) {
  const content: TickerItem[] =
    items.length > 0
      ? items
      : [{ id: "empty", kind: "email", text: "You're all caught up" }];

  return (
    <div
      className="ticker-viewport overflow-hidden"
      aria-hidden="true"
      style={{
        background: "var(--color-brand-navy)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div className="ticker-track" style={{ fontFamily: "var(--font-mono)" }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {content.map((item) => (
              <span
                key={`${copy}-${item.id}`}
                className="inline-flex items-center gap-2 px-5 py-2 text-[11px] tracking-wide"
                style={{ color: "rgba(255, 255, 255, 0.82)" }}
              >
                <span style={{ color: "var(--color-brand-gold)" }}>&#9670;</span>
                {item.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
