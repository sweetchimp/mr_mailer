import { MrMailerMascot } from "@/components/mr-mailer-logo";

/**
 * The faint mascot behind the app's content.
 *
 * `tile={false}` because a plate here would be a large pale rounded rectangle
 * across the whole viewport — at this opacity the shape is more noticeable than
 * the mark it is meant to be sitting behind.
 *
 * 560px rather than something larger because the source is only 740px wide, so
 * a bigger render would be upscaling a bitmap.
 */
export function Watermark() {
  return (
    <div
      aria-hidden
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
      {/* The invert is applied in globals.css for the dark theme only. The
          artwork is dark navy, which at 5% opacity over a dark surface is
          indistinguishable from the background. */}
      <div className="watermark-art" style={{ transform: "rotate(-12deg)", opacity: 0.05 }}>
        <MrMailerMascot size={560} tile={false} />
      </div>
    </div>
  );
}
