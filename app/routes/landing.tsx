import { Link, redirect } from "react-router";
import { getSession } from "../lib/auth.server";
import type { Route } from "./+types/landing";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  if (session.get("userId")) {
    return redirect("/dashboard");
  }
  return null;
}

export default function Landing() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #071A49 0%, #155EEF 55%, #6D5DFB 100%)",
        position: "relative",
        overflow: "hidden",
        padding: "32px 20px",
        gap: "40px",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 110%, rgba(34,211,238,0.28) 0%, transparent 55%), radial-gradient(ellipse at 90% -10%, rgba(109,93,251,0.35) 0%, transparent 50%)",
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
        <img
          src="/logo.png"
          alt="Mr Mailer logo"
          style={{
            width: "clamp(200px, 55vw, 640px)",
            height: "clamp(200px, 55vw, 640px)",
            objectFit: "contain",
            display: "block",
            borderRadius: "clamp(20px, 4vw, 48px)",
            boxShadow: "0 24px 64px rgba(7, 26, 73, 0.35)",
          }}
        />
      </div>

      <Link
        to="/login"
        className="btn"
        style={{
          position: "relative",
          padding: "15px 40px",
          borderRadius: "12px",
          background: "#FFFFFF",
          color: "#0B1B3D",
          fontSize: "clamp(15px, 2vw, 17px)",
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        }}
      >
        Get Started
      </Link>
    </div>
  );
}
