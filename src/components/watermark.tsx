import { MrMailerMark } from "@/components/mr-mailer-mark";

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
      <div style={{ transform: "rotate(-12deg)", opacity: 0.035 }}>
        <MrMailerMark size={640} />
      </div>
    </div>
  );
}
