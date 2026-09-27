import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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
        <Image
          src="/logo.png"
          alt="Mr Mailer logo"
          width={640}
          height={640}
          priority
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
        href="/login"
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
