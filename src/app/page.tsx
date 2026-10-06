import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LegalFooter } from "@/components/legal-footer";
import { MrMailerLogo } from "@/components/mr-mailer-logo";
import { getSessionCookieName, verifySession } from "@/lib/session.server";

export default async function Landing() {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  const session = token ? await verifySession(token) : null;
  if (session?.userId) redirect("/dashboard");

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #16283F 0%, #1F3A5F 60%, #2E5688 100%)",
        position: "relative",
        overflow: "hidden",
        padding: "32px 20px",
        gap: "40px",
        // Set locally so the logo gets its light plate in both themes. This page
        // is a fixed navy gradient and never reads the theme tokens, so without
        // this the mark's navy artwork would sit on navy and all that would
        // survive is the gold. A local declaration beats the `:root` default.
        // Cast the key the way email-card.tsx does: React's CSSProperties has no
        // index signature for custom properties.
        ["--logo-tile-bg" as string]: "#FFFFFF",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 110%, rgba(192,138,46,0.24) 0%, transparent 55%), radial-gradient(ellipse at 90% -10%, rgba(94,133,180,0.32) 0%, transparent 50%)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            // Bounded against viewport *height* as well as width, which is the
            // part that is easy to miss. Sizing on width alone is fine on a tall
            // window and overflows on a short one: the lockup is 0.69 as tall as
            // it is wide, so at 520px it takes 359px, and with the button, the
            // 40px gaps and the page padding that leaves under 200px of slack.
            // Capping at 58vh keeps the whole stack on screen on a laptop in a
            // short window, and the vw term stops it becoming a thumbnail on a
            // phone.
            width: "min(92vw, 520px, 58vh)",
            // The lockup draws its own plate and radius, so the shadow is a
            // drop-shadow filter rather than a box shadow: a box shadow would
            // trace the wrapper's rectangle and square off the rounded plate.
            filter: "drop-shadow(0 20px 44px rgba(6, 14, 28, 0.45))",
          }}
        >
          <MrMailerLogo size="100%" priority />
        </div>
      </div>

      <Link
        href="/login"
        className="btn"
        style={{
          position: "relative",
          padding: "15px 40px",
          borderRadius: "12px",
          background: "#FFFFFF",
          color: "#181B21",
          fontSize: "clamp(15px, 2vw, 17px)",
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}
      >
        Get Started
      </Link>

      {/* Out of flow on purpose. The wrapper centres its children as a flex
          column, so an in-flow footer would either sit under the button or —
          if given `marginTop: "auto"` — swallow the free space and drag the
          whole lockup to the top. Absolutely positioned it stays at the
          bottom while the logo keeps its optical centre, and it comes last in
          the DOM so it paints above the decorative overlay. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "28px",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <LegalFooter variant="brand" />
      </div>
    </div>
  );
}
